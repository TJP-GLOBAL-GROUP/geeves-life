/**
 * Financial Access Resolver — Unit Tests (v2.2 §4, checklist A13)
 *
 * Exhaustive suite over the pure §4.3 matrix: 6 roles × 7 capabilities ×
 * {no row, none, blind, read_only, full} access levels, plus overrides,
 * financial data policies, system buckets, household boundary, alias
 * resolution, and the cross-vertical redaction helper.
 *
 * Written BEFORE the first financial procedure (Manus CRITICAL-5 resolution):
 * every unexpected state must deny — the resolver fails closed.
 */
import { describe, it, expect, vi } from "vitest";

// The DB wrapper must fail closed when the database is unavailable.
vi.mock("../db", () => ({
  getDb: async () => null,
  getHouseholdMemberByUserId: async () => null,
}));

import {
  evaluateFinancialAccess,
  canAccessFinancials,
  resolveFinanceAlias,
  isFinanceCapability,
  financeRedactedLabel,
  redactJournalLine,
  FINANCE_VERTICAL_CAPABILITIES,
  FINANCE_GLOBAL_CAPABILITIES,
  type FinancialAccessContext,
  type FinanceAccessLevel,
  type FinanceCapability,
} from "./access";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HOUSEHOLD = "V8lk3KJatvxBTWURf4uo9"; // TJ Perkins Global (D7)
const OTHER_HOUSEHOLD = "YouIQoAP6nmcPNljVdUis"; // legacy Fam household
const VERTICAL_ID = "c3pW-Cxhm9WAQZ17pTMb3";

function makeCtx(overrides: Partial<FinancialAccessContext> = {}): FinancialAccessContext {
  return {
    member: { id: "mem-1", role: "member", status: "active", householdId: HOUSEHOLD },
    vertical: { id: VERTICAL_ID, householdId: HOUSEHOLD, isSystemBucket: false },
    overrideGranted: null,
    accessLevel: null,
    financialPolicy: null,
    isFinancialOwner: false,
    ...overrides,
  };
}

function withRole(role: string, accessLevel: FinanceAccessLevel | null): FinancialAccessContext {
  return makeCtx({ member: { id: "mem-1", role, status: "active", householdId: HOUSEHOLD }, accessLevel });
}

const ALL_CAPS: FinanceCapability[] = [
  ...FINANCE_VERTICAL_CAPABILITIES,
  ...FINANCE_GLOBAL_CAPABILITIES,
];

// ─── Fail-closed primitives ──────────────────────────────────────────────────

describe("resolver — fail-closed on unexpected state", () => {
  it("denies when there is no member row", () => {
    for (const cap of ALL_CAPS) {
      expect(evaluateFinancialAccess(makeCtx({ member: null }), cap)).toBe(false);
    }
  });

  it("denies non-active members (invited/inactive/removed)", () => {
    for (const status of ["invited", "inactive", "removed"]) {
      const ctx = makeCtx({
        member: { id: "mem-1", role: "household_admin", status, householdId: HOUSEHOLD },
        accessLevel: "full",
      });
      for (const cap of ALL_CAPS) {
        expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
      }
    }
  });

  it("denies when the vertical does not resolve (unknown code)", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "household_admin", status: "active", householdId: HOUSEHOLD },
      vertical: null,
    });
    for (const cap of FINANCE_VERTICAL_CAPABILITIES) {
      expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
    }
  });

  it("denies across the household boundary (D7) — even for household_admin", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "household_admin", status: "active", householdId: OTHER_HOUSEHOLD },
      accessLevel: "full",
    });
    for (const cap of FINANCE_VERTICAL_CAPABILITIES) {
      expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
    }
  });

  it("denies unrecognised roles on every capability", () => {
    const ctx = withRole("superuser", "full");
    for (const cap of ALL_CAPS) {
      expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
    }
  });

  it("denies non-admin access to system buckets (REV/MULTI never render, invariant 13)", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "ea", status: "active", householdId: HOUSEHOLD },
      vertical: { id: "vert-REV", householdId: HOUSEHOLD, isSystemBucket: true },
      accessLevel: "full",
    });
    for (const cap of FINANCE_VERTICAL_CAPABILITIES) {
      expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
    }
  });

  it("canAccessFinancials returns false when the database is unavailable", async () => {
    expect(await canAccessFinancials(1, "MB", "finance.view_aggregate")).toBe(false);
    expect(await canAccessFinancials(1, "MB", "finance.post")).toBe(false);
  });
});

// ─── §4.3 matrix — household_admin ───────────────────────────────────────────

