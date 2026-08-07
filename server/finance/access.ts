/**
 * Financial Access Resolver — v2.2 §4 (D9, owner-signed 2026-08-07)
 *
 * `canAccessFinancials(userId, verticalCode, capability)` is the SINGLE,
 * FAIL-CLOSED authorisation entry point for every financial procedure. It is
 * called FIRST — before input validation — so an unauthorised caller cannot
 * learn anything from the shape of a validation error. Denial is an opaque
 * FORBIDDEN, indistinguishable from "does not exist" (invariant 14).
 *
 * Capabilities (replace global finance.view / finance.manage — deprecated
 * aliases resolve via `resolveFinanceAlias`):
 *   Vertical-scoped: finance.view_aggregate · finance.view_detail · finance.post
 *                    · finance.resolve_workbench · finance.export_qbo
 *   Global:          finance.assign_vertical (Unassigned queue, admin-only)
 *                    finance.view_sensitive  (salary / child-medical; audited)
 *
 * Implication chain: resolve_workbench ⇒ post ⇒ view_detail ⇒ view_aggregate.
 *
 * Resolution order (v2.2 §4.2 — implemented in exactly this sequence):
 *   ① active member of the vertical's household (D7 boundary)
 *   ② member_permission_overrides row — decisive both directions
 *     (explicit denial outranks any role grant). Exception: household_admin
 *     rows cannot carry overrides at all (existing invariant in
 *     accessControl.upsertPermissionOverride), so overrides are not consulted
 *     for admins — noted as a deliberate deviation from §4.2 step ②.
 *   ③ vertical_member_access level (none / blind / no row → deny detail;
 *     blind also suppresses aggregates). Interpretation: applies to non-admin
 *     roles; household_admin is never assigned via vertical_member_access and
 *     would otherwise lock itself out of its own ledger.
 *   ④ vertical_data_policies 'financial' (hiddenFromRoles / hiddenFromMemberIds)
 *     — applied to non-admin roles (this is how the owner hides PERS from EAs).
 *   ⑤ role / ownership grant per the §4.3 matrix.
 *   ⑥ sensitive attributes additionally require finance.view_sensitive
 *     (callers gate via canAccessFinancials(userId, code, 'finance.view_sensitive')).
 *
 * Any unexpected state — missing row, unrecognised role, null vertical — DENIES.
 *
 * Vertical co-admin = base role member|ea + vertical_owners.isFinancialOwner
 * for that vertical (no role-enum change, D9 §4.1).
 */

import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import * as dbModule from "../db";
import {
  householdMembers,
  memberPermissionOverrides,
  verticalDataPolicies,
  verticalMemberAccess,
  verticalOwners,
  verticals,
  type HouseholdMember,
  type Vertical,
} from "../../drizzle/schema";

// ─── Capability vocabulary ────────────────────────────────────────────────────

export const FINANCE_VERTICAL_CAPABILITIES = [
  "finance.view_aggregate",
  "finance.view_detail",
  "finance.post",
  "finance.resolve_workbench",
  "finance.export_qbo",
] as const;

export const FINANCE_GLOBAL_CAPABILITIES = [
  "finance.assign_vertical",
  "finance.view_sensitive",
] as const;

export type FinanceVerticalCapability = (typeof FINANCE_VERTICAL_CAPABILITIES)[number];
export type FinanceGlobalCapability = (typeof FINANCE_GLOBAL_CAPABILITIES)[number];
export type FinanceCapability = FinanceVerticalCapability | FinanceGlobalCapability;

/** Implication levels: a grant at level N implies every level ≤ N. */
const CAPABILITY_LEVEL: Record<FinanceVerticalCapability, number> = {
  "finance.view_aggregate": 0,
  "finance.view_detail": 1,
  "finance.post": 2,
  "finance.resolve_workbench": 3,
  "finance.export_qbo": 99, // non-delegable — outside the implication chain
};

/**
 * Deprecated global permissions → new vertical-scoped capabilities (v2.2 §4.1,
 * transition aliases only). finance.view ≈ aggregate visibility;
 * finance.manage ≈ posting authority. New code must use the scoped capabilities.
 */
export const DEPRECATED_FINANCE_ALIASES: Record<string, FinanceCapability> = {
  "finance.view": "finance.view_aggregate",
  "finance.manage": "finance.post",
};

