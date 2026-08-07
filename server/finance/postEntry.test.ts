/**
 * Posting Engine — Unit Tests (v2.2 §4.5, checklist A6/A8/A14–A18)
 *
 * Covers the non-negotiable properties of postEntry()/reverseEntry():
 *  A6  — posted entries are immutable: there is no update path; corrections
 *        are reversal entries only (reverseEntry swaps debit/credit and
 *        transitions the original posted → reversed in the same transaction).
 *  A14 — authorisation is the FIRST statement: requireFinancialAccess runs
 *        before any validation or DB access; unauthorised callers get an
 *        opaque FORBIDDEN and nothing else executes.
 *  A15 — balance is enforced to the cent (±1 cent rejected).
 *  A16 — a locked fiscal period rejects posting.
 *  A17 — entry + lines + audit row are written in ONE transaction; a failure
 *        mid-transaction aborts the whole post (all-or-none).
 *  A18 — allocation percentages are all-or-none and must sum to 100.
 *  A8  — FX: transaction-date rate from exchange_rates with nearest-prior
 *        fallback; stored immutable on the line; missing rate rejects.
 *
 * Style/mocks mirror server/finance/access.test.ts: the DB wrapper and the
 * access resolver are mocked; the engine is exercised against a chainable
 * fake query builder keyed by drizzle table object.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./access", () => ({
  requireFinancialAccess: vi.fn(),
}));

import { getDb } from "../db";
import { requireFinancialAccess } from "./access";
import * as postEntryModule from "./postEntry";
import { postEntry, reverseEntry, resolveExchangeRate } from "./postEntry";
import {
  auditLog,
  chartOfAccounts,
  exchangeRates,
  journalEntries,
  journalLines,
  periodLocks,
  transferRailTypes,
  verticals,
} from "../../drizzle/schema";

const getDbMock = vi.mocked(getDb);
const authMock = vi.mocked(requireFinancialAccess);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HOUSEHOLD = "V8lk3KJatvxBTWURf4uo9"; // TJ Perkins Global (D7)
const VERTICAL = { id: "c3pW-Cxhm9WAQZ17pTMb3", householdId: HOUSEHOLD, code: "MB", isSystemBucket: false };
const ACCT_1 = { id: "acct-1", householdId: HOUSEHOLD, isActive: true };
const ACCT_2 = { id: "acct-2", householdId: HOUSEHOLD, isActive: true };

const baseInput = {
  verticalCode: "MB",
  entryDate: "2026-03-15",
  entryType: "expense",
  memo: "Flour supplier",
  lines: [
    { glAccountId: "acct-1", debit: "100.00", amount: "100.00" },
    { glAccountId: "acct-2", credit: "100.00", amount: "-100.00" },
  ],
};

// ─── Fake DB ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface FakeDb {
  db: unknown;
  inserted: Array<{ table: unknown; values: Row }>;
  updated: Array<{ table: unknown; set: Row }>;
  transactionMock: ReturnType<typeof vi.fn>;
  tx: { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}

/** Chainable fake: select().from(t).where(...).orderBy(...).limit(n) — rows are
 *  looked up by table object from `results`; a chain awaited without .limit()
 *  resolves to all rows for the table (mirrors reverseEntry's line load). */
function makeDb(results: Map<object, Row[]>, opts: { failOnSecondLineInsert?: boolean } = {}): FakeDb {
  const inserted: FakeDb["inserted"] = [];
  const updated: FakeDb["updated"] = [];
  let lineInsertCount = 0;
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: async (values: Row) => {
        if (opts.failOnSecondLineInsert && table === journalLines) {
          lineInsertCount += 1;
          if (lineInsertCount === 2) throw new Error("simulated mid-transaction failure");
        }
        inserted.push({ table, values });
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (set: Row) => {
        updated.push({ table, set });
        return { where: async () => undefined };
      },
    })),
  };
  const db = {
    select: () => {
      let table: object | null = null;
      const rowsFor = () => (table ? results.get(table) ?? [] : []);
      const chain: Record<string, unknown> = {
        from: (t: object) => {
          table = t;
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: async (n: number) => rowsFor().slice(0, n),
        then: (resolve: (v: Row[]) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(rowsFor()).then(resolve, reject),
      };
      return chain;
    },
  };
  const transactionMock = vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx));
  (db as Record<string, unknown>).transaction = transactionMock;
  return { db, inserted, updated, transactionMock, tx };
}

