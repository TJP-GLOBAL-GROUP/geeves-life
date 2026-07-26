/**
 * P-15 Shadow Block Backfill Handler
 *
 * One-shot internal endpoint that re-propagates shadow blocks for all household
 * events from Jan 1 2025 that currently have no shadow blocks.
 *
 * Protected by x-cron-secret header.
 * POST /api/internal/shadow-block-backfill
 */
import type { Request, Response } from "express";
import { getDb } from "../db";
import { onEventUpserted } from "../services/eventPropagation";
import { events, shadowBlocks, calendars } from "../../drizzle/schema";
import { and, eq, ne, gte, lte, notExists } from "drizzle-orm";
import { ENV } from "../_core/env";

const JAN_1_2025 = new Date("2025-01-01T00:00:00Z").getTime();
const SIX_MONTHS_FORWARD = Date.now() + 180 * 24 * 60 * 60 * 1000;

export async function shadowBlockBackfillHandler(req: Request, res: Response) {
  // Validate cron secret
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== ENV.systemCronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Kill switch
  if (!ENV.shadowBlockEngineEnabled) {
    console.log("[ShadowBlockBackfill] Engine disabled (SHADOW_BLOCK_ENGINE_ENABLED=false) — skipping");
    return res.status(200).json({ skipped: true, reason: "shadow_block_engine_disabled" });
  }

  const conn = await getDb();
  if (!conn) return res.status(503).json({ error: "DB unavailable" });

  try {
    // Get all households
    const [allHouseholds] = await (conn as any).execute("SELECT id FROM households");
    let totalQueued = 0;
    let totalCalendars = 0;

    for (const household of allHouseholds as { id: string }[]) {
      const householdId = household.id;

      // Get all non-iCal, shadowSource=true calendars
      const sourceCals = await conn
        .select({ id: calendars.id, name: calendars.name })
        .from(calendars)
        .where(
          and(
            eq(calendars.householdId, householdId),
            ne(calendars.provider, "ical"),
            // shadowSource defaults to true (null = true)
            ne((calendars as any).shadowSource, false)
          )
        );

      totalCalendars += sourceCals.length;

      for (const cal of sourceCals) {
        // Events with no shadow blocks in the Jan 2025 → 6mo future window
        const eventsToBackfill = await conn
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.calendarId, cal.id),
              eq(events.isShadowBlock, false),
              ne(events.status, "cancelled"),
              gte(events.startTime, JAN_1_2025),
              lte(events.startTime, SIX_MONTHS_FORWARD),
              notExists(
                conn
                  .select({ id: shadowBlocks.id })
                  .from(shadowBlocks)
                  .where(eq(shadowBlocks.sourceEventId, events.id))
              )
            )
          );

        // Process events sequentially to avoid idempotency lock conflicts
        // and pass skipRateLimit + skipGoogleWrite to bypass per-calendar rate limits
        for (const ev of eventsToBackfill) {
          try {
            await onEventUpserted(ev.id, householdId, { skipGoogleWrite: true, skipRateLimit: true });
          } catch (e) {
            console.warn(`[ShadowBlockBackfill] Failed for event ${ev.id}:`, e);
          }
          totalQueued++;
        }
      }
    }

    console.log(
      `[ShadowBlockBackfill] Queued ${totalQueued} events across ${totalCalendars} calendars`
    );
    return res.json({ ok: true, totalQueued, totalCalendars });
  } catch (err) {
    console.error("[ShadowBlockBackfill] Error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
