/**
 * Super Admin Router — Geeves.life Platform Team Only
 *
 * All procedures in this router are gated behind `adminProcedure`, which
 * requires ctx.user.role === "system_admin". This role is NEVER granted
 * automatically — it must be set directly in the DB by a platform engineer.
 *
 * Household admins, EA roles, and constellation owners have NO access here.
 *
 * Sections:
 *   superAdmin.tasks.*     — project_tasks CRUD + status updates
 *   superAdmin.knowledge.* — project_knowledge CRUD
 *   superAdmin.audit.*     — audit_log read + export
 *   superAdmin.stats.*     — dashboard summary stats
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { onEventUpserted } from "../services/eventPropagation";
import { TRPCError } from "@trpc/server";

export const superAdminRouter = router({

  // ─── Maintenance ─────────────────────────────────────────────────────────────
  maintenance: {
    /**
     * List all households with their groupName and calendar counts.
     * Used to populate the SuperAdmin backfill household picker.
     */
    listHouseholdsForBackfill: adminProcedure.query(async () => {
      const { getDb } = await import("../db");
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { households, calendars, events } = await import("../../drizzle/schema");
      const { eq, count, and, ne } = await import("drizzle-orm");

      const rows = await drizzleDb
        .select({
          id: households.id,
          name: households.name,
          groupName: households.groupName,
          calendarCount: count(calendars.id),
        })
        .from(households)
        .leftJoin(calendars, eq(calendars.householdId, households.id))
        .groupBy(households.id, households.name, households.groupName)
        .orderBy(households.name);

      return rows;
    }),

    /**
     * Bulk re-propagate shadow blocks.
     * scope="all"        — every household in the DB
     * scope="household" — one specific household (householdId required)
     * scope="calendars" — explicit list of calendarIds (householdId required)
     * Only processes events with no existing shadow blocks (idempotent).
     */
    repropagateCalendars: adminProcedure
      .input(z.object({
        scope: z.enum(["all", "household", "calendars"]).default("calendars"),
        householdId: z.string().optional(),
        calendarIds: z.array(z.string()).optional(),
        windowDays: z.number().default(90),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("../db");
        const drizzleDb = await getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const { events, shadowBlocks, calendars, households } = await import("../../drizzle/schema");
        const { and, eq, ne, gte, lte, notExists, inArray } = await import("drizzle-orm");

        const windowStart = Date.now() - input.windowDays * 24 * 60 * 60 * 1000;
        const windowEnd = Date.now() + input.windowDays * 24 * 60 * 60 * 1000;

        // Build the list of (calendarId, householdId) pairs to process
        type CalHousehold = { calId: string; householdId: string };
        let pairs: CalHousehold[] = [];

        if (input.scope === "all") {
          // All non-iCal calendars across all households
          const allCals = await drizzleDb
            .select({ id: calendars.id, householdId: calendars.householdId })
            .from(calendars)
            .where(ne(calendars.provider, "ical"));
          pairs = allCals.map(c => ({ calId: c.id, householdId: c.householdId }));
        } else if (input.scope === "household") {
          if (!input.householdId) throw new TRPCError({ code: "BAD_REQUEST", message: "householdId required for scope=household" });
          const hCals = await drizzleDb
            .select({ id: calendars.id })
            .from(calendars)
            .where(and(eq(calendars.householdId, input.householdId), ne(calendars.provider, "ical")));
          pairs = hCals.map(c => ({ calId: c.id, householdId: input.householdId! }));
        } else {
          // scope === "calendars" — explicit list
          if (!input.calendarIds?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "calendarIds required for scope=calendars" });
          if (!input.householdId) throw new TRPCError({ code: "BAD_REQUEST", message: "householdId required for scope=calendars" });
          pairs = input.calendarIds.map(id => ({ calId: id, householdId: input.householdId! }));
        }

        let totalQueued = 0;
        const results: Record<string, number> = {};

        for (const { calId, householdId } of pairs) {
          const calEvents = await drizzleDb
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                eq(events.calendarId, calId),
                eq(events.isShadowBlock, false),
                ne(events.status, "cancelled"),
                gte(events.startTime, windowStart),
                lte(events.startTime, windowEnd),
                notExists(
                  drizzleDb.select({ id: shadowBlocks.id })
                    .from(shadowBlocks)
                    .where(eq(shadowBlocks.sourceEventId, events.id))
                )
              )
            );

          let queued = 0;
          for (const ev of calEvents) {
            onEventUpserted(ev.id, householdId).catch(e =>
              console.warn(`[BulkRepropagate] Failed for event ${ev.id}:`, e)
            );
            queued++;
          }

          results[calId] = queued;
          totalQueued += queued;
          if (queued > 0) console.log(`[BulkRepropagate] Queued ${queued} events for calendar ${calId}`);
        }

        return { totalQueued, results, calendarsProcessed: pairs.length };
      }),
  },

  // ─── Stats (dashboard summary) ──────────────────────────────────────────────
  stats: {
    summary: adminProcedure.query(async () => {
      const [taskStats, knowledgeAll] = await Promise.all([
        db.getProjectTaskStats(),
        db.getAllKnowledge(),
      ]);

      // Aggregate task counts
      const totals = { done: 0, todo: 0, in_progress: 0, deferred: 0, blocked: 0 };
      const byArea: Record<string, typeof totals> = {};
      for (const row of taskStats) {
        const area = row.area;
        if (!byArea[area]) byArea[area] = { done: 0, todo: 0, in_progress: 0, deferred: 0, blocked: 0 };
        const s = row.status as keyof typeof totals;
        if (s in totals) {
          totals[s] += Number(row.count);
          byArea[area][s] += Number(row.count);
        }
      }
      const totalTasks = Object.values(totals).reduce((a, b) => a + b, 0);
      const completionPct = totalTasks > 0 ? Math.round((totals.done / totalTasks) * 100) : 0;

      return {
        tasks: { totals, byArea, totalTasks, completionPct },
        knowledgeEntries: knowledgeAll.length,
      };
    }),
  },

  // ─── Project Tasks ───────────────────────────────────────────────────────────
  tasks: router({
    list: adminProcedure
      .input(z.object({
        status: z.enum(["todo", "in_progress", "done", "deferred", "blocked"]).optional(),
        area: z.string().optional(),
        phase: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
        offset: z.number().min(0).default(0),
      }))
      .query(({ input }) => db.getProjectTasks(input)),

    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["todo", "in_progress", "done", "deferred", "blocked"]),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => db.updateProjectTaskStatus(input.id, input.status, input.notes)),

    create: adminProcedure
      .input(z.object({
        phase: z.string().default("1"),
        area: z.string(),
        bucket: z.string().optional(),
        title: z.string().min(1).max(512),
        status: z.enum(["todo", "in_progress", "done", "deferred", "blocked"]).default("todo"),
        priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
        notes: z.string().optional(),
        deferredReason: z.string().optional(),
        sourceDoc: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createHash } = await import("crypto");
        const titleHash = createHash("sha256").update(input.title).digest("hex").slice(0, 64);
        return db.createProjectTask({ ...input, titleHash });
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteProjectTask(input.id)),
  }),

  // ─── Knowledge Base ──────────────────────────────────────────────────────────
  knowledge: router({
    list: adminProcedure
      .input(z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        includeDeprecated: z.boolean().default(true),
      }).optional())
      .query(({ input }) => db.getAllKnowledge(input)),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        category: z.string().min(1).max(64),
        key: z.string().min(1).max(128),
        value: z.string().min(1),
        sourceDoc: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => db.upsertKnowledge(input)),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteKnowledge(input.id)),

    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
      .mutation(({ input }) => db.bulkDeleteKnowledge(input.ids)),

    markDeprecated: adminProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(({ input }) => db.markKnowledgeDeprecated(input.id, input.reason)),

    categories: adminProcedure.query(() => db.getKnowledgeCategories()),
  }),

  // ─── Audit Log ───────────────────────────────────────────────────────────────
  audit: router({
    list: adminProcedure
      .input(z.object({
        householdId: z.string().optional(),
        category: z.string().optional(),
        action: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      }))
      .query(({ input }) => db.getAuditLog(input)),

    count: adminProcedure
      .input(z.object({
        householdId: z.string().optional(),
        category: z.string().optional(),
      }))
      .query(({ input }) => db.countAuditLog(input)),
  }),

  // ─── User Management ─────────────────────────────────────────────────────────
  users: router({
    list: adminProcedure.query(async () => {
      const dbConn = await db.getDb();
      if (!dbConn) return [];
      const { users } = await import("../../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return dbConn.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        householdId: users.householdId,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users).orderBy(desc(users.lastSignedIn)).limit(200);
    }),

    promoteToSystemAdmin: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const dbConn = await db.getDb();
        if (!dbConn) throw new Error("Database not available");
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbConn.update(users).set({ role: "system_admin" }).where(eq(users.id, input.userId));
        return { ok: true };
      }),

    demoteToUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Prevent self-demotion
        if (ctx.user.id === input.userId) {
          throw new Error("Cannot demote yourself");
        }
        const dbConn = await db.getDb();
        if (!dbConn) throw new Error("Database not available");
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbConn.update(users).set({ role: "user" }).where(eq(users.id, input.userId));
        return { ok: true };
      }),
  }),

  // ─── Data Classification Registry ───────────────────────────────────────────
  // Read-only view of the dataClassification.ts manifest for Super Admins.
  // Allows the platform team to audit which fields are tagged with which categories
  // without touching code. Future: allow DB overrides for dynamic field additions.
  dataClassification: router({
    /** Return the full registry grouped by table */
    list: adminProcedure.query(async () => {
      const { FIELD_CLASSIFICATIONS, DATA_CATEGORIES } = await import("../services/dataClassification");
      // Group by tableName for easy display
      const byTable: Record<string, typeof FIELD_CLASSIFICATIONS> = {};
      for (const entry of FIELD_CLASSIFICATIONS) {
        if (!byTable[entry.table]) byTable[entry.table] = [];
        byTable[entry.table].push(entry);
      }
      return { byTable, total: FIELD_CLASSIFICATIONS.length, categories: DATA_CATEGORIES };
    }),

    /** Return all registered data categories */
    categories: adminProcedure.query(async () => {
      const { DATA_CATEGORIES } = await import("../services/dataClassification");
      return DATA_CATEGORIES;
    }),

    /** Return all fields for a specific table */
    tableFields: adminProcedure
      .input(z.object({ tableName: z.string() }))
      .query(async ({ input }) => {
        const { getTableClassifications } = await import("../services/dataClassification");
        return getTableClassifications(input.tableName);
      }),

    /** Return all tables that have fields tagged with a specific category */
    byCategory: adminProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input }) => {
        const { FIELD_CLASSIFICATIONS } = await import("../services/dataClassification");
        const tables = new Set<string>();
        const fields = FIELD_CLASSIFICATIONS.filter(f => f.categories.includes(input.category as any));
        for (const f of fields) tables.add(f.table);
        return { tables: Array.from(tables), fields };
      }),
  }),

  // ─── Resource Household Reassignment (Super Admin Only) ──────────────────────
  //
  // The ONLY code path that may change a resource's householdId.
  // Requires:
  //   1. caller.role === "system_admin" (enforced by adminProcedure)
  //   2. confirmationPhrase === "REASSIGN HOUSEHOLD"
  //   3. Writes an immutable audit log entry before executing the change
  //
  resources: {
    reassignProperty: adminProcedure
      .input(z.object({
        propertyId: z.string(),
        toHouseholdId: z.string(),
        confirmationPhrase: z.string(),
        reason: z.string().min(10, "Please provide a reason (min 10 characters)"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { assertSuperAdminReassignment } = await import("../auth/householdIsolation");
        const { getDb } = await import("../db");
        const { properties } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        // Fetch current property to get fromHouseholdId
        const property = await db.getPropertyById(input.propertyId);
        if (!property) throw new Error("Property not found");

        // Validate and write audit log (throws if confirmation phrase wrong)
        await assertSuperAdminReassignment({
          callerUserId: ctx.user.id,
          callerRole: ctx.user.role,
          confirmationPhrase: input.confirmationPhrase,
          resourceType: "property",
          resourceId: input.propertyId,
          fromHouseholdId: property.householdId,
          toHouseholdId: input.toHouseholdId,
        });

        // Write a second audit entry with the reason
        await db.writeAuditLog({
          actorUserId: ctx.user.id,
          householdId: property.householdId,
          action: "superAdmin.reassignHousehold.reason",
          category: "admin",
          resourceType: "property",
          resourceId: input.propertyId,
          outcome: "success",
          metadata: { reason: input.reason, toHouseholdId: input.toHouseholdId },
        });

        // Execute the reassignment
        const drizzleDb = await getDb();
        if (!drizzleDb) throw new Error("DB unavailable");
        await drizzleDb.update(properties)
          .set({ householdId: input.toHouseholdId })
          .where(eq(properties.id, input.propertyId));

        return {
          success: true,
          propertyId: input.propertyId,
          fromHouseholdId: property.householdId,
          toHouseholdId: input.toHouseholdId,
        };
      }),
  },
});
