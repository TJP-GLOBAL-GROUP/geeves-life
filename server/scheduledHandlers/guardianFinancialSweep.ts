/**
 * Guardian Financial Sweep — Runs every 30 minutes
 * Auto-reconciles recent bookings and flags anomalies (GR-5).
 */
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ENV } from "../_core/env";

function isInternalIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
}

export async function guardianFinancialSweepHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!(user as any).isCron && !isInternalIp(req.ip ?? "")) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
  } catch {
    if (!isInternalIp(req.ip ?? "")) return res.status(401).json({ error: "Unauthorized" });
  }

  if (!ENV.guardianEnabled) return res.json({ status: "disabled", skipped: true });

  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    // Find recent unreconciled bookings (last 48h, not yet checked by GR-5)
    const [bookingRows] = await db.execute(sql`
      SELECT b.id, b.householdId, b.platform, b.totalAmount, b.hostPayout, b.checkIn
      FROM property_bookings b
      LEFT JOIN guardian_audit_log gal
        ON gal.targetId = b.id AND gal.guardrailId = 'GR-5' AND gal.createdAt > b.updatedAt
      WHERE b.hostPayout IS NOT NULL
        AND b.totalAmount IS NOT NULL
        AND b.createdAt > NOW() - INTERVAL 48 HOUR
        AND gal.id IS NULL
      LIMIT 100
    `) as any;
    const bookings = (bookingRows as any[]) ?? [];

    let flagged = 0;
    let cleared = 0;

    for (const booking of bookings) {
      // Get platform fee config for this household + platform
      const [configRows] = await db.execute(sql`
        SELECT commissionPct, processingFeePct, processingFeeFixed
        FROM platform_fee_configurations
        WHERE householdId = ${booking.householdId}
          AND platform = ${booking.platform}
          AND isActive = TRUE
        LIMIT 1
      `) as any;
      const config = (configRows as any[])?.[0];

      const gross = Number(booking.totalAmount);
      const expectedFee = config
        ? gross * (Number(config.commissionPct) / 100)
          + gross * (Number(config.processingFeePct) / 100)
          + Number(config.processingFeeFixed)
        : gross * 0.155; // Default Airbnb ~15.5%
      const expectedNet = gross - expectedFee;
      const actualNet = Number(booking.hostPayout);
      const discrepancyPct = actualNet > 0 ? Math.abs((expectedNet - actualNet) / actualNet) * 100 : 0;
      const tolerance = 5; // 5% default tolerance

      if (discrepancyPct > tolerance) {
        await db.execute(sql`
          INSERT INTO guardian_audit_log (id, guardrailId, severity, action, targetId, details, createdAt)
          VALUES (
            UUID(), 'GR-5', 'warning', 'flagged', ${booking.id},
            ${JSON.stringify({ expectedNet, actualNet, discrepancyPct: Math.round(discrepancyPct * 100) / 100, platform: booking.platform })},
            NOW()
          )
        `);
        flagged++;
      } else {
        cleared++;
      }
    }

    return res.json({ processed: bookings.length, flagged, cleared, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[GuardianFinancial] Error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
