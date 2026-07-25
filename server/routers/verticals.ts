import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as db from "../db";
import { requirePermission } from "../auth/rbac";

// Helper: resolve the acting household member (live lookup, never trusts ctx.user.householdId)
async function resolveMember(userId: number) {
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
  return member;
}

export const verticalsRouter = router({
  // ─── List all verticals for the household ─────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    const verts = await db.getVerticals(member.householdId);
    const enriched = await Promise.all(
      verts.map(async (v) => {
        const owners = await db.getVerticalOwners(v.id);
        const integrations = await db.getVerticalIntegrations(v.id);
        // Count calendars from the calendars table (verticalId FK), not vertical_integrations
        const assignedCalendars = await db.getCalendarsByVertical(v.id);
        // isOwner: true if this member is the ownerMemberId, OR is a household_admin, OR is in vertical_owners
        const isOwner =
          v.ownerMemberId === member?.id ||
          member?.role === "household_admin" ||
          owners.some((o) => o.userId === ctx.user.id);
        return {
          ...v,
          ownerCount: owners.length,
          integrationCount: integrations.length,
          calendarCount: assignedCalendars.length,
          calendars: assignedCalendars,
          isOwner, // true = member manages this vertical; false = viewer only
        };
      })
    );
    return enriched.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }),

  // ─── Get a single vertical with full details ───────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      const verts = await db.getVerticals(member.householdId);
      const v = verts.find((x) => x.id === input.id);
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const owners = await db.getVerticalOwners(v.id);
      const integrations = await db.getVerticalIntegrations(v.id);
      const visibility = await db.getVerticalVisibility(v.id);
      return { ...v, owners, integrations, visibility };
    }),

  // ─── Create a vertical ─────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
        privacyLevel: z.enum(["household", "admin_only", "private"]).optional(),
        busyLabel: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      requirePermission(member, "vertical.manage");
      const id = nanoid();
      await db.createVertical({
        id,
        householdId: member.householdId,
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? "#10b981",
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
        privacyLevel: input.privacyLevel ?? "household",
        busyLabel: input.busyLabel ?? "Busy",
        ownerMemberId: member.id, // stamp creating member as vertical owner
      });
      // Auto-add creator as owner
      await db.addVerticalOwner({
        id: nanoid(),
        verticalId: id,
        userId: ctx.user.id,
        role: "owner",
        addedByUserId: ctx.user.id,
      });
      return { id };
    }),

  // ─── Update a vertical ─────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
        privacyLevel: z.enum(["household", "admin_only", "private"]).optional(),
        busyLabel: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      requirePermission(member, "vertical.manage");
      const { id, ...data } = input;
      await db.updateVertical(id, data);
      return { success: true };
    }),

  // ─── Delete (soft-delete) a vertical ──────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      requirePermission(member, "vertical.manage");
      // H-03: Use cascade delete to clean up all dependent tables
      await db.deleteVerticalCascade(input.id);
      return { success: true };
    }),

  // ─── Vertical owners ──────────────────────────────────────────────
  listOwners: protectedProcedure
    .input(z.object({ verticalId: z.string() }))
    .query(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      return db.getVerticalOwners(input.verticalId);
    }),

  addOwner: protectedProcedure
    .input(z.object({ verticalId: z.string(), userId: z.number(), role: z.enum(["owner", "member"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.addVerticalOwner({
        id: nanoid(),
        verticalId: input.verticalId,
        userId: input.userId,
        role: input.role ?? "owner",
        addedByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  removeOwner: protectedProcedure
    .input(z.object({ verticalId: z.string(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.removeVerticalOwner(input.verticalId, input.userId);
      return { success: true };
    }),

  // ─── Vertical integrations ────────────────────────────────────────
  listIntegrations: protectedProcedure
    .input(z.object({ verticalId: z.string() }))
    .query(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      return db.getVerticalIntegrations(input.verticalId);
    }),

  addIntegration: protectedProcedure
    .input(
      z.object({
        verticalId: z.string(),
        integrationType: z.enum(["calendar", "email", "task", "security", "other"]),
        provider: z.string(),
        accountEmail: z.string().optional(),
        displayName: z.string().optional(),
        calendarId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      await db.createVerticalIntegration({
        id: nanoid(),
        verticalId: input.verticalId,
        householdId: member.householdId,
        memberId: member.id,
        integrationType: input.integrationType,
        provider: input.provider,
        accountEmail: input.accountEmail ?? null,
        displayName: input.displayName ?? null,
        calendarId: input.calendarId ?? null,
        status: "active",
        metadata: input.metadata ?? null,
      });
      return { success: true };
    }),

  removeIntegration: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.updateVerticalIntegration(input.id, { status: "disconnected" });
      return { success: true };
    }),

  // ─── Cross-vertical visibility ────────────────────────────────────
  listVisibility: protectedProcedure
    .input(z.object({ verticalId: z.string() }))
    .query(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      return db.getVerticalVisibility(input.verticalId);
    }),

  setVisibility: protectedProcedure
    .input(
      z.object({
        fromVerticalId: z.string(),
        toVerticalId: z.string(),
        visibilityLevel: z.enum(["none", "busy_only", "full"]),
        busyLabel: z.string().max(50).optional(),
        // Calendar IDs excluded from shadow blocks for this rule (default: [] = no exclusions)
        calendarExclusions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.setVerticalVisibility({
        id: nanoid(),
        fromVerticalId: input.fromVerticalId,
        toVerticalId: input.toVerticalId,
        visibilityLevel: input.visibilityLevel,
        busyLabel: input.busyLabel ?? "Busy",
        calendarExclusions: input.calendarExclusions ?? [],
        configuredByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  // ─── List all cross-vertical visibility rules for the household ────
  listAllVisibility: protectedProcedure.query(async ({ ctx }) => {
    const member = await resolveMember(ctx.user.id);
    const verts = await db.getVerticals(member.householdId);
    const allRules: Array<{
      id: string;
      fromVerticalId: string;
      toVerticalId: string;
      visibilityLevel: string;
      busyLabel: string | null;
    }> = [];
    for (const v of verts) {
      const rules = await db.getVerticalVisibility(v.id);
      allRules.push(...rules);
    }
    return allRules;
  }),

  // ─── Delete a cross-vertical visibility rule ───────────────────────
  deleteVisibility: protectedProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.deleteVerticalVisibility(input.ruleId);
      return { success: true };
    }),

  // ─── Assign a calendar to a vertical ─────────────────────────────
  assignCalendar: protectedProcedure
    .input(z.object({ calendarId: z.string(), verticalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.updateCalendar(input.calendarId, { verticalId: input.verticalId });
      return { success: true };
    }),

  unassignCalendar: protectedProcedure
    .input(z.object({ calendarId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveMember(ctx.user.id);
      await db.updateCalendar(input.calendarId, { verticalId: null });
      return { success: true };
    }),

  // ─── Seed default verticals for a new household ───────────────────
  seedDefaults: protectedProcedure
    .input(
      z.object({
        verticals: z.array(
          z.object({
            name: z.string(),
            icon: z.string(),
            color: z.string(),
            description: z.string().optional(),
            sortOrder: z.number(),
          })
        ),
        replace: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await resolveMember(ctx.user.id);
      const existing = await db.getVerticals(member.householdId);
      // If verticals exist and replace is not requested, skip
      if (existing.length > 0 && !input.replace) {
        return { seeded: 0, skipped: true, message: "Verticals already exist. Pass replace:true to overwrite." };
      }
      // Soft-delete existing verticals if replacing
      if (existing.length > 0 && input.replace) {
        for (const v of existing) {
          await db.updateVertical(v.id, { isActive: false });
        }
      }
      for (const v of input.verticals) {
        const id = nanoid();
        await db.createVertical({
          id,
          householdId: member.householdId,
          name: v.name,
          icon: v.icon,
          color: v.color,
          description: v.description ?? null,
          sortOrder: v.sortOrder,
          isActive: true,
        });
        await db.addVerticalOwner({
          id: nanoid(),
          verticalId: id,
          userId: ctx.user.id,
          role: "owner",
          addedByUserId: ctx.user.id,
        });
      }
      return { seeded: input.verticals.length, skipped: false };
    }),
});
