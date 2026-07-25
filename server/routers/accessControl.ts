/**
 * Unified Access Control Router
 *
 * Combines two layers of member access management:
 *
 * Layer 1 — RBAC Action Permissions (Role-Based + Per-Member Overrides)
 *   Each member has a role (household_admin | ea | member | caregiver | child | elder).
 *   The role determines a baseline set of action permissions (defined in rbac.ts).
 *   Per-member overrides (member_permission_overrides table) can grant or revoke
 *   individual permissions on top of the role baseline. Overrides always win.
 *
 * Layer 2 — Data Visibility (Per-Member, Per-Vertical)
 *   Controls what data categories (financial, private, guest_pii, operational) a member
 *   can see within each vertical, and at what calendar access level.
 *   Stored in vertical_member_access and vertical_data_policies tables.
 *
 * Access to this page:
 *   - household_admin: always has access
 *   - ea: has access by default; HA can revoke via households.eaCanManageAccess = false
 *   - all other roles: no access
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as dbModule from "../db";
import { eq, and } from "drizzle-orm";
import {
  memberPermissionOverrides,
  households,
  householdMembers,
  verticalMemberAccess,
  verticalDataPolicies,
  verticals,
} from "../../drizzle/schema";
import {
  ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  type Permission,
} from "../auth/rbac";
import { randomUUID } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await dbModule.getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function getActorMember(userId: number) {
  const member = await dbModule.getHouseholdMemberByUserId(userId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
  return member;
}

async function assertCanManageAccess(actor: { role: string; householdId: string }) {
  if (actor.role === "household_admin") return;
  if (actor.role === "ea") {
    const db = await requireDb();
    const rows = await db.select().from(households).where(eq(households.id, actor.householdId)).limit(1);
    const household = rows[0];
    if (!household?.eaCanManageAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "The household admin has restricted permission management to admins only.",
      });
    }
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins and EAs can manage member permissions." });
}

/** Merge role baseline + overrides to produce the effective permission set for a member. */
async function getEffectivePermissionSet(member: { role: string; id: string }): Promise<Permission[]> {
  const db = await requireDb();
  const baseline = (ROLE_PERMISSIONS[member.role] ?? []) as Permission[];
  const overrides = await db.select().from(memberPermissionOverrides)
    .where(eq(memberPermissionOverrides.memberId, member.id));
  const permSet = new Set<Permission>(baseline);
  for (const o of overrides) {
    if (o.granted) {
      permSet.add(o.permission as Permission);
    } else {
      permSet.delete(o.permission as Permission);
    }
  }
  return Array.from(permSet);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const accessControlRouter = router({

  /**
   * Returns the full permission matrix for a specific member.
   */
  getMatrix: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      verticalId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      await assertCanManageAccess(actor);

      const targetRows = await db.select().from(householdMembers)
        .where(and(
          eq(householdMembers.id, input.memberId),
          eq(householdMembers.householdId, actor.householdId),
        )).limit(1);
      const targetMember = targetRows[0];
      if (!targetMember) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      const roleBaseline = (ROLE_PERMISSIONS[targetMember.role] ?? []) as Permission[];

      const overrides = await db.select().from(memberPermissionOverrides)
        .where(eq(memberPermissionOverrides.memberId, input.memberId));

      const effectivePerms = await getEffectivePermissionSet(targetMember);

      const accessRulesWhere = input.verticalId
        ? and(eq(verticalMemberAccess.memberId, input.memberId), eq(verticalMemberAccess.verticalId, input.verticalId))
        : eq(verticalMemberAccess.memberId, input.memberId);
      const accessRules = await db.select().from(verticalMemberAccess).where(accessRulesWhere);

      const allDataPolicies = await db.select().from(verticalDataPolicies)
        .where(eq(verticalDataPolicies.householdId, actor.householdId));
      const dataPolicies = input.verticalId
        ? allDataPolicies.filter((p) => p.verticalId === input.verticalId)
        : allDataPolicies;

      const allVerticals = await db.select().from(verticals)
        .where(eq(verticals.householdId, actor.householdId));

      const allMembers = await db.select().from(householdMembers)
        .where(eq(householdMembers.householdId, actor.householdId));

      const householdRows = await db.select().from(households)
        .where(eq(households.id, actor.householdId)).limit(1);
      const household = householdRows[0];

      return {
        targetMember,
        roleBaseline,
        overrides,
        effectivePermissions: effectivePerms,
        accessRules,
        dataPolicies,
        allVerticals,
        allMembers: allMembers.filter((m) => m.status !== "removed"),
        eaCanManageAccess: household?.eaCanManageAccess ?? true,
        permissionGroups: PERMISSION_GROUPS,
        actorRole: actor.role,
      };
    }),

  /**
   * Set or update a per-member permission override.
   */
  upsertPermissionOverride: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      permission: z.string(),
      granted: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      await assertCanManageAccess(actor);

      const targetRows = await db.select().from(householdMembers)
        .where(and(
          eq(householdMembers.id, input.memberId),
          eq(householdMembers.householdId, actor.householdId),
        )).limit(1);
      const targetMember = targetRows[0];
      if (!targetMember) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      if (targetMember.role === "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Household admin permissions cannot be overridden." });
      }

      const existingRows = await db.select().from(memberPermissionOverrides)
        .where(and(
          eq(memberPermissionOverrides.memberId, input.memberId),
          eq(memberPermissionOverrides.permission, input.permission),
        )).limit(1);
      const existing = existingRows[0];

      if (existing) {
        await db.update(memberPermissionOverrides)
          .set({ granted: input.granted, configuredByMemberId: actor.id })
          .where(eq(memberPermissionOverrides.id, existing.id));
      } else {
        await db.insert(memberPermissionOverrides).values({
          id: randomUUID(),
          householdId: actor.householdId,
          memberId: input.memberId,
          permission: input.permission,
          granted: input.granted,
          configuredByMemberId: actor.id,
        });
      }

      return { success: true };
    }),

  /**
   * Remove a per-member permission override, reverting to role baseline.
   */
  removePermissionOverride: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      permission: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      await assertCanManageAccess(actor);

      await db.delete(memberPermissionOverrides)
        .where(and(
          eq(memberPermissionOverrides.memberId, input.memberId),
          eq(memberPermissionOverrides.permission, input.permission),
        ));

      return { success: true };
    }),

  /**
   * HA-only: set whether EA role can access and edit the Member Permissions page.
   */
  setEADelegation: protectedProcedure
    .input(z.object({ eaCanManageAccess: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      if (actor.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins can change EA delegation." });
      }
      await db.update(households)
        .set({ eaCanManageAccess: input.eaCanManageAccess })
        .where(eq(households.id, actor.householdId));
      return { success: true };
    }),

  /**
   * Returns the effective permission set for the current user (used by frontend for UI gating).
   */
  getMyEffectivePermissions: protectedProcedure.query(async ({ ctx }) => {
    const member = await dbModule.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return { permissions: [], canInvite: false, canManageAccess: false, role: null, memberId: null };

    const effectivePerms = await getEffectivePermissionSet(member);

    let canManageAccess = false;
    if (member.role === "household_admin") {
      canManageAccess = true;
    } else if (member.role === "ea") {
      const db = await requireDb();
      const rows = await db.select().from(households).where(eq(households.id, member.householdId)).limit(1);
      canManageAccess = rows[0]?.eaCanManageAccess ?? true;
    }

    return {
      permissions: effectivePerms,
      canInvite: effectivePerms.includes("household.invite"),
      canManageAccess,
      role: member.role,
      memberId: member.id,
    };
  }),

  /**
   * Upsert a vertical member access rule.
   */
  upsertVerticalAccess: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      verticalId: z.string(),
      accessLevel: z.enum(["full", "read_only", "blind", "none"]),
      calendarAccess: z.enum(["availability_only", "default_vertical", "blind", "read_write"]),
      allowedCalendarIds: z.array(z.string()).optional(),
      canRequestMeetings: z.boolean().optional(),
      excludeMultiDayEvents: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      await assertCanManageAccess(actor);

      const existingRows = await db.select().from(verticalMemberAccess)
        .where(and(
          eq(verticalMemberAccess.memberId, input.memberId),
          eq(verticalMemberAccess.verticalId, input.verticalId),
        )).limit(1);
      const existing = existingRows[0];

      const values = {
        householdId: actor.householdId,
        memberId: input.memberId,
        verticalId: input.verticalId,
        accessLevel: input.accessLevel,
        calendarAccess: input.calendarAccess,
        allowedCalendarIds: input.allowedCalendarIds ?? [],
        canRequestMeetings: input.canRequestMeetings ?? true,
        excludeMultiDayEvents: input.excludeMultiDayEvents ?? false,
        configuredByMemberId: actor.id,
      };

      if (existing) {
        await db.update(verticalMemberAccess).set(values).where(eq(verticalMemberAccess.id, existing.id));
      } else {
        await db.insert(verticalMemberAccess).values({ id: randomUUID(), ...values });
      }

      return { success: true };
    }),

  /**
   * Upsert a data visibility policy for a vertical.
   */
  upsertDataPolicy: protectedProcedure
    .input(z.object({
      verticalId: z.string(),
      dataCategory: z.enum(["financial", "private", "guest_pii", "operational"]),
      hiddenFromRoles: z.array(z.string()),
      hiddenFromMemberIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = await getActorMember(ctx.user.id);
      await assertCanManageAccess(actor);

      const existingRows = await db.select().from(verticalDataPolicies)
        .where(and(
          eq(verticalDataPolicies.verticalId, input.verticalId),
          eq(verticalDataPolicies.dataCategory, input.dataCategory),
        )).limit(1);
      const existing = existingRows[0];

      const values = {
        householdId: actor.householdId,
        verticalId: input.verticalId,
        dataCategory: input.dataCategory,
        hiddenFromRoles: input.hiddenFromRoles,
        hiddenFromMemberIds: input.hiddenFromMemberIds,
        configuredByMemberId: actor.id,
      };

      if (existing) {
        await db.update(verticalDataPolicies).set(values).where(eq(verticalDataPolicies.id, existing.id));
      } else {
        await db.insert(verticalDataPolicies).values({ id: randomUUID(), ...values });
      }

      return { success: true };
    }),

  /**
   * P-54: Returns the list of verticals this caller can request meeting time on.
   * - household_admin / ea: all verticals
   * - others: only verticals where canRequestMeetings is true (or no rule configured)
   */
  getMyAccessibleVerticals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const member = await dbModule.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    const allVerticals = await db.select().from(verticals).where(eq(verticals.householdId, member.householdId));
    if (member.role === "household_admin" || member.role === "ea") {
      return allVerticals.map(v => ({ ...v, canRequestMeetings: true }));
    }
    // For non-admin members: filter to verticals they have access to with canRequestMeetings=true
    const accessRules = await db.select().from(verticalMemberAccess)
      .where(eq(verticalMemberAccess.memberId, member.id));
    const accessMap = new Map(accessRules.map(r => [r.verticalId, r]));
    return allVerticals
      .filter(v => {
        const rule = accessMap.get(v.id);
        if (!rule) return false; // no rule = no access for non-admin
        return rule.canRequestMeetings !== false;
      })
      .map(v => ({ ...v, canRequestMeetings: true }));
  }),
});
