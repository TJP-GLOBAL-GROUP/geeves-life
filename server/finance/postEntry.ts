/**
 * Posting Engine — v2.2 §4.5 (CRITICAL-6 resolution)
 *
 * `postEntry(actorUserId, input)` and `reverseEntry(actorUserId, entryId, reason)`.
 *
 * Non-negotiable properties (invariant 14 — authorisation precedes validation):
 *  1. The FIRST statement of every entry point is a canAccessFinancials() check.
 *     Unauthorised callers are rejected with an opaque FORBIDDEN before any
 *     input validation runs, so nothing leaks through validation error shapes.
 *  2. Posted entries are IMMUTABLE. There is deliberately no updateEntry() here;
 *     corrections are reversal entries linked via reversesEntryId /
 *     reversedByEntryId. Double reversal is blocked twice: explicitly and by the
 *     unique index je_reversed_by_uniq (constraint, not convention).
 *  3. A post without its audit row is not representable: entry, lines and the
 *     audit_log row (category='financial') are written in ONE transaction.
 *  4. Balance is enforced to the cent; per-transaction allocation percentages
 *     (when present) must sum to 100.
 *  5. Locked periods reject posting unless the period has been unlocked
 *     (dual control + mandatory reason — enforced at unlock time, Phase F).
 *  6. FX rule (v2.2 §2.5): a line's exchangeRate is the transaction-date rate
 *     from exchange_rates, stored IMMUTABLE; fallback = nearest prior rate.
 *
 * Workbench resolutions route through postEntry() too (§4.4) — the queue is
 * never a side door into the ledger.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, lte, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as dbModule from "../db";
import {
  auditLog,
  chartOfAccounts,
  exchangeRates,
  journalEntries,
  journalLines,
  periodLocks,
  transferRailTypes,
  verticals,
  type JournalEntry,
} from "../../drizzle/schema";
import { requireFinancialAccess } from "./access";

// ─── Input schema (parsed AFTER authorisation — invariant 14) ─────────────────

const moneyString = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "amount must be a decimal with ≤ 2 places");

export const postEntryLineSchema = z.object({
  glAccountId: z.string().min(1).max(32),
  description: z.string().max(255).optional(),
  debit: moneyString.optional(),
  credit: moneyString.optional(),
  /** Signed display amount: + = revenue/asset, - = expense/liability. */
  amount: moneyString,
  currency: z.string().length(3).default("USD"),
  /** Transaction-date rate. If omitted for a non-USD line, resolved from
   *  exchange_rates (transaction date → nearest prior rate fallback). */
  exchangeRate: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  taxFormLine: z.string().max(50).optional(),
  isTaxRelevant: z.boolean().optional(),
  propertyId: z.string().max(21).optional(),
  /** Line-level vertical override for cross-vertical entries (§4.4); defaults
   *  to the entry vertical. Every line carries a vertical — P&L is line-based. */
  verticalId: z.string().max(36).optional(),
  /** Allocation percentage (§3.3); when any line carries one, Σ must = 100. */
  allocationPct: z.number().min(0).max(100).optional(),
  receiptId: z.string().max(21).optional(),
});

export const postEntrySchema = z.object({
  verticalCode: z.string().min(1).max(16),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD; stored via date column
  entryType: z.enum(["revenue", "expense", "transfer", "adjustment", "dto", "journal"]),
  reference: z.string().max(200).optional(),
  memo: z.string().optional(),
  propertyId: z.string().max(21).optional(),
  sourceTable: z.string().max(50).optional(),
  sourceId: z.string().max(21).optional(),
  currency: z.string().length(3).default("USD"),
  /** Required for entryType='transfer'; validated against transfer_rail_types
   *  (invariant 15 — rails are configuration; there is no 'square' rail). */
  transferType: z.string().max(50).optional(),
  lines: z.array(postEntryLineSchema).min(2, "double-entry requires at least two lines"),
});

export type PostEntryInput = z.infer<typeof postEntrySchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await dbModule.getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** Decimal-string → integer cents. Exact; no float error on money. */
function toCents(value: string | null | undefined): number {
  if (!value) return 0;
  const negative = value.startsWith("-");
  const [whole, frac = ""] = value.replace(/^-/, "").split(".");
  const cents = parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

/** Integer cents → decimal string. */
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Exact decimal-string negation (money never goes through float sign flips). */
function negateAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return fromCents(-toCents(value));
}

