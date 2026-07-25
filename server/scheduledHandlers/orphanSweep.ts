/**
 * DB-05: Orphan Sweep
 *
 * Deletes orphan rows that accumulate when parent records are deleted without
 * proper cascade cleanup. Runs weekly via heartbeat.
 *
 * Orphan types cleaned:
 * 1. events with no parent calendar (calendarId not in calendars.id)
 * 2. shadow_blocks with no source calendar (sourceCalendarId not in calendars.id)
 * 3. shadow_blocks with no target calendar (targetCalendarId not in calendars.id)
 */

import { Request, Response } from "express";
import { getDb } from "../db";
import { events, shadowBlocks, calendars, auditLog } from "../../drizzle/schema";
import { notInArray } from "drizzle-orm";

export async function orphanSweepHandler(req: Request, res: Response) {
  const secret = req.headers["x-cron-secret"] || req.headers["x-system-cron-secret"];
  if (secret !== process.env.SYSTEM_CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ status: "started", message: "Orphan sweep running in background" });

  // Run sweep in background to avoid request timeout
  setImmediate(async () => {
    try {
      const db = await getDb();
      if (!db) return;

      // Get all valid calendar IDs
      const calendarRows = await db.select({ id: calendars.id }).from(calendars);
      const calendarIds = calendarRows.map(r => r.id);

      if (calendarIds.length === 0) {
        console.log("[OrphanSweep] No calendars found — skipping sweep");
        return;
      }

      // 1. Delete events with no parent calendar
      const orphanEvents = await db.select({ id: events.id })
        .from(events)
        .where(notInArray(events.calendarId, calendarIds));

      let eventsDeleted = 0;
      if (orphanEvents.length > 0) {
        await db.delete(events).where(notInArray(events.calendarId, calendarIds));
        eventsDeleted = orphanEvents.length;
      }

      // 2. Delete shadow_blocks with no source calendar
      const orphanSourceBlocks = await db.select({ id: shadowBlocks.id })
        .from(shadowBlocks)
        .where(notInArray(shadowBlocks.sourceCalendarId, calendarIds));

      let sourceBlocksDeleted = 0;
      if (orphanSourceBlocks.length > 0) {
        await db.delete(shadowBlocks).where(notInArray(shadowBlocks.sourceCalendarId, calendarIds));
        sourceBlocksDeleted = orphanSourceBlocks.length;
      }

      // 3. Delete shadow_blocks with no target calendar (re-query after step 2)
      const orphanTargetBlocks = await db.select({ id: shadowBlocks.id })
        .from(shadowBlocks)
        .where(notInArray(shadowBlocks.targetCalendarId, calendarIds));

      let targetBlocksDeleted = 0;
      if (orphanTargetBlocks.length > 0) {
        await db.delete(shadowBlocks).where(notInArray(shadowBlocks.targetCalendarId, calendarIds));
        targetBlocksDeleted = orphanTargetBlocks.length;
      }

      const totalDeleted = eventsDeleted + sourceBlocksDeleted + targetBlocksDeleted;

      // Log to audit_log using the correct schema shape
      await db.insert(auditLog).values({
        action: "orphan_sweep",
        category: "system",
        resourceType: "system",
        resourceId: "orphan_sweep",
        outcome: "success",
        metadata: {
          eventsDeleted,
          sourceBlocksDeleted,
          targetBlocksDeleted,
          totalDeleted,
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`[OrphanSweep] Complete: ${eventsDeleted} orphan events, ${sourceBlocksDeleted} orphan source blocks, ${targetBlocksDeleted} orphan target blocks deleted (total: ${totalDeleted})`);
    } catch (err) {
      console.error("[OrphanSweep] Error:", err);
    }
  });
}