function happyPath(results: Partial<Record<string, Row[]>> = {}): FakeDb {
  const map = new Map<object, Row[]>([
    [verticals, results.verticals ?? [VERTICAL]],
    [periodLocks, results.periodLocks ?? []],
    [chartOfAccounts, results.chartOfAccounts ?? [ACCT_1, ACCT_2]],
    [transferRailTypes, results.transferRailTypes ?? []],
    [exchangeRates, results.exchangeRates ?? []],
    [journalEntries, results.journalEntries ?? []],
    [journalLines, results.journalLines ?? []],
  ]);
  return makeDb(map);
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(undefined);
});

function expectTrpcError(e: unknown, code: string) {
  expect(e).toBeInstanceOf(TRPCError);
  expect((e as TRPCError).code).toBe(code);
}

// ─── A6 — posted entries are immutable; corrections are reversals only ────────

describe("A6 — immutability: no update path, reversal-only corrections", () => {
  it("the module exposes no update/delete entry point", () => {
    expect((postEntryModule as Record<string, unknown>).updateEntry).toBeUndefined();
    expect((postEntryModule as Record<string, unknown>).deleteEntry).toBeUndefined();
    expect(typeof postEntryModule.reverseEntry).toBe("function");
  });

  it("postEntry never issues an UPDATE against journal_entries", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    await postEntry(1, baseInput);
    expect(fake.tx.update).not.toHaveBeenCalled();
  });

  it("reverseEntry writes a swapped reversal entry and transitions the original posted → reversed", async () => {
    const original = {
      id: "entry-1",
      householdId: HOUSEHOLD,
      verticalId: VERTICAL.id,
      fiscalYear: 2026,
      fiscalMonth: 3,
      entryType: "expense",
      status: "posted",
      reversedByEntryId: null,
      totalDebit: "100.00",
      totalCredit: "100.00",
      currency: "USD",
      exchangeRate: "1.000000",
      reference: null,
      propertyId: null,
    };
    const originalLines = [
      {
        lineNumber: 1, glAccountId: "acct-1", propertyId: null, verticalId: VERTICAL.id,
        description: "Flour", debit: "100.00", credit: "0.00", amount: "100.00",
        currency: "USD", exchangeRate: "1.000000", usdEquivalent: "100.00",
        taxFormLine: null, isTaxRelevant: false, receiptId: null,
      },
    ];
    const fake = happyPath({ journalEntries: [original], journalLines: originalLines });
    getDbMock.mockResolvedValue(fake.db as never);

    const { reversalEntryId } = await reverseEntry(1, "entry-1", "Duplicate posting");

    const reversal = fake.inserted.find((r) => r.table === journalEntries);
    expect(reversal).toBeDefined();
    expect(reversal!.values.id).toBe(reversalEntryId);
    expect(reversal!.values.status).toBe("reversal");
    expect(reversal!.values.reversesEntryId).toBe("entry-1");
    expect(reversal!.values.totalDebit).toBe("100.00"); // swapped from credit
    expect(reversal!.values.reversalReason).toBe("Duplicate posting");

    const reversalLine = fake.inserted.find((r) => r.table === journalLines);
    expect(reversalLine!.values.debit).toBe("0.00"); // swapped
    expect(reversalLine!.values.credit).toBe("100.00");
    expect(reversalLine!.values.amount).toBe("-100.00");

    const transition = fake.updated.find((r) => r.table === journalEntries);
    expect(transition).toBeDefined();
    expect(transition!.set.status).toBe("reversed");
    expect(transition!.set.reversedByEntryId).toBe(reversalEntryId);

    const audits = fake.inserted.filter((r) => r.table === auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0].values.action).toBe("journal_entry.reverse");
  });

  it("double reversal is rejected (already-reversed entries cannot be reversed again)", async () => {
    const original = {
      id: "entry-1", householdId: HOUSEHOLD, verticalId: VERTICAL.id,
      fiscalYear: 2026, fiscalMonth: 3, status: "reversed",
      reversedByEntryId: "entry-2", entryType: "expense",
    };
    const fake = happyPath({ journalEntries: [original] });
    getDbMock.mockResolvedValue(fake.db as never);

    await reverseEntry(1, "entry-1", "again").then(
      () => { throw new Error("should have thrown"); },
      (e) => expectTrpcError(e, "CONFLICT"),
    );
  });

  it("a reversal reason is mandatory", async () => {
    await reverseEntry(1, "entry-1", "  ").then(
      () => { throw new Error("should have thrown"); },
      (e) => expectTrpcError(e, "BAD_REQUEST"),
    );
    expect(authMock).not.toHaveBeenCalled();
  });
});

// ─── A14 — authorisation is the FIRST statement ───────────────────────────────