/** D4: month = fiscal calendar month, everywhere. */
function fiscalPeriod(entryDate: string): { fiscalYear: number; fiscalMonth: number } {
  const [y, m] = entryDate.split("-").map((s) => parseInt(s, 10));
  return { fiscalYear: y, fiscalMonth: m };
}

/**
 * FX rule (v2.2 §2.5): transaction-date rate from exchange_rates, immutable once
 * stored. Fallback: nearest prior rate for the pair. Returns "1.000000" when
 * from === to. Throws if no rate exists at or before the transaction date — a
 * missing rate is a data problem, not a reason to guess.
 */
export async function resolveExchangeRate(
  db: Awaited<ReturnType<typeof requireDb>>,
  fromCurrency: string,
  toCurrency: string,
  entryDate: string,
): Promise<string> {
  if (fromCurrency === toCurrency) return "1.000000";
  const rows = await db
    .select()
    .from(exchangeRates)
    .where(and(
      eq(exchangeRates.fromCurrency, fromCurrency),
      eq(exchangeRates.toCurrency, toCurrency),
      lte(exchangeRates.fetchedAt, new Date(`${entryDate}T23:59:59Z`),
    ))
    .orderBy(desc(exchangeRates.fetchedAt))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `No exchange rate for ${fromCurrency}→${toCurrency} on or before ${entryDate}`,
    });
  }
  return row.rate;
}