export function isFinanceCapability(value: string): value is FinanceCapability {
  return (
    (FINANCE_VERTICAL_CAPABILITIES as readonly string[]).includes(value) ||
    (FINANCE_GLOBAL_CAPABILITIES as readonly string[]).includes(value)
  );
}

/** Resolve a (possibly deprecated alias) permission string to a FinanceCapability, or null. */
export function resolveFinanceAlias(permission: string): FinanceCapability | null {
  if (isFinanceCapability(permission)) return permission;
  return DEPRECATED_FINANCE_ALIASES[permission] ?? null;
}

// ─── Pure evaluation context (unit-tested exhaustively without a DB) ──────────

export type FinanceAccessLevel = "full" | "read_only" | "blind" | "none";

export interface FinancialAccessContext {
  /** household_members row fields the resolver needs. */
  member: {
    id: string;
    role: string;
    status: string;
    householdId: string;
  } | null;
  /** Resolved vertical row (null → fail closed; unknown code is opaque). */
  vertical: Pick<Vertical, "id" | "householdId" | "isSystemBucket"> | null;
  /** member_permission_overrides.granted for this capability, or null if no row. */
  overrideGranted: boolean | null;
  /** vertical_member_access.accessLevel, or null if no row. */
  accessLevel: FinanceAccessLevel | null;
  /** vertical_data_policies row for dataCategory='financial', or null. */
  financialPolicy: {
    hiddenFromRoles: string[] | null;
    hiddenFromMemberIds: string[] | null;
  } | null;
  /** vertical_owners.isFinancialOwner for (user, vertical). */
  isFinancialOwner: boolean;
}

/**
 * Pure resolver — the §4.3 matrix as a function. Every path that does not
 * affirmatively grant returns false (fail closed).
 */
export function evaluateFinancialAccess(
  ctx: FinancialAccessContext,
  capability: FinanceCapability,
): boolean {
  // Unknown capability strings can never reach here (typed), but fail closed anyway.
  if (!isFinanceCapability(capability)) return false;

  const { member, vertical } = ctx;

  // ① Active member of the vertical's household (D7 boundary).
  if (!member || member.status !== "active") return false;

  const isAdmin = member.role === "household_admin";

  // Global capabilities never require a vertical; vertical-scoped ones always do.
  if ((FINANCE_GLOBAL_CAPABILITIES as readonly string[]).includes(capability)) {
    // finance.assign_vertical: household_admin only (the Unassigned queue exists
    // precisely because deciding a vertical requires cross-vertical visibility).
    // finance.view_sensitive: household_admin by default; everyone else needs an
    // explicit grant (and every use is audited by the caller).
    if (isAdmin) return true;
    if (capability === "finance.view_sensitive") return ctx.overrideGranted === true;
    return false; // finance.assign_vertical is non-delegable
  }

  if (!vertical) return false; // unknown vertical code → opaque deny
  if (member.householdId !== vertical.householdId) return false; // household boundary

  // System buckets (REV / MULTI) never post and never render as user verticals
  // (invariant 13). Only household_admin may even view them.
  if (vertical.isSystemBucket && !isAdmin) return false;

  // ② Overrides are decisive both directions — except household_admin, whose
  // permissions cannot be overridden (existing accessControl invariant).
  if (!isAdmin && ctx.overrideGranted !== null) return ctx.overrideGranted;
  if (isAdmin) return true; // admins hold every capability (⑤ role grant)

  // ③ vertical_member_access level. Financial ownership implies full access to
  // the owned vertical even without a vma row (co-admin is defined by ownership,
  // §4.1); everyone else with no row is denied — fail closed.
  const effectiveLevel: FinanceAccessLevel | null =
    ctx.accessLevel ?? (ctx.isFinancialOwner ? "full" : null);
  if (effectiveLevel === null || effectiveLevel === "none") return false;
  if (effectiveLevel === "blind") return false; // blind suppresses aggregates too

  // ④ vertical_data_policies 'financial' — hiddenFromRoles / hiddenFromMemberIds.
  const policy = ctx.financialPolicy;
  if (policy) {
    if (policy.hiddenFromMemberIds?.includes(member.id)) return false;
    if (policy.hiddenFromRoles?.includes(member.role)) return false;
  }

  // ⑤ Role / ownership grant per the §4.3 matrix.
  const level = CAPABILITY_LEVEL[capability as FinanceVerticalCapability];

  // QBO export: household_admin only (handled above); vertical co-admin only if
  // explicitly granted — an override row would have returned at step ②, so a
  // non-admin reaching here without an override is denied.
  if (capability === "finance.export_qbo") return false;

  // Vertical co-admin (member|ea + isFinancialOwner): full authority inside the
  // vertical — aggregate, detail, post, resolve. Never assign_vertical (global,
  // handled above), never export without an explicit grant.
  if (
    ctx.isFinancialOwner &&
    (member.role === "member" || member.role === "ea")
  ) {
    return true;
  }

  switch (member.role) {
    case "ea":
      // EA with full on assigned verticals: aggregate/detail/post/resolve.
      // EA with read_only: aggregate only. The Unassigned queue stays denied
      // either way (global capability, handled above) — the single most
      // important boundary in the matrix (§4.3).
      if (effectiveLevel === "full") return level <= CAPABILITY_LEVEL["finance.resolve_workbench"];
      return capability === "finance.view_aggregate"; // read_only
    case "member":
      // member + full = visibility, not authority: aggregate + detail, no posting.
      if (effectiveLevel === "full") return level <= CAPABILITY_LEVEL["finance.view_detail"];
      return capability === "finance.view_aggregate"; // read_only
    default:
      // caregiver / child / elder / unrecognised roles: deny by default
      // (grantable only by override, which returned at step ②).
      return false;
  }
}