describe("A14 — auth precedes validation (invariant 14)", () => {
  it("requireFinancialAccess is called before any DB access on a valid post", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    await postEntry(1, baseInput);
    expect(authMock).toHaveBeenCalledWith(1, "MB", "finance.post");
    const authOrder = authMock.mock.invocationCallOrder[0];
    const dbOrder = getDbMock.mock.invocationCallOrder[0];
    expect(authOrder).toBeLessThan(dbOrder);
  });

  it("unauthorised caller gets opaque FORBIDDEN before ANY validation — even with malformed input", async () => {
    authMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Forbidden" }));
    // Malformed: no lines, bad date, unknown type — validation must never run.
    const garbage = { verticalCode: "MB", entryDate: "not-a-date", entryType: "nope" };
    await postEntry(1, garbage).then(
      () => { throw new Error("should have thrown"); },
      (e) => {
        expectTrpcError(e, "FORBIDDEN");
        expect((e as TRPCError).message).toBe("Forbidden"); // nothing leaks via error shape
      },
    );
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

// ─── A15 — cent-exact balance ─────────────────────────────────────────────────

describe("A15 — balance enforced to the cent", () => {
  it.each([
    ["100.01", "one cent over"],
    ["99.99", "one cent under"],
  ])("rejects an entry out of balance by ±1 cent (%s: %s)", async (credit) => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    const input = {
      ...baseInput,
      lines: [
        { glAccountId: "acct-1", debit: "100.00", amount: "100.00" },
        { glAccountId: "acct-2", credit, amount: "-100.00" },
      ],
    };
    await postEntry(1, input).then(
      () => { throw new Error("should have thrown"); },
      (e) => {
        expectTrpcError(e, "BAD_REQUEST");
        expect((e as TRPCError).message).toMatch(/balance to the cent/);
      },
    );
    expect(fake.transactionMock).not.toHaveBeenCalled();
  });

  it("accepts an exactly balanced entry", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    const { entryId } = await postEntry(1, baseInput);
    expect(typeof entryId).toBe("string");
    expect(entryId.length).toBeGreaterThan(0);
  });
});

// ─── A16 — locked period rejects ──────────────────────────────────────────────

describe("A16 — locked period rejects posting", () => {
  it("rejects when a period_locks row exists for the entry's fiscal period", async () => {
    const lock = { id: "lock-1", householdId: HOUSEHOLD, fiscalYear: 2026, fiscalMonth: 3, unlockedAt: null };
    const fake = happyPath({ periodLocks: [lock] });
    getDbMock.mockResolvedValue(fake.db as never);
    await postEntry(1, baseInput).then(
      () => { throw new Error("should have thrown"); },
      (e) => {
        expectTrpcError(e, "PRECONDITION_FAILED");
        expect((e as TRPCError).message).toMatch(/2026-03 is locked/);
      },
    );
    expect(fake.transactionMock).not.toHaveBeenCalled();
  });

  it("posts into an unlocked period (lock row with unlockedAt set does not block)", async () => {
    // The period query filters isNull(unlockedAt); an unlocked lock returns no row.
    const fake = happyPath({ periodLocks: [] });
    getDbMock.mockResolvedValue(fake.db as never);
    await expect(postEntry(1, baseInput)).resolves.toBeDefined();
  });
});

// ─── A17 — single transaction: entry + lines + audit ──────────────────────────

describe("A17 — entry + lines + audit in ONE transaction", () => {
  it("writes the entry, both lines and the financial audit row inside a single transaction", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    const { entryId } = await postEntry(1, baseInput);

    expect(fake.transactionMock).toHaveBeenCalledTimes(1);

    const entries = fake.inserted.filter((r) => r.table === journalEntries);
    const lines = fake.inserted.filter((r) => r.table === journalLines);
    const audits = fake.inserted.filter((r) => r.table === auditLog);
    expect(entries).toHaveLength(1);
    expect(lines).toHaveLength(2);
    expect(audits).toHaveLength(1);

    expect(entries[0].values.id).toBe(entryId);
    expect(entries[0].values.status).toBe("posted");
    expect(entries[0].values.householdId).toBe(HOUSEHOLD);
    expect(lines.every((l) => l.values.journalEntryId === entryId)).toBe(true);
    expect(audits[0].values.category).toBe("financial");
    expect(audits[0].values.action).toBe("journal_entry.post");
    expect(audits[0].values.resourceId).toBe(entryId);
  });

  it("a failure mid-transaction rejects the whole post (no partial commit surface)", async () => {
    const fake = makeDb(new Map<object, Row[]>([
      [verticals, [VERTICAL]],
      [periodLocks, []],
      [chartOfAccounts, [ACCT_1, ACCT_2]],
    ]), { failOnSecondLineInsert: true });
    getDbMock.mockResolvedValue(fake.db as never);
    await expect(postEntry(1, baseInput)).rejects.toThrow("simulated mid-transaction failure");
    expect(fake.transactionMock).toHaveBeenCalledTimes(1);
    // The audit row must never have been written after the failing line insert.
    expect(fake.inserted.filter((r) => r.table === auditLog)).toHaveLength(0);
  });
});

