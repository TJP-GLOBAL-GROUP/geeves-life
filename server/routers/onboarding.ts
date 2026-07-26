/**
 * Enhanced Onboarding Router
 * 6-step flow: Household → Profile → Calendars → Platforms → Verticals → Complete
 * Auto-applies platform presets on platform connection.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

/** Auto-apply platform fee preset when a user connects a platform calendar. */
async function autoApplyPlatformPreset(householdId: string, platform: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db.execute(sql`
    SELECT id FROM platform_fee_configurations
    WHERE householdId = ${householdId} AND platform = ${platform}
    LIMIT 1
  `);
  if (((Array.isArray(existing) ? existing[0] : existing) as unknown as any[])?.[0]) return;

  const presets: Record<string, { commissionPct: number; processingFeePct: number; processingFeeFixed: number }> = {
    airbnb: { commissionPct: 15.50, processingFeePct: 0, processingFeeFixed: 0 },
    vrbo: { commissionPct: 5.00, processingFeePct: 3.00, processingFeeFixed: 0 },
    bookingcom: { commissionPct: 15.00, processingFeePct: 0, processingFeeFixed: 0 },
  };
  const preset = presets[platform];
  if (!preset) return;

  const id = nanoid();
  await db.execute(sql`
    INSERT INTO platform_fee_configurations
      (id, householdId, platform, commissionPct, processingFeePct, processingFeeFixed, isDefault, isActive)
    VALUES
      (${id}, ${householdId}, ${platform}, ${preset.commissionPct}, ${preset.processingFeePct}, ${preset.processingFeeFixed}, TRUE, TRUE)
  `);
  console.log(`[Onboarding] Auto-applied ${platform} fee preset for household ${householdId}`);
}

export const onboardingRouter = router({
  /** Step 1: Create household + first admin member */
  createHousehold: protectedProcedure
    .input(z.object({
      householdName: z.string().min(1).max(100),
      adminName: z.string().min(1).max(100),
      adminEmail: z.string().email(),
      adminPronouns: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const householdId = nanoid();
      const memberId = nanoid();
      await db.execute(sql`
        INSERT INTO households (id, name, createdAt) VALUES (${householdId}, ${input.householdName}, NOW())
      `);
      await db.execute(sql`
        INSERT INTO household_members (id, householdId, userId, displayName, email, role, pronouns, createdAt)
        VALUES (${memberId}, ${householdId}, ${ctx.user.id}, ${input.adminName}, ${input.adminEmail}, 'household_admin', ${input.adminPronouns || null}, NOW())
      `);
      return { householdId, memberId };
    }),

  /** Step 2: Complete member profile */
  completeProfile: protectedProcedure
    .input(z.object({
      memberId: z.string().min(1),
      dob: z.string().optional(),
      phoneNumbers: z.string().optional(),
      avatarUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`
        UPDATE household_members SET
          dob = ${input.dob || null},
          phoneNumbers = ${input.phoneNumbers || null},
          avatarUrl = ${input.avatarUrl || null}
        WHERE id = ${input.memberId}
      `);
      return { updated: true };
    }),

  /** Step 3: Record calendar connection */
  connectCalendar: protectedProcedure
    .input(z.object({
      householdId: z.string().min(1),
      provider: z.enum(["google", "airbnb", "vrbo", "bookingcom", "ical"]),
      calendarId: z.string().min(1),
      name: z.string().min(1),
      verticalId: z.string().min(1),
      shadowBlocking: z.boolean().default(true),
      shadowSource: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const id = nanoid();
      await db.execute(sql`
        INSERT INTO calendars
          (id, householdId, provider, externalId, name, verticalId, shadowBlocking, shadowSource, createdAt)
        VALUES
          (${id}, ${input.householdId}, ${input.provider}, ${input.calendarId}, ${input.name}, ${input.verticalId}, ${input.shadowBlocking}, ${input.shadowSource}, NOW())
      `);
      if (["airbnb", "vrbo", "bookingcom"].includes(input.provider)) {
        await autoApplyPlatformPreset(input.householdId, input.provider);
      }
      return { id, calendarConnected: true };
    }),

  /** Step 4: Create verticals with colors */
  createVerticals: protectedProcedure
    .input(z.object({
      householdId: z.string().min(1),
      verticals: z.array(z.object({
        name: z.string().min(1),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        icon: z.string().min(1),
      })).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const ids: string[] = [];
      for (const v of input.verticals) {
        const id = nanoid();
        await db.execute(sql`
          INSERT INTO verticals (id, householdId, name, color, icon, createdAt)
          VALUES (${id}, ${input.householdId}, ${v.name}, ${v.color}, ${v.icon}, NOW())
        `);
        ids.push(id);
      }
      return { verticalIds: ids };
    }),

  /** Step 5: Configure vertical financial settings */
  configureVerticalFinancials: protectedProcedure
    .input(z.object({
      householdId: z.string().min(1),
      verticalId: z.string().min(1),
      currency: z.string().default("USD"),
      reconciliationToleranceAbs: z.number().default(1.00),
      reconciliationTolerancePct: z.number().default(2.00),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`
        INSERT INTO vertical_financial_settings
          (householdId, verticalId, currency, reconciliationToleranceAbs, reconciliationTolerancePct, updatedAt)
        VALUES
          (${input.householdId}, ${input.verticalId}, ${input.currency}, ${input.reconciliationToleranceAbs}, ${input.reconciliationTolerancePct}, NOW())
        ON DUPLICATE KEY UPDATE
          currency = VALUES(currency),
          reconciliationToleranceAbs = VALUES(reconciliationToleranceAbs),
          reconciliationTolerancePct = VALUES(reconciliationTolerancePct),
          updatedAt = NOW()
      `);
      return { configured: true };
    }),

  /** Step 6: Mark onboarding complete */
  complete: protectedProcedure
    .input(z.object({ householdId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`
        UPDATE households SET onboardingComplete = TRUE, onboardingCompletedAt = NOW()
        WHERE id = ${input.householdId}
      `);
      return { onboardingComplete: true };
    }),

  /** Get onboarding status */
  status: protectedProcedure
    .input(z.object({ householdId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { complete: false, completedAt: null };
      const rows = await db.execute(sql`
        SELECT onboardingComplete, onboardingCompletedAt FROM households WHERE id = ${input.householdId} LIMIT 1
      `);
      const result = ((Array.isArray(rows) ? rows[0] : rows) as unknown as any[])?.[0];
      return {
        complete: result?.onboardingComplete === true || result?.onboardingComplete === 1,
        completedAt: result?.onboardingCompletedAt ?? null,
      };
    }),
});