// ─── DB-backed resolver ───────────────────────────────────────────────────────

async function loadAccessContext(
  userId: number,
  verticalCode: string,
  capability: FinanceCapability,
): Promise<FinancialAccessContext> {
  const empty: FinancialAccessContext = {
    member: null,
    vertical: null,
    overrideGranted: null,
    accessLevel: null,
    financialPolicy: null,
    isFinancialOwner: false,
  };

  const db = await dbModule.getDb();
  if (!db) return empty; // no database → fail closed

  const member = await dbModule.getHouseholdMemberByUserId(userId);
  if (!member) return { ...empty };
  const m = member as HouseholdMember;
  const base: FinancialAccessContext = {
    ...empty,
    member: { id: m.id, role: m.role, status: m.status, householdId: m.householdId },
  };

  // Global capabilities skip vertical resolution entirely.
  if ((FINANCE_GLOBAL_CAPABILITIES as readonly string[]).includes(capability)) {
    const overrideRows = await db
      .select()
      .from(memberPermissionOverrides)
      .where(and(
        eq(memberPermissionOverrides.memberId, m.id),
        eq(memberPermissionOverrides.permission, capability),
      ))
      .limit(1);
    return { ...base, overrideGranted: overrideRows[0]?.granted ?? null };
  }

  // Codes are vocabulary, UUIDs are keys (invariant 13): resolve code → row.
  // Code lookup is scoped to the caller's household so a code that exists only
  // in another household is indistinguishable from an unknown code.
  const verticalRows = await db
    .select()
    .from(verticals)
    .where(and(
      eq(verticals.code, verticalCode),
      eq(verticals.householdId, m.householdId),
    ))
    .limit(1);
  const vertical = verticalRows[0];
  if (!vertical) return base; // unknown code → opaque deny downstream

  const [overrideRows, accessRows, policyRows, ownerRows] = await Promise.all([
    db.select().from(memberPermissionOverrides).where(and(
      eq(memberPermissionOverrides.memberId, m.id),
      eq(memberPermissionOverrides.permission, capability),
    )).limit(1),
    db.select().from(verticalMemberAccess).where(and(
      eq(verticalMemberAccess.memberId, m.id),
      eq(verticalMemberAccess.verticalId, vertical.id),
    )).limit(1),
    db.select().from(verticalDataPolicies).where(and(
      eq(verticalDataPolicies.verticalId, vertical.id),
      eq(verticalDataPolicies.dataCategory, "financial"),
    )).limit(1),
    db.select().from(verticalOwners).where(and(
      eq(verticalOwners.verticalId, vertical.id),
      eq(verticalOwners.userId, userId),
    )).limit(1),
  ]);

  const policy = policyRows[0];
  return {
    member: base.member,
    vertical: {
      id: vertical.id,
      householdId: vertical.householdId,
      isSystemBucket: vertical.isSystemBucket,
    },
    overrideGranted: overrideRows[0]?.granted ?? null,
    accessLevel: (accessRows[0]?.accessLevel as FinanceAccessLevel | undefined) ?? null,
    financialPolicy: policy
      ? {
          hiddenFromRoles: (policy.hiddenFromRoles as string[] | null) ?? null,
          hiddenFromMemberIds: (policy.hiddenFromMemberIds as string[] | null) ?? null,
        }
      : null,
    isFinancialOwner: ownerRows[0]?.isFinancialOwner ?? false,
  };
}