// ─── A18 — allocation percentages: all-or-none, Σ = 100 ───────────────────────

describe("A18 — Σ allocationPct = 100, all-or-none", () => {
  const withPcts = (pcts: Array<number | undefined>) => ({
    ...baseInput,
    lines: [
      { glAccountId: "acct-1", debit: "100.00", amount: "100.00", allocationPct: pcts[0] },
      { glAccountId: "acct-2", credit: "100.00", amount: "-100.00", allocationPct: pcts[1] },
    ],
  });

  it("rejects partial coverage (pct on some lines only)", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    await postEntry(1, withPcts([100, undefined])).then(
      () => { throw new Error("should have thrown"); },
      (e) => expectTrpcError(e, "BAD_REQUEST"),
    );
    expect(fake.transactionMock).not.toHaveBeenCalled();
  });

  it.each([[60, 39], [60, 41]])("rejects Σ ≠ 100 (%s + %s)", async (a, b) => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    await postEntry(1, withPcts([a, b])).then(
      () => { throw new Error("should have thrown"); },
      (e) => {
        expectTrpcError(e, "BAD_REQUEST");
        expect((e as TRPCError).message).toMatch(/sum to 100/);
      },
    );
  });

  it("accepts Σ = 100 across all lines", async () => {
    const fake = happyPath();
    getDbMock.mockResolvedValue(fake.db as never);
    await expect(postEntry(1, withPcts([60, 40]))).resolves.toBeDefined();
  });
});

// ─── A8 — FX: transaction-date rate, nearest-prior fallback, immutable ────────

describe("A8 — FX transaction-date rate with nearest-prior fallback", () => {
  it("same-currency lines resolve to 1.000000 without touching the DB", async () => {
    const fake = happyPath();
    const rate = await resolveExchangeRate(fake.db as never, "USD", "USD", "2026-03-15");
    expect(rate).toBe("1.000000");
  });

  it("resolves the nearest rate at or before the transaction date (desc order, limit 1)", async () => {
    // exchange_rates rows are returned by the fake in query order; the engine
    // orders by fetchedAt DESC and takes the first — the nearest prior rate.
    const fake = happyPath({
      exchangeRates: [{ fromCurrency: "JMD", toCurrency: "USD", rate: "0.0064", fetchedAt: new Date("2026-03-14T00:00:00Z") }],
    });
    const rate = await resolveExchangeRate(fake.db as never, "JMD", "USD", "2026-03-15");
    expect(rate).toBe("0.0064");
  });

  it("a missing rate rejects — a missing rate is a data problem, never a guess", async () => {
    const fake = happyPath({ exchangeRates: [] });
    await resolveExchangeRate(fake.db as never, "JMD", "USD", "2026-03-15").then(
      () => { throw new Error("should have thrown"); },
      (e) => expectTrpcError(e, "PRECONDITION_FAILED"),
    );
  });

  it("postEntry stamps the resolved rate on the line (stored immutable at write time)", async () => {
    const fake = happyPath({
      exchangeRates: [{ fromCurrency: "JMD", toCurrency: "USD", rate: "0.0064", fetchedAt: new Date("2026-03-14T00:00:00Z") }],
    });
    getDbMock.mockResolvedValue(fake.db as never);
    const input = {
      ...baseInput,
      currency: "JMD",
      lines: [
        { glAccountId: "acct-1", debit: "100.00", amount: "100.00", currency: "JMD" },
        { glAccountId: "acct-2", credit: "100.00", amount: "-100.00", currency: "JMD" },
      ],
    };
    await postEntry(1, input);
    const lines = fake.inserted.filter((r) => r.table === journalLines);
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l.values.exchangeRate).toBe("0.0064");
      expect(l.values.usdEquivalent).toBeDefined();
    }
  });

  it("an explicitly supplied rate is used as-is (no exchange_rates lookup)", async () => {
    const fake = happyPath(); // exchangeRates empty — a lookup would reject
    getDbMock.mockResolvedValue(fake.db as never);
    const input = {
      ...baseInput,
      lines: [
        { glAccountId: "acct-1", debit: "100.00", amount: "100.00", currency: "JMD", exchangeRate: "0.0065" },
        { glAccountId: "acct-2", credit: "100.00", amount: "-100.00", currency: "JMD", exchangeRate: "0.0065" },
      ],
    };
    await expect(postEntry(1, input)).resolves.toBeDefined();
    const lines = fake.inserted.filter((r) => r.table === journalLines);
    expect(lines[0].values.exchangeRate).toBe("0.0065");
  });
});
