/**
 * Notification Settings Router — P-38
 *
 * Allows the household admin to configure cooldown durations and enable/disable
 * individual notification types. Settings are per-household.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { notificationSettings } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

/** Default notification types with their labels and descriptions */
const DEFAULT_NOTIFICATION_TYPES = [
  {
    key: "circuit_breaker",
    label: "Shadow Block Circuit Breaker",
    description: "Fires when shadow block writes exceed the 10-minute cap and propagation is paused.",
    defaultCooldownHours: 6,
  },
  {
    key: "rate_limit",
    label: "Shadow Block Rate Limit",
    description: "Fires when a single calendar exceeds the hourly write cap.",
    defaultCooldownHours: 6,
  },
  {
    key: "cancellation_pending",
    label: "Cancellation Pending Confirmation",
    description: "Fires when bookings are removed from iCal feeds but were confirmed by email.",
    defaultCooldownHours: 6,
  },
  {
    key: "date_mismatch",
    label: "Booking Date Mismatch",
    description: "Fires when iCal and email report different dates for the same booking.",
    defaultCooldownHours: 6,
  },
  {
    key: "integration_health",
    label: "Integration Health Check",
    description: "Fires when OAuth tokens are missing required scopes for their declared purposes.",
    defaultCooldownHours: 24,
  },
  {
    key: "propagation_health",
    label: "Propagation Health Alert",
    description: "Fires when calendars with recent events have no vertical assigned.",
    defaultCooldownHours: 24,
  },
];

export const notificationSettingsRouter = router({
  /**
   * Get all notification settings for the current user's household.
   * Seeds defaults if no settings exist yet.
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const d = await db.getDb();
    if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "No household" });
    const householdId = member.householdId;

    // Fetch existing settings
    const existing = await d
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.householdId, householdId));

    // Seed any missing defaults
    const existingKeys = new Set(existing.map(s => s.key));
    const missing = DEFAULT_NOTIFICATION_TYPES.filter(t => !existingKeys.has(t.key));

    if (missing.length > 0) {
      for (const m of missing) {
        await d.execute(sql`
          INSERT INTO notification_settings (\`key\`, label, description, cooldownHours, enabled, householdId)
          VALUES (${m.key}, ${m.label}, ${m.description}, ${m.defaultCooldownHours}, 1, ${householdId})
          ON DUPLICATE KEY UPDATE label = ${m.label}
        `);
      }
      // Re-fetch after seeding
      const refreshed = await d
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.householdId, householdId));
      return { settings: refreshed };
    }

    return { settings: existing };
  }),

  /**
   * Update a single notification setting (cooldown hours and/or enabled state).
   */
  update: protectedProcedure
    .input(z.object({
      key: z.string(),
      cooldownHours: z.number().min(0).max(168).optional(), // 0-168h (0 = always send, 168 = 1 week)
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const d = await db.getDb();
      if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "No household" });
      const householdId = member.householdId;

      // Only admins can change notification settings
      if (member.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins can change notification settings" });
      }

      const updateFields: any = {};
      if (input.cooldownHours !== undefined) updateFields.cooldownHours = input.cooldownHours;
      if (input.enabled !== undefined) updateFields.enabled = input.enabled;

      if (Object.keys(updateFields).length === 0) {
        return { ok: true };
      }

      await d
        .update(notificationSettings)
        .set(updateFields)
        .where(
          and(
            eq(notificationSettings.key, input.key),
            eq(notificationSettings.householdId, householdId),
          )
        );

      return { ok: true };
    }),
});
