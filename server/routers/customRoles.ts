/**
 * P-40: Custom Roles Router
 * Full CRUD for household-level custom roles with per-permission,
 * widget, and vertical-domain access control.
 *
 * Access rules:
 * - list: any authenticated household member
 * - create/update/delete: household_admin or ea with household.manage permission
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import { ALL_PERMISSIONS, hasPermission } from "../auth/rbac";

// ─── Validation schemas ────────────────────────────────────────────────────────

const PermissionSchema = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

const CustomRoleInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  baseRole: z.enum(["household_admin", "ea", "member", "vendor", "elder", "child"]).default("member"),
  permissions: z.array(PermissionSchema).default([]),
  deniedPermissions: z.array(PermissionSchema).default([]),
  allowedWidgets: z.array(z.string()).nullable().default(null),
  allowedVerticalIds: z.array(z.string()).nullable().default(null),
  color: z.string().max(20).default("#6B7280"),
  icon: z.string().max(50).default("User"),
});

// ─── Helper ────────────────────────────────────────────────────────────────────

async function requireManageRolesAccess(userId: number) {
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
  const isAdmin = member.role === "household_admin";
  const isEA = member.role === "ea";
  if (!isAdmin && !isEA) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and EAs can manage roles" });
  }
  // EAs need household.manage permission
  if (isEA) {
    // Check if EA has household.manage via their base role or permission overrides
    const hasBasePermission = hasPermission(member.role, "household.manage");
    if (!hasBasePermission) {
      throw new TRPCError({ code: "FORBIDDEN", message: "EA requires household.manage permission to manage roles" });
    }
  }
  return member;
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const customRolesRouter = router({
  /**
   * List all custom roles for the caller's household.
   * Available to any authenticated household member.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    return db.getCustomRoles(member.householdId);
  }),

  /**
   * Get a single custom role by ID.
   */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    const role = await db.getCustomRoleById(input.id);
    if (!role || role.householdId !== member.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
    }
    return role;
  }),

  /**
   * Create a new custom role.
   * Requires household_admin or EA with household.manage.
   */
  create: protectedProcedure.input(CustomRoleInputSchema).mutation(async ({ ctx, input }) => {
    const member = await requireManageRolesAccess(ctx.user.id);
    const id = nanoid();
    const newRole = {
      id,
      householdId: member.householdId,
      name: input.name,
      description: input.description ?? null,
      baseRole: input.baseRole,
      permissions: input.permissions as string[],
      deniedPermissions: input.deniedPermissions as string[],
      allowedWidgets: input.allowedWidgets,
      allowedVerticalIds: input.allowedVerticalIds,
      color: input.color,
      icon: input.icon,
      createdByMemberId: member.id,
    };
    await db.createCustomRole(newRole);
    await db.writeAuditLog({
      householdId: member.householdId,
      actorUserId: ctx.user.id,
      action: "customRole.create",
      category: "household",
      resourceType: "custom_role",
      resourceId: id,
      outcome: "success",
      metadata: { name: input.name, baseRole: input.baseRole },
    });
    return { id };
  }),

  /**
   * Update an existing custom role.
   * Requires household_admin or EA with household.manage.
   */
  update: protectedProcedure.input(z.object({
    id: z.string(),
    data: CustomRoleInputSchema.partial(),
  })).mutation(async ({ ctx, input }) => {
    const member = await requireManageRolesAccess(ctx.user.id);
    const existing = await db.getCustomRoleById(input.id);
    if (!existing || existing.householdId !== member.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
    }
    await db.updateCustomRole(input.id, member.householdId, {
      ...(input.data.name !== undefined && { name: input.data.name }),
      ...(input.data.description !== undefined && { description: input.data.description }),
      ...(input.data.baseRole !== undefined && { baseRole: input.data.baseRole }),
      ...(input.data.permissions !== undefined && { permissions: input.data.permissions as string[] }),
      ...(input.data.deniedPermissions !== undefined && { deniedPermissions: input.data.deniedPermissions as string[] }),
      ...(input.data.allowedWidgets !== undefined && { allowedWidgets: input.data.allowedWidgets }),
      ...(input.data.allowedVerticalIds !== undefined && { allowedVerticalIds: input.data.allowedVerticalIds }),
      ...(input.data.color !== undefined && { color: input.data.color }),
      ...(input.data.icon !== undefined && { icon: input.data.icon }),
    });
    await db.writeAuditLog({
      householdId: member.householdId,
      actorUserId: ctx.user.id,
      action: "customRole.update",
      category: "household",
      resourceType: "custom_role",
      resourceId: input.id,
      outcome: "success",
      metadata: { name: existing.name },
    });
    return { success: true };
  }),

  /**
   * Delete a custom role.
   * Requires household_admin or EA with household.manage.
   * Note: deleting a role does NOT remove it from members — their customRoleId
   * will become a dangling reference. The UI should warn if the role is in use.
   */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const member = await requireManageRolesAccess(ctx.user.id);
    const existing = await db.getCustomRoleById(input.id);
    if (!existing || existing.householdId !== member.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
    }
    await db.deleteCustomRole(input.id, member.householdId);
    await db.writeAuditLog({
      householdId: member.householdId,
      actorUserId: ctx.user.id,
      action: "customRole.delete",
      category: "household",
      resourceType: "custom_role",
      resourceId: input.id,
      outcome: "success",
      metadata: { name: existing.name },
    });
    return { success: true };
  }),

  /**
   * Assign a custom role to a household member.
   * Requires household_admin or EA with household.manage.
   */
  assignToMember: protectedProcedure.input(z.object({
    memberId: z.string(),
    customRoleId: z.string().nullable(),
  })).mutation(async ({ ctx, input }) => {
    const actor = await requireManageRolesAccess(ctx.user.id);
    // Verify the target member is in the same household
    const target = await db.getHouseholdMember(input.memberId);
    if (!target || target.householdId !== actor.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    }
    // Verify the custom role belongs to the household (if not null)
    if (input.customRoleId) {
      const role = await db.getCustomRoleById(input.customRoleId);
      if (!role || role.householdId !== actor.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom role not found" });
      }
    }
    await db.updateHouseholdMember(input.memberId, {
      customRoleId: input.customRoleId,
    });
    await db.writeAuditLog({
      householdId: actor.householdId,
      actorUserId: ctx.user.id,
      action: "customRole.assignToMember",
      category: "household",
      resourceType: "household_member",
      resourceId: input.memberId,
      outcome: "success",
      metadata: { customRoleId: input.customRoleId },
    });
    return { success: true };
  }),

  /**
   * Return the canonical list of all permissions and permission groups.
   * Used by the UI to render the permission editor.
   */
  getPermissionCatalog: protectedProcedure.query(async () => {
    const { PERMISSION_GROUPS, ALL_PERMISSIONS } = await import("../auth/rbac");
    return { groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS };
  }),
});