describe("matrix — household_admin (all capabilities, all verticals)", () => {
  it("grants every capability regardless of access rows", () => {
    for (const level of [null, "none", "blind", "read_only", "full"] as const) {
      const ctx = withRole("household_admin", level);
      for (const cap of ALL_CAPS) {
        expect(evaluateFinancialAccess(ctx, cap)).toBe(true);
      }
    }
  });

  it("household-admin export (finance.export_qbo) allowed", () => {
    expect(evaluateFinancialAccess(withRole("household_admin", null), "finance.export_qbo")).toBe(true);
  });

  it("household_admin may view system buckets", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "household_admin", status: "active", householdId: HOUSEHOLD },
      vertical: { id: "vert-REV", householdId: HOUSEHOLD, isSystemBucket: true },
    });
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(true);
  });
});

// ─── §4.3 matrix — EA ────────────────────────────────────────────────────────

describe("matrix — EA (assigned-vertical authority, bounded)", () => {
  it("EA with full on an assigned vertical: aggregate/detail/post/resolve allowed", () => {
    const ctx = withRole("ea", "full");
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(true);
  });

  it("EA with full is denied export_qbo and assign_vertical", () => {
    const ctx = withRole("ea", "full");
    expect(evaluateFinancialAccess(ctx, "finance.export_qbo")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.assign_vertical")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.view_sensitive")).toBe(false);
  });

  it("EA assigned-vertical mutate allowed; Unassigned queue denied (the key boundary)", () => {
    const ctx = withRole("ea", "full");
    // mutate on the assigned vertical
    expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(true);
    // ...but an item whose vertical is the open question is admin-only work
    expect(evaluateFinancialAccess(ctx, "finance.assign_vertical")).toBe(false);
  });

  it("EA with read_only: aggregate only", () => {
    const ctx = withRole("ea", "read_only");
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(false);
  });

  it("EA with blind/none/no row: denied everything (blind suppresses aggregates)", () => {
    for (const level of ["blind", "none", null] as const) {
      const ctx = withRole("ea", level);
      for (const cap of FINANCE_VERTICAL_CAPABILITIES) {
        expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
      }
    }
  });
});

// ─── §4.3 matrix — vertical co-admin (isFinancialOwner) ──────────────────────

describe("matrix — vertical co-admin (member|ea + isFinancialOwner, D9)", () => {
  it("co-admin has aggregate/detail/post/resolve on the owned vertical, even with no vma row", () => {
    for (const role of ["member", "ea"]) {
      const ctx = makeCtx({
        member: { id: "mem-1", role, status: "active", householdId: HOUSEHOLD },
        isFinancialOwner: true,
        accessLevel: null,
      });
      expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
      expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(true);
      expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(true);
      expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(true);
    }
  });

  it("co-admin is denied assign_vertical and export_qbo without an explicit grant", () => {
    const ctx = makeCtx({ isFinancialOwner: true, accessLevel: "full" });
    expect(evaluateFinancialAccess(ctx, "finance.assign_vertical")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.export_qbo")).toBe(false);
  });

  it("co-admin export_qbo allowed only via explicit override grant", () => {
    const ctx = makeCtx({ isFinancialOwner: true, accessLevel: "full", overrideGranted: true });
    expect(evaluateFinancialAccess(ctx, "finance.export_qbo")).toBe(true);
  });

  it("operational owner without isFinancialOwner gets no financial authority", () => {
    const ctx = makeCtx({ isFinancialOwner: false, accessLevel: "full" }); // member + full
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(false);
  });
});

// ─── §4.3 matrix — member ────────────────────────────────────────────────────

describe("matrix — member (visibility, not authority)", () => {
  it("member + full: aggregate + detail, never post/resolve", () => {
    const ctx = withRole("member", "full");
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.resolve_workbench")).toBe(false);
    expect(evaluateFinancialAccess(ctx, "finance.export_qbo")).toBe(false);
  });

  it("member + read_only: aggregate only", () => {
    const ctx = withRole("member", "read_only");
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(false);
  });

  it("member + blind/none/no row: denied", () => {
    for (const level of ["blind", "none", null] as const) {
      const ctx = withRole("member", level);
      for (const cap of FINANCE_VERTICAL_CAPABILITIES) {
        expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
      }
    }
  });
});

// ─── §4.3 matrix — caregiver / child / elder ─────────────────────────────────

describe("matrix — caregiver / child / elder (deny by default, grantable by override)", () => {
  it("denied on every capability at every access level", () => {
    for (const role of ["caregiver", "child", "elder"]) {
      for (const level of [null, "none", "blind", "read_only", "full"] as const) {
        const ctx = withRole(role, level);
        for (const cap of ALL_CAPS) {
          expect(evaluateFinancialAccess(ctx, cap)).toBe(false);
        }
      }
    }
  });

  it("explicit override grant allows (elder-care scenario)", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "elder", status: "active", householdId: HOUSEHOLD },
      accessLevel: "read_only",
      overrideGranted: true,
    });
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(true);
  });
});

