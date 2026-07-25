/**
 * Platform Reconciliation Engine
 * Compares platform booking data (Airbnb/VRBO/Booking.com) against
 * internal records and flags discrepancies.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface ReconciliationResult {
  bookingId: string;
  platform: string;
  expectedNet: number;
  actualNet: number;
  discrepancy: number;
  discrepancyPct: number;
  issues: string[];
  status: "matched" | "minor" | "flagged" | "missing";
}

/**
 * Calculate expected net payout for a booking based on platform fee config.
 */
export async function reconcileBooking(
  bookingId: string,
  householdId: string
): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) {
    return { bookingId, platform: "unknown", expectedNet: 0, actualNet: 0, discrepancy: 0, discrepancyPct: 0, issues: ["Database unavailable"], status: "missing" };
  }

  const [bookingRows, configRows] = await Promise.all([
    db.execute(sql`SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1`),
    db.execute(sql`
      SELECT pfc.* FROM platform_fee_configurations pfc
      JOIN bookings b ON b.platform = pfc.platform
      WHERE b.id = ${bookingId}
        AND pfc.householdId = ${householdId}
        AND pfc.isActive = TRUE
      LIMIT 1
    `),
  ]);

  const booking = ((Array.isArray(bookingRows) ? bookingRows[0] : bookingRows) as unknown as any[])?.[0];
  const config = ((Array.isArray(configRows) ? configRows[0] : configRows) as unknown as any[])?.[0];

  if (!booking) {
    return { bookingId, platform: "unknown", expectedNet: 0, actualNet: 0, discrepancy: 0, discrepancyPct: 0, issues: ["Booking not found"], status: "missing" };
  }

  const gross = Number(booking.totalAmount || 0);
  const platformFee = config
    ? gross * (Number(config.commissionPct || 0) / 100)
      + gross * (Number(config.processingFeePct || 0) / 100)
      + Number(config.processingFeeFixed || 0)
    : gross * 0.155; // Default Airbnb 15.5%

  const expectedNet = gross - platformFee;
  const actualNet = Number(booking.hostPayout || booking.netAmount || 0);
  const discrepancy = expectedNet - actualNet;
  const discrepancyPct = actualNet > 0 ? Math.abs(discrepancy / actualNet) * 100 : 0;

  const issues: string[] = [];
  if (discrepancyPct > 5) issues.push(`Large discrepancy: ${discrepancyPct.toFixed(1)}%`);
  if (!config) issues.push("No fee config found — using default 15.5%");
  if (!booking.hostPayout && !booking.netAmount) issues.push("No payout amount recorded");

  const tolerancePct = Number(config?.reconciliationTolerancePct || 2);
  const status: ReconciliationResult["status"] =
    discrepancyPct <= tolerancePct ? "matched" :
    discrepancyPct <= tolerancePct * 2 ? "minor" : "flagged";

  return { bookingId, platform: booking.platform, expectedNet, actualNet, discrepancy, discrepancyPct, issues, status };
}

/**
 * Reconcile all bookings for a property within a date range.
 */
export async function reconcilePropertyBookings(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<ReconciliationResult[]> {
  const db = await getDb();
  if (!db) return [];

  const bookingRows = await db.execute(sql`
    SELECT b.id, b.householdId FROM bookings b
    WHERE b.propertyId = ${propertyId}
      AND b.checkIn >= ${startDate}
      AND b.checkIn <= ${endDate}
    ORDER BY b.checkIn
  `);
  const bookings = (Array.isArray(bookingRows) ? bookingRows[0] : bookingRows) as unknown as any[];

  if (!bookings?.length) return [];

  const householdId = bookings[0]?.householdId ?? "";
  const results = await Promise.all(
    bookings.map((b: any) => reconcileBooking(b.id, householdId))
  );

  return results;
}