/**
 * THE financial authorisation entry point. Returns a boolean so callers decide
 * how to render denial; `requireFinancialAccess` is the throwing variant for
 * tRPC procedures. Both fail closed on any unexpected state.
 */
export async function canAccessFinancials(
  userId: number,
  verticalCode: string,
  capability: FinanceCapability,
): Promise<boolean> {
  try {
    if (!isFinanceCapability(capability)) return false;
    const ctx = await loadAccessContext(userId, verticalCode, capability);
    return evaluateFinancialAccess(ctx, capability);
  } catch {
    return false; // fail closed — an auth error is a denial, never a grant
  }
}

/**
 * Throwing variant for financial tRPC procedures. Denial is an OPAQUE
 * FORBIDDEN — deliberately indistinguishable from "does not exist" (§4.2).
 * Call this as the FIRST statement of every financial procedure, before any
 * input validation (invariant 14).
 */
export async function requireFinancialAccess(
  userId: number,
  verticalCode: string,
  capability: FinanceCapability,
): Promise<void> {
  const allowed = await canAccessFinancials(userId, verticalCode, capability);
  if (!allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
  }
}

// ─── Cross-vertical redaction (v2.2 §4.4 — shadow_blocks busyLabel precedent) ──

export const DEFAULT_FINANCE_REDACTED_LABEL = "Internal — Personal";

/**
 * Placeholder label for a counterparty vertical the viewer is not entitled to.
 * Mirrors the calendar shadow-block busyLabel pattern: the entry proves the
 * money moved (amount retained) while revealing nothing about the other side.
 */
export function financeRedactedLabel(
  vertical: Pick<Vertical, "financeRedactedLabel" | "code"> | null | undefined,
): string {
  if (!vertical) return DEFAULT_FINANCE_REDACTED_LABEL;
  return vertical.financeRedactedLabel || DEFAULT_FINANCE_REDACTED_LABEL;
}

/**
 * Redaction shape for one journal line as seen by a viewer. Entitled lines pass
 * through untouched; unentitled counterparty lines keep ONLY the amount and the
 * counterparty vertical's redacted label — never the account, memo, or
 * description (§4.4 / E6). Line-level P&L is computed from the surviving lines.
 *
 * NOTE (Stage A stub): full query integration lands with the Phase E surfaces;
 * this helper defines the contract those queries honour.
 */
export interface RedactedLineView {
  lineId: string;
  verticalId: string | null;
  /** Signed amount, always retained — concealing it would visibly unbalance the entry. */
  amount: string;
  currency: string;
  /** Present only when the viewer is entitled to the line's vertical. */
  glAccountId?: string;
  description?: string;
  /** Present only when the viewer is NOT entitled — the shadow-block analogue. */
  redactedLabel?: string;
}

export function redactJournalLine(
  line: {
    id: string;
    verticalId: string | null;
    amount: string;
    currency: string;
    glAccountId: string;
    description: string | null;
  },
  viewerEntitledVerticalIds: ReadonlySet<string>,
  counterpartyVertical: Pick<Vertical, "financeRedactedLabel" | "code"> | null,
): RedactedLineView {
  const entitled = line.verticalId !== null && viewerEntitledVerticalIds.has(line.verticalId);
  if (entitled) {
    return {
      lineId: line.id,
      verticalId: line.verticalId,
      amount: line.amount,
      currency: line.currency,
      glAccountId: line.glAccountId,
      description: line.description ?? undefined,
    };
  }
  return {
    lineId: line.id,
    verticalId: line.verticalId,
    amount: line.amount,
    currency: line.currency,
    redactedLabel: financeRedactedLabel(counterpartyVertical),
  };
}

// householdMembers re-exported for convenience of financial procedures that need
// the member row after a successful check (avoids a second lookup).
export { householdMembers };
