/**
 * Household Isolation Guards
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces the core security invariant: a user may only read or mutate
 * resources that belong to their own household.
 *
 * Rules:
 *  1. Every tRPC mutation that touches a household-scoped resource MUST call
 *     assertHouseholdOwnership() before performing any DB write.
 *  2. The householdId on a resource is IMMUTABLE after creation. The only
 *     exception is the superAdmin.resources.reassign procedure, which requires
 *     system_admin role + a confirmation phrase + writes an audit log entry.
 *  3. Cross-household reads are never permitted, even for system_admin, unless
 *     explicitly implemented in a dedicated admin-only procedure.
 *
 * Usage:
 *   import { assertHouseholdOwnership, assertResourceBelongsToHousehold } from "../auth/householdIsolation";
 *
 *   // In a protectedProcedure mutation:
 *   const member = await assertHouseholdOwnership(ctx.user.id);
 *   // member.householdId is now the verified household for this user
 *
 *   // Before mutating a resource:
 *   await assertResourceBelongsToHousehold(resource.householdId, member.householdId, "Property");
 */

import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { writeAuditLog } from "../db";

/**
 * Resolves the calling user's household membership and returns it.
 * Throws FORBIDDEN if the user has no household membership.
 */
export async function assertHouseholdOwnership(userId: number) {
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of a household to perform this action.",
    });
  }
  return member;
}

/**
 * Asserts that a resource's householdId matches the caller's householdId.
 * Throws FORBIDDEN if they do not match — this prevents cross-household data access.
 *
 * @param resourceHouseholdId  The householdId stored on the resource being mutated
 * @param callerHouseholdId    The householdId of the authenticated caller
 * @param resourceType         Human-readable label for error messages (e.g. "Property")
 */
export function assertResourceBelongsToHousehold(
  resourceHouseholdId: string,
  callerHouseholdId: string,
  resourceType: string
) {
  if (resourceHouseholdId !== callerHouseholdId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${resourceType} does not belong to your household.`,
    });
  }
}

/**
 * Validates a Super Admin householdId reassignment request.
 * Requires:
 *  - caller has role === "system_admin"
 *  - confirmationPhrase === "REASSIGN HOUSEHOLD"
 *  - writes an audit log entry
 *
 * This is the ONLY code path that may change a resource's householdId.
 */
export async function assertSuperAdminReassignment(opts: {
  callerUserId: number;
  callerRole: string;
  confirmationPhrase: string;
  resourceType: string;
  resourceId: string;
  fromHouseholdId: string;
  toHouseholdId: string;
  ipAddress?: string;
}) {
  if (opts.callerRole !== "system_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a Super Admin may reassign household ownership of a resource.",
    });
  }
  if (opts.confirmationPhrase !== "REASSIGN HOUSEHOLD") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: 'Confirmation phrase must be exactly "REASSIGN HOUSEHOLD".',
    });
  }
  // Write audit log
  await writeAuditLog({
    actorUserId: opts.callerUserId,
    householdId: opts.fromHouseholdId,
    action: "superAdmin.reassignHousehold",
    category: "admin",
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    outcome: "success",
    metadata: {
      fromHouseholdId: opts.fromHouseholdId,
      toHouseholdId: opts.toHouseholdId,
    },
    ipAddress: opts.ipAddress,
  });
}
