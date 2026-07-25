import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { reconcilePropertyBookings } from "../services/platformReconciliation";

export const platformConfigRouter = router({
  /**
   * List all platform fee configurations for a household.
   */
  list: protectedProcedure
    .input(z.object({ householdId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.execute(sql`
        SELECT * FROM platform_fee_configurations
        WHERE householdId = ${input.householdId}
        ORDER BY platform
      `);
      return (Array.isArray(rows) ? rows[0] : rows) as unknown as any[] || [];
    }),

  /**
   * Create or update a platform fee configuration.
   */
  upsert: protectedProcedure
    .input(z.object({
      id: z.string().optional(),
      householdId: z.string().min(1),
      platform: z.enum(["airbnb", "vrbo", "bookingcom", "direct"]),
      feeType: z.enum(["host_pays", "split", "guest_pays"]).default("host_pays"),
      commissionPct: z.number().min(0).max(100).default(0),
      processingFeePct: z.number().min(0).max(100).default(0),
      processingFeeFixed: z.number().min(0).default(0),
      taxOnFees: z.boolean().default(false),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      if (input.id) {
        await db.execute(sql`
          UPDATE platform_fee_configurations SET
            feeType = ${input.feeType},
            commissionPct = ${input.commissionPct},
            processingFeePct = ${input.processingFeePct},
            processingFeeFixed = ${input.processingFeeFixed},
            taxOnFees = ${input.taxOnFees},
            isActive = ${input.isActive},
            updatedAt = NOW()
          WHERE id = ${input.id} AND householdId = ${input.householdId}
        `);
        return { id: input.id, created: false };
      }

      const id = nanoid();
      await db.execute(sql`
        INSERT INTO platform_fee_configurations
          (id, householdId, platform, feeType, commissionPct, processingFeePct, processingFeeFixed, taxOnFees, isActive)
        VALUES
          (${id}, ${input.householdId}, ${input.platform}, ${input.feeType},
           ${input.commissionPct}, ${input.processingFeePct}, ${input.processingFeeFixed},
           ${input.taxOnFees}, ${input.isActive})
        ON DUPLICATE KEY UPDATE
          feeType = VALUES(feeType),
          commissionPct = VALUES(commissionPct),
          processingFeePct = VALUES(processingFeePct),
          processingFeeFixed = VALUES(processingFeeFixed),
          taxOnFees = VALUES(taxOnFees),
          isActive = VALUES(isActive),
          updatedAt = NOW()
      `);
      return { id, created: true };
    }),

  /**
   * Delete a platform fee configuration.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1), householdId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`
        DELETE FROM platform_fee_configurations
        WHERE id = ${input.id} AND householdId = ${input.householdId}
      `);
      return { deleted: true };
    }),

  /**
   * Reconcile all bookings for a property within a date range.
   */
  reconcileProperty: protectedProcedure
    .input(z.object({
      propertyId: z.string().min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      return reconcilePropertyBookings(input.propertyId, input.startDate, input.endDate);
    }),
});