// ─── Overrides and data policies ─────────────────────────────────────────────

describe("resolver — overrides decisive, both directions", () => {
  it("explicit denial outranks a role/ownership grant", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "ea", status: "active", householdId: HOUSEHOLD },
      accessLevel: "full",
      isFinancialOwner: true,
      overrideGranted: false,
    });
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(false);
  });

  it("explicit grant outranks a weak access level", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "member", status: "active", householdId: HOUSEHOLD },
      accessLevel: "read_only",
      overrideGranted: true,
    });
    expect(evaluateFinancialAccess(ctx, "finance.post")).toBe(true);
  });

  it("financial data policy hides a vertical from a role (PERS hidden from EAs)", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "ea", status: "active", householdId: HOUSEHOLD },
      accessLevel: "full",
      financialPolicy: { hiddenFromRoles: ["ea"], hiddenFromMemberIds: null },
    });
    expect(evaluateFinancialAccess(ctx, "finance.view_detail")).toBe(false);
  });

  it("financial data policy hides a vertical from a specific member", () => {
    const ctx = makeCtx({
      member: { id: "mem-1", role: "member", status: "active", householdId: HOUSEHOLD },
      accessLevel: "full",
      financialPolicy: { hiddenFromRoles: null, hiddenFromMemberIds: ["mem-1"] },
    });
    expect(evaluateFinancialAccess(ctx, "finance.view_aggregate")).toBe(false);
  });

  it("view_sensitive: non-admin requires an explicit grant (additional gate)", () => {
    expect(evaluateFinancialAccess(withRole("ea", "full"), "finance.view_sensitive")).toBe(false);
    const granted = makeCtx({
      member: { id: "mem-1", role: "ea", status: "active", householdId: HOUSEHOLD },
      overrideGranted: true,
    });
    expect(evaluateFinancialAccess(granted, "finance.view_sensitive")).toBe(true);
  });
});

// ─── Deprecated aliases (A20) ────────────────────────────────────────────────

describe("deprecated finance.view / finance.manage aliases", () => {
  it("finance.view resolves to finance.view_aggregate", () => {
    expect(resolveFinanceAlias("finance.view")).toBe("finance.view_aggregate");
  });

  it("finance.manage resolves to finance.post", () => {
    expect(resolveFinanceAlias("finance.manage")).toBe("finance.post");
  });

  it("new capabilities pass through unchanged; unknown strings return null", () => {
    expect(resolveFinanceAlias("finance.resolve_workbench")).toBe("finance.resolve_workbench");
    expect(resolveFinanceAlias("shopping.manage")).toBeNull();
  });

  it("isFinanceCapability recognises all seven capabilities only", () => {
    for (const cap of ALL_CAPS) expect(isFinanceCapability(cap)).toBe(true);
    expect(isFinanceCapability("finance.view")).toBe(false); // alias, not a capability
    expect(isFinanceCapability("finance.admin")).toBe(false);
  });
});

// ─── Cross-vertical redaction (§4.4 / shadow_blocks busyLabel precedent) ─────

describe("cross-vertical redaction helper", () => {
  const vertical = { financeRedactedLabel: "Owner-funded", code: "PERS" };

  it("falls back to the default label when unset", () => {
    expect(financeRedactedLabel(null)).toBe("Internal — Personal");
    expect(financeRedactedLabel({ financeRedactedLabel: null, code: "PERS" } as never)).toBe("Internal — Personal");
  });

  it("uses the vertical's configured label", () => {
    expect(financeRedactedLabel(vertical as never)).toBe("Owner-funded");
  });

  it("entitled lines pass through with account and description", () => {
    const view = redactJournalLine(
      { id: "l1", verticalId: VERTICAL_ID, amount: "-120.00", currency: "USD", glAccountId: "acct-1", description: "Flour" },
      new Set([VERTICAL_ID]),
      null,
    );
    expect(view.glAccountId).toBe("acct-1");
    expect(view.description).toBe("Flour");
    expect(view.redactedLabel).toBeUndefined();
  });

  it("unentitled counterparty lines keep the amount but reveal only the label", () => {
    const view = redactJournalLine(
      { id: "l2", verticalId: "pers-uuid", amount: "120.00", currency: "USD", glAccountId: "acct-secret", description: "Amex Platinum" },
      new Set([VERTICAL_ID]),
      vertical as never,
    );
    expect(view.amount).toBe("120.00"); // amount retained — entry must still visibly balance
    expect(view.redactedLabel).toBe("Owner-funded");
    expect(view.glAccountId).toBeUndefined();
    expect(view.description).toBeUndefined();
  });
});