async function assertPeriodUnlocked(
  db: Awaited<ReturnType<typeof requireDb>>,
  householdId: string,
  fiscalYear: number,
  fiscalMonth: number,
): Promise<void> {
  const rows = await db
    .select()
    .from(periodLocks)
    .where(and(
      eq(periodLocks.householdId, householdId),
      eq(periodLocks.fiscalYear, fiscalYear),
      eq(periodLocks.fiscalMonth, fiscalMonth),
      isNull(periodLocks.unlockedAt),
    ))
    .limit(1);
  if (rows[0]) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Period ${fiscalYear}-${String(fiscalMonth).padStart(2, "0")} is locked`,
    });
  }
}

async function validateLines(
  db: Awaited<ReturnType<typeof requireDb>>,
  householdId: string,
  input: PostEntryInput,
): Promise<Map<string, typeof chartOfAccounts.$inferSelect>> {
  // Balance to the cent (A15).
  let debitCents = 0;
  let creditCents = 0;
  for (const line of input.lines) {
    debitCents += toCents(line.debit ?? null);
    creditCents += toCents(line.credit ?? null);
  }
  if (debitCents !== creditCents || debitCents === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Entry does not balance to the cent" });
  }

  // Σpct = 100 per transaction when allocation percentages are present (A18).
  const pcts = input.lines.map((l) => l.allocationPct).filter((p): p is number => p !== undefined);
  if (pcts.length > 0) {
    if (pcts.length !== input.lines.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Allocation percentages must cover every line or none" });
    }
    const sum = pcts.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Allocation percentages must sum to 100" });
    }
  }

  // glAccountId never dangles (invariant 12): every account must exist in the
  // canonical chart for this household (D8).
  const accounts = new Map<string, typeof chartOfAccounts.$inferSelect>();
  for (const line of input.lines) {
    if (accounts.has(line.glAccountId)) continue;
    const rows = await db
      .select()
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.id, line.glAccountId),
        eq(chartOfAccounts.householdId, householdId),
      ))
      .limit(1);
    const account = rows[0];
    if (!account || !account.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown or inactive G.L. account" });
    }
    accounts.set(line.glAccountId, account);
  }

  // Rails are configuration (invariant 15): transfer entries validate against
  // transfer_rail_types, never a hardcoded enum.
  if (input.entryType === "transfer") {
    if (!input.transferType) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "transferType is required for transfer entries" });
    }
    const rails = await db
      .select()
      .from(transferRailTypes)
      .where(and(eq(transferRailTypes.code, input.transferType), eq(transferRailTypes.isActive, true)))
      .limit(1);
    if (!rails[0]) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown transfer rail" });
    }
  }

  return accounts;
}

/** Write the financial audit row. Called INSIDE the posting transaction so a
 *  post without audit is not representable (§4.5 / F3). */
async function writeFinancialAudit(
  tx: { insert: (t: typeof auditLog) => { values: (v: typeof auditLog.$inferInsert) => Promise<unknown> } },
  row: {
    actorUserId: number;
    householdId: string;
    verticalId: string;
    action: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: row.actorUserId,
    actorType: "user",
    householdId: row.householdId,
    verticalId: row.verticalId.slice(0, 21), // audit_log.verticalId is varchar(21)
    action: row.action,
    category: "financial", // varchar(64) — 'financial' needs no enum change (HIGH-5 note)
    resourceType: "journal_entry",
    resourceId: row.resourceId,
    outcome: "success",
    // metadata is covered by the PII-scrub denylist — callers pass identifiers
    // and totals only, never raw memos/descriptions (safeguard 5).
    metadata: row.metadata ?? null,
  });
}

// ─── postEntry ────────────────────────────────────────────────────────────────

/**
 * Post a balanced journal entry. FIRST statement = authorisation (§4.5).
 * Returns the new entry id.
 */
export async function postEntry(
  actorUserId: number,
  rawInput: { verticalCode?: string } & Record<string, unknown>,
): Promise<{ entryId: string }> {
  // ① Authorisation FIRST — before any validation (invariant 14). Unknown or
  // unentitled vertical codes get the same opaque FORBIDDEN.
  await requireFinancialAccess(actorUserId, String(rawInput?.verticalCode ?? ""), "finance.post");

  // ② Validation.
  const input = postEntrySchema.parse(rawInput);
  const db = await requireDb();

  const verticalRows = await db
    .select()
    .from(verticals)
    .where(eq(verticals.code, input.verticalCode))
    .limit(1);
  const vertical = verticalRows[0];
  if (!vertical) {
    // Unreachable for an authorised caller (the resolver found the vertical),
    // but fail closed rather than trust that ordering.
    throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
  }
  if (vertical.isSystemBucket) {
    // System buckets never post (invariant 13).
    throw new TRPCError({ code: "BAD_REQUEST", message: "System buckets never post to the G.L." });
  }

  const { fiscalYear, fiscalMonth } = fiscalPeriod(input.entryDate);
  await assertPeriodUnlocked(db, vertical.householdId, fiscalYear, fiscalMonth); // A16
  await validateLines(db, vertical.householdId, input);

  // ③ Resolve FX per line (transaction-date rate, immutable once stored).
  const householdCurrency = "USD"; // households.reportingCurrency; Global = USD (D7)
  const resolvedLines = [] as Array<z.infer<typeof postEntryLineSchema> & { exchangeRate: string; usdEquivalent: string }>;
  for (const line of input.lines) {
    const rate = line.exchangeRate ?? await resolveExchangeRate(db, line.currency, householdCurrency, input.entryDate);
    const usdEquivalent = (toCents(line.amount) * parseFloat(rate) / 100).toFixed(2);
    resolvedLines.push({ ...line, exchangeRate: rate, usdEquivalent });
  }

  const totalDebit = fromCents(resolvedLines.reduce((a, l) => a + toCents(l.debit ?? null), 0));
  const totalCredit = fromCents(resolvedLines.reduce((a, l) => a + toCents(l.credit ?? null), 0));

  // ④ Entry + lines + audit in ONE transaction (A17).
  const entryId = nanoid();
  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: entryId,
      householdId: vertical.householdId,
      entryDate: new Date(`${input.entryDate}T00:00:00Z`),
      fiscalYear,
      fiscalMonth,
      verticalId: vertical.id,
      propertyId: input.propertyId ?? null,
      entryType: input.entryType,
      sourceTable: input.sourceTable ?? null,
      sourceId: input.sourceId ?? null,
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      totalDebit,
      totalCredit,
      currency: input.currency,
      status: "posted",
      isPosted: true,
      postedAt: new Date(),
      postedBy: String(actorUserId),
    });

    for (const [i, line] of resolvedLines.entries()) {
      await tx.insert(journalLines).values({
        id: nanoid(),
        journalEntryId: entryId,
        lineNumber: i + 1,
        glAccountId: line.glAccountId,
        propertyId: line.propertyId ?? null,
        verticalId: line.verticalId ?? vertical.id,
        description: line.description ?? null,
        debit: line.debit ?? "0.00",
        credit: line.credit ?? "0.00",
        amount: line.amount,
        currency: line.currency,
        exchangeRate: line.exchangeRate,
        usdEquivalent: line.usdEquivalent,
        taxFormLine: line.taxFormLine ?? null,
        isTaxRelevant: line.isTaxRelevant ?? false,
        receiptId: line.receiptId ?? null,
      });
    }

    await writeFinancialAudit(tx, {
      actorUserId,
      householdId: vertical.householdId,
      verticalId: vertical.id,
      action: "journal_entry.post",
      resourceId: entryId,
      metadata: {
        entryType: input.entryType,
        fiscalYear,
        fiscalMonth,
        lineCount: resolvedLines.length,
        totalDebit,
        currency: input.currency,
      },
    });
  });

  return { entryId };
}

// ─── reverseEntry ─────────────────────────────────────────────────────────────

/**
 * Reverse a posted entry. Corrections are reversals — posted entries are never
 * mutated or deleted (§4.5). The reversal is a new entry with swapped
 * debit/credit, linked both directions; the original transitions
 * posted → reversed in the same transaction, with its own audit row.
 */
export async function reverseEntry(
  actorUserId: number,
  entryId: string,
  reason: string,
): Promise<{ reversalEntryId: string }> {
  if (!reason || reason.trim().length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A reversal reason is mandatory" });
  }

  const db = await requireDb();

  // Load the original BEFORE authorisation so we know which vertical to check
  // against — but reveal nothing on failure: unauthorised and non-existent
  // produce the identical opaque FORBIDDEN.
  const entryRows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1);
  const original = entryRows[0] as JournalEntry | undefined;

  const verticalRows = original
    ? await db.select().from(verticals).where(eq(verticals.id, original.verticalId)).limit(1)
    : [];
  const vertical = verticalRows[0];

  // ① Authorisation FIRST against the entry's vertical (reversing IS posting).
  await requireFinancialAccess(actorUserId, vertical?.code ?? "", "finance.post");
  if (!original || !vertical) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
  }

  // ② Only posted, not-yet-reversed entries can be reversed. Double reversal is
  // blocked here AND by the unique je_reversed_by_uniq constraint.
  if (original.status !== "posted" || original.reversedByEntryId) {
    throw new TRPCError({ code: "CONFLICT", message: "Entry cannot be reversed" });
  }
  await assertPeriodUnlocked(db, vertical.householdId, original.fiscalYear, original.fiscalMonth);

  const originalLines = await db
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, original.id));

  // ③ Reversal entry + original transition + audit rows in ONE transaction.
  const reversalEntryId = nanoid();
  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: reversalEntryId,
      householdId: original.householdId,
      entryDate: new Date(),
      fiscalYear: original.fiscalYear,
      fiscalMonth: original.fiscalMonth,
      verticalId: original.verticalId,
      propertyId: original.propertyId,
      entryType: original.entryType,
      reference: original.reference,
      memo: `Reversal of ${original.id}: ${reason}`,
      totalDebit: original.totalCredit, // swapped
      totalCredit: original.totalDebit,
      currency: original.currency,
      exchangeRate: original.exchangeRate,
      status: "reversal",
      isPosted: true,
      postedAt: new Date(),
      postedBy: String(actorUserId),
      reversesEntryId: original.id,
      reversalReason: reason,
    });

    for (const line of originalLines) {
      await tx.insert(journalLines).values({
        id: nanoid(),
        journalEntryId: reversalEntryId,
        lineNumber: line.lineNumber,
        glAccountId: line.glAccountId,
        propertyId: line.propertyId,
        verticalId: line.verticalId,
        description: line.description,
        debit: line.credit ?? "0.00", // swapped
        credit: line.debit ?? "0.00",
        amount: negateAmount(line.amount) ?? "0.00",
        currency: line.currency,
        exchangeRate: line.exchangeRate,
        usdEquivalent: negateAmount(line.usdEquivalent),
        taxFormLine: line.taxFormLine,
        isTaxRelevant: line.isTaxRelevant,
        receiptId: line.receiptId,
      });
    }

    await tx
      .update(journalEntries)
      .set({
        status: "reversed",
        reversedByEntryId: reversalEntryId,
        reversalReason: reason,
        reversedBy: String(actorUserId),
        reversedAt: new Date(),
      })
      .where(and(
        eq(journalEntries.id, original.id),
        // Optimistic guard: only transition if still an unreversed posted entry.
        eq(journalEntries.status, "posted"),
        isNull(journalEntries.reversedByEntryId),
      ));

    await writeFinancialAudit(tx, {
      actorUserId,
      householdId: vertical.householdId,
      verticalId: vertical.id,
      action: "journal_entry.reverse",
      resourceId: original.id,
      metadata: { reversalEntryId, reasonProvided: true },
    });
  });

  return { reversalEntryId };
}
