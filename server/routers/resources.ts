import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { writeAuditLog } from "../db";
import { nanoid } from "nanoid";
import { requirePermission } from "../auth/rbac";

// ─── Resources Router ─────────────────────────────────────────────────────────
// Curated resource links per household member.
// Vertical owners and household admins can add/edit/remove resources.
// Members can view their own resource list.

export const resourcesRouter = router({
  // List resources for a specific member (or the calling member's own resources)
  list: protectedProcedure
    .input(z.object({
      memberId: z.string().optional(), // if omitted, returns caller's own resources
      verticalId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      const targetMemberId = input.memberId ?? actor.id;

      // Non-admins can only view their own resources
      if (targetMemberId !== actor.id) {
        requirePermission(actor, "member.view_all");
      }

      return db.getMemberResources({
        householdId: actor.householdId,
        memberId: targetMemberId,
        verticalId: input.verticalId,
      });
    }),

  // Create a resource for a member
  create: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      verticalId: z.string().optional(),
      title: z.string().min(1).max(255),
      url: z.string().url(),
      description: z.string().max(1000).optional(),
      resourceType: z.enum(["link", "form", "doc", "invoice", "template"]).default("link"),
      sortOrder: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      // Admins can add resources to any member.
      // Vertical owners can add resources to members in their vertical.
      // Members can add resources to themselves.
      const isAdmin = actor.role === "household_admin" || actor.role === "ea";
      const isSelf = input.memberId === actor.id;

      if (!isAdmin && !isSelf) {
        // Check if actor is a vertical owner for the specified vertical
        if (!input.verticalId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can add resources to other members without a vertical context" });
        }
        const owners = await db.getVerticalOwners(input.verticalId);
        const isOwner = owners.some((o: any) => o.userId === ctx.user.id);
        if (!isOwner) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only vertical owners can add resources to members in their vertical" });
        }
      }

      const id = nanoid();
      await db.createMemberResource({
        id,
        householdId: actor.householdId,
        memberId: input.memberId,
        verticalId: input.verticalId ?? null,
        title: input.title,
        url: input.url,
        description: input.description ?? null,
        resourceType: input.resourceType,
        sortOrder: input.sortOrder,
        isActive: true,
        addedByMemberId: actor.id,
      });

      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: actor.householdId,
        action: "resources.create",
        category: "household",
        resourceType: "member_resource",
        resourceId: id,
        outcome: "success",
        metadata: { memberId: input.memberId, title: input.title, resourceType: input.resourceType },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { id };
    }),

  // Update a resource
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(255).optional(),
      url: z.string().url().optional(),
      description: z.string().max(1000).optional().nullable(),
      resourceType: z.enum(["link", "form", "doc", "invoice", "template"]).optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      const resource = await db.getMemberResourceById(input.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      if (resource.householdId !== actor.householdId) throw new TRPCError({ code: "FORBIDDEN" });

      const isAdmin = actor.role === "household_admin" || actor.role === "ea";
      const isAdder = resource.addedByMemberId === actor.id;
      if (!isAdmin && !isAdder) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the resource creator or an admin can edit this resource" });
      }

      const { id, ...data } = input;
      await db.updateMemberResource(id, data);
      return { success: true };
    }),

  // Delete a resource
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      const resource = await db.getMemberResourceById(input.id);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      if (resource.householdId !== actor.householdId) throw new TRPCError({ code: "FORBIDDEN" });

      const isAdmin = actor.role === "household_admin" || actor.role === "ea";
      const isAdder = resource.addedByMemberId === actor.id;
      if (!isAdmin && !isAdder) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the resource creator or an admin can delete this resource" });
      }

      await db.deleteMemberResource(input.id);
      return { success: true };
    }),

  // Reorder resources for a member (bulk sortOrder update)
  reorder: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      orderedIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      const isAdmin = actor.role === "household_admin" || actor.role === "ea";
      const isSelf = input.memberId === actor.id;
      if (!isAdmin && !isSelf) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot reorder another member's resources" });
      }

      // Update sortOrder for each ID in the ordered list
      for (let i = 0; i < input.orderedIds.length; i++) {
        await db.updateMemberResource(input.orderedIds[i], { sortOrder: i });
      }
      return { success: true };
    }),
});

// ─── Geeves Access Router ─────────────────────────────────────────────────────
// Toggle per-member Geeves AI access.

export const geevesAccessRouter = router({
  // Get the calling member's own geevesAccess flag
  getMyAccess: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return { geevesAccess: false };
    return { geevesAccess: member.geevesAccess ?? true };
  }),

  // Admin: set geevesAccess for any member
  setAccess: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      geevesAccess: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actor, "household.invite"); // admins + EAs only

      await db.setMemberGeevesAccess(input.memberId, input.geevesAccess);

      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: actor.householdId,
        action: "member.geevesAccess.set",
        category: "household",
        resourceType: "household_member",
        resourceId: input.memberId,
        outcome: "success",
        metadata: { geevesAccess: input.geevesAccess },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true };
    }),
});
