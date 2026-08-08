// iCal Polling Heartbeat Handler
// Endpoint: POST /api/scheduled/ical-poll
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Every 10 minutes - cron 6-field: 0 */10 * * * *
// Polls all active iCal platform feeds and upserts bookings into property_bookings.
// Idempotent - aggregatePlatformICal uses ON DUPLICATE KEY UPDATE internally.

import type { Request, Response } from "express";
import { getDb } from "../db";
import { propertyPlatforms, properties } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { aggregatePlatformICal, generateOutboundICS } from "../services/icalAggregator";
import { requireCronAuth } from "./scheduledAuth";

export async function icalPollHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  if (!requireCronAuth(req, res, "iCalPoll")) return;

  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    const platforms = await db
      .select({ id: propertyPlatforms.id, propertyId: propertyPlatforms.propertyId, displayName: propertyPlatforms.displayName, icalUrl: propertyPlatforms.icalUrl })
      .from(propertyPlatforms)
      .where(eq(propertyPlatforms.isActive, true));

    if (platforms.length === 0) {
      return res.json({ ok: true, polled: 0, errors: 0, durationMs: Date.now() - startedAt });
    }

    let polled = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Group platforms by propertyId so we regenerate the outbound ICS once per property
    const propertyIds = new Set<string>();

    for (const platform of platforms) {
      // BUGFIX #4: Skip platforms with no iCal URL (e.g., direct/manual booking platforms).
      // These platforms don't have external feeds to poll — calling aggregatePlatformICal
      // with an empty URL would trigger cancellation detection and mark all their bookings
      // as cancelled (cascade cancellation bug).
      if (!platform.icalUrl || platform.icalUrl.trim() === '') {
        continue;
      }

      try {
        const result = await aggregatePlatformICal(platform.id);
        polled++;
        propertyIds.add(platform.propertyId);
        console.log(`[iCalPoll] OK ${platform.displayName ?? platform.id} (${platform.id}): ${result.added} added, ${result.updated} updated`);
      } catch (err) {
        errors++;
        const msg = `${platform.displayName ?? platform.id} (${platform.id}): ${(err as Error)?.message ?? String(err)}`;
        errorDetails.push(msg);
        console.warn(`[iCalPoll] ERR ${msg}`);
      }
    }

    // Regenerate outbound ICS for each property that had at least one successful poll
    for (const propId of Array.from(propertyIds)) {
      try {
        const url = await generateOutboundICS(propId);
        await db.update(properties).set({ outboundIcsUrl: url }).where(eq(properties.id, propId));
        console.log(`[iCalPoll] Regenerated outbound ICS for ${propId}: ${url.substring(0, 60)}...`);
      } catch (err) {
        console.warn(`[iCalPoll] Failed to regenerate outbound ICS for ${propId}:`, (err as Error)?.message);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[iCalPoll] Complete: ${polled} polled, ${errors} errors, ${durationMs}ms`);

    return res.json({
      ok: true,
      polled,
      errors,
      durationMs,
      ...(errorDetails.length > 0 ? { errorDetails } : {}),
    });
  } catch (err) {
    const error = (err as Error)?.message ?? String(err);
    console.error("[iCalPoll] Fatal error:", err);
    return res.status(500).json({
      error,
      stack: (err as Error)?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
