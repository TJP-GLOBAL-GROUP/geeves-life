// Shadow Block Sync Retry Heartbeat Handler
// Endpoint: POST /api/scheduled/shadow-block-sync-retry
// Auth:     Manus cron gateway via sdk.authenticateRequest
// Schedule: Every 2 minutes - cron 6-field: 0 */2 * * * *
//
// Picks up shadow_blocks with sync_status='sync_failed' or 'pending_sync' (where
// externalEventId IS NULL and the block SHOULD have a Google write), refreshes
// the access token, and attempts the Google Calendar write.
//
// Strategy: Round-robin across target calendars to avoid hammering the same calendar
// consecutively. This spreads the load and avoids per-calendar rate limits.
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { shadowBlocks, calendars } from "../../drizzle/schema";
import { eq, and, or, lte, isNull, sql } from "drizzle-orm";
import { getAccessTokenForCalendar } from "../services/calendarWebhook";

// Tuned for faster throughput while staying within Google Calendar quotas:
// Google allows ~60 events/min per calendar. With round-robin across 6-10 calendars,
// we can safely push 15 per calendar per run without hitting limits.
const DEFAULT_BATCH_SIZE = 100; // Total blocks to fetch per run (up from 20)
const MAX_PER_CALENDAR = 15;   // Max events per target calendar per run (up from 5)
const MAX_ATTEMPTS = 5;
const DELAY_BETWEEN_WRITES_MS = 200; // 200ms delay between Google API calls (down from 500ms)

// Google Calendar event create helper
async function createGoogleEvent(accessToken: string, calendarId: string, event: any) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function shadowBlockSyncRetryHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Authenticate via Manus cron gateway. Allow localhost for dev/test.
  try {
    // Kill switch
    if (!ENV.shadowBlockEngineEnabled) {
      console.log("[ShadowBlockSyncRetry] Engine disabled (SHADOW_BLOCK_ENGINE_ENABLED=false) — skipping");
      return res.status(200).json({ skipped: true, reason: "shadow_block_engine_disabled" });
    }
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      const ip = req.ip ?? "";
      const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
      if (!isInternal) return res.status(403).json({ error: "cron-only endpoint" });
    }
  } catch {
    const ip = req.ip ?? "";
    const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
    if (!isInternal) return res.status(401).json({ error: "Unauthorized" });
  }

  const db = await getDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  try {
    const now = Date.now();

    // Early exit: if ALL Google tokens are expired/revoked, skip sync entirely.
    // This avoids wasting cycles and incrementing sync_attempts when no valid token exists.
    const tokenHealthResult = await db.execute(
      sql`SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM oauth_tokens WHERE provider = 'google'`
    );
    const rawTH = Array.isArray(tokenHealthResult) ? (tokenHealthResult as any)[0] : tokenHealthResult;
    const tokenRow = (Array.isArray(rawTH) ? rawTH[0] : rawTH) as any;
    if (tokenRow && Number(tokenRow.total) > 0 && Number(tokenRow.active) === 0) {
      console.log('[ShadowBlockSyncRetry] All tokens expired — skipping run');
      return res.json({ processed: 0, synced: 0, failed: 0, skipped: 0, elapsed: Date.now() - startedAt, reason: 'all_tokens_expired' });
    }

    // ── Smart Priority Routing ─────────────────────────────────────────────
    // Fresh events (created in last 5 min) get processed FIRST so users see
    // immediate shadow blocks for events they just created. Backlog items fill
    // remaining capacity. This prevents new events from waiting behind 14k+ backlog.
    //
    // Priority tiers (computed dynamically from createdAt):
    //   0 = URGENT: created < 5 minutes ago (user just made this event)
    //   1 = FRESH:  created < 24 hours ago
    //   2 = BACKLOG: older than 24 hours
    //
    // Within each tier, round-robin by targetCalendarId to spread load.
    const URGENT_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
    const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
    const urgentCutoff = new Date(now - URGENT_WINDOW_MS).toISOString().slice(0, 19).replace('T', ' ');
    const freshCutoff = new Date(now - FRESH_WINDOW_MS).toISOString().slice(0, 19).replace('T', ' ');

    const blocksToSync = await db
      .select({
        id: shadowBlocks.id,
        sourceEventId: shadowBlocks.sourceEventId,
        sourceCalendarId: shadowBlocks.sourceCalendarId,
        targetCalendarId: shadowBlocks.targetCalendarId,
        maskedTitle: shadowBlocks.maskedTitle,
        startTime: shadowBlocks.startTime,
        endTime: shadowBlocks.endTime,
        isAllDay: shadowBlocks.isAllDay,
        syncAttempts: shadowBlocks.syncAttempts,
        syncStatus: shadowBlocks.syncStatus,
        createdAt: shadowBlocks.createdAt,
      })
      .from(shadowBlocks)
      .where(
        and(
          or(
            eq(shadowBlocks.syncStatus, "sync_failed"),
            and(
              eq(shadowBlocks.syncStatus, "pending_sync"),
              isNull(shadowBlocks.externalEventId),
            )
          ),
          sql`${shadowBlocks.syncAttempts} < ${MAX_ATTEMPTS}`,
          // Backoff: only retry if enough time has passed (30s for pending, 60s for failed)
          or(
            isNull(sql`last_sync_attempt_at`),
            lte(sql`last_sync_attempt_at`, now - 30000),
          )
        )
      )
      .orderBy(
        // Priority routing: URGENT first, then FRESH, then BACKLOG
        sql`CASE
          WHEN ${shadowBlocks.createdAt} > ${urgentCutoff} THEN 0
          WHEN ${shadowBlocks.createdAt} > ${freshCutoff} THEN 1
          ELSE 2
        END`,
        // Within each priority tier, round-robin by calendar
        shadowBlocks.targetCalendarId
      )
      .limit(DEFAULT_BATCH_SIZE);

    if (blocksToSync.length === 0) {
      return res.json({ processed: 0, synced: 0, failed: 0, elapsed: Date.now() - startedAt });
    }

    // Log priority tier distribution for observability
    const urgentCutoffTs = now - URGENT_WINDOW_MS;
    const freshCutoffTs = now - FRESH_WINDOW_MS;
    let urgentCount = 0, freshCount = 0, backlogCount = 0;
    for (const b of blocksToSync) {
      const created = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (created > urgentCutoffTs) urgentCount++;
      else if (created > freshCutoffTs) freshCount++;
      else backlogCount++;
    }
    console.log(`[ShadowBlockSyncRetry] Batch: ${blocksToSync.length} blocks (${urgentCount} urgent, ${freshCount} fresh, ${backlogCount} backlog)`);

    // Group blocks by targetCalendarId for round-robin processing
    const blocksByCalendar = new Map<string, typeof blocksToSync>();
    for (const block of blocksToSync) {
      const existing = blocksByCalendar.get(block.targetCalendarId) || [];
      existing.push(block);
      blocksByCalendar.set(block.targetCalendarId, existing);
    }

    // Pre-fetch calendar info and tokens for all target calendars
    const calendarMap = new Map<string, { memberId: string; externalId: string | null; accountEmail: string | null }>();
    const tokenCache = new Map<string, string | null>();
    const targetCalIds = Array.from(blocksByCalendar.keys());

    for (const calId of targetCalIds) {
      const [cal] = await db
        .select({
          memberId: calendars.memberId,
          externalId: calendars.externalId,
          accountEmail: (calendars as any).accountEmail ?? sql`NULL`,
        })
        .from(calendars)
        .where(eq(calendars.id, calId))
        .limit(1);
      if (cal) {
        calendarMap.set(calId, { memberId: cal.memberId, externalId: cal.externalId, accountEmail: null });
        // Pre-fetch token (one refresh per calendar, not per block)
        const token = await getAccessTokenForCalendar(calId, cal.memberId);
        tokenCache.set(calId, token);
      }
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const perCalendarCount = new Map<string, number>();
    const blockedCalendars = new Set<string>(); // Calendars that hit quota or permanent errors

    // Round-robin: interleave blocks from different calendars
    // This ensures we never hit the same calendar consecutively
    const roundRobinQueue: typeof blocksToSync = [];
    const iterators = Array.from(blocksByCalendar.entries()).map(([calId, blocks]) => ({
      calId,
      blocks,
      index: 0,
    }));

    // Build interleaved queue
    let hasMore = true;
    while (hasMore) {
      hasMore = false;
      for (const iter of iterators) {
        if (iter.index < iter.blocks.length) {
          roundRobinQueue.push(iter.blocks[iter.index]);
          iter.index++;
          hasMore = true;
        }
      }
    }

    for (const block of roundRobinQueue) {
      // Skip if this calendar is blocked (quota exceeded or permanent error)
      if (blockedCalendars.has(block.targetCalendarId)) {
        skipped++;
        continue;
      }

      // Per-calendar throttle: skip if we've already written MAX_PER_CALENDAR to this calendar
      const calCount = perCalendarCount.get(block.targetCalendarId) || 0;
      if (calCount >= MAX_PER_CALENDAR) {
        skipped++;
        continue;
      }

      const calInfo = calendarMap.get(block.targetCalendarId);
      if (!calInfo || !calInfo.externalId) {
        // Can't sync — no calendar info or no external ID
        await db.update(shadowBlocks)
          .set({
            syncStatus: "sync_failed",
            syncAttempts: block.syncAttempts + 1,
            lastSyncError: `Calendar ${block.targetCalendarId} missing or has no externalId`,
            lastSyncAttemptAt: now,
          })
          .where(eq(shadowBlocks.id, block.id));
        failed++;
        continue;
      }

      // Get cached access token (already pre-fetched)
      const accessToken = tokenCache.get(block.targetCalendarId);
      if (!accessToken) {
        // Token unavailable — do NOT increment syncAttempts (token expiry is not the block's fault).
        // Just update lastSyncAttemptAt so the backoff timer resets, and mark as pending_sync
        // so it will be retried once the token is refreshed/reconnected.
        await db.update(shadowBlocks)
          .set({
            syncStatus: "pending_sync",
            lastSyncError: `No access token available for calendar ${block.targetCalendarId} (token expired)`,
            lastSyncAttemptAt: now,
          })
          .where(eq(shadowBlocks.id, block.id));
        failed++;
        // Block this calendar for the rest of the run — no point retrying without token
        blockedCalendars.add(block.targetCalendarId);
        continue;
      }

      // Attempt Google Calendar write
      try {
        const tz = "America/New_York";
        const gEvent = await createGoogleEvent(accessToken, calInfo.externalId, {
          summary: block.maskedTitle || "Busy",
          description: "Blocked time (managed by Geeves)",
          start: block.isAllDay
            ? { date: new Date(Number(block.startTime)).toISOString().slice(0, 10) }
            : { dateTime: new Date(Number(block.startTime)).toISOString(), timeZone: tz },
          end: block.isAllDay
            ? { date: new Date(Number(block.endTime!) + 86400000).toISOString().slice(0, 10) }
            : { dateTime: new Date(Number(block.endTime)).toISOString(), timeZone: tz },
        });

        // Success — mark synced
        await db.update(shadowBlocks)
          .set({
            syncStatus: "synced",
            externalEventId: gEvent.id,
            syncAttempts: block.syncAttempts + 1,
            lastSyncError: null,
            lastSyncAttemptAt: now,
          })
          .where(eq(shadowBlocks.id, block.id));
        synced++;
        perCalendarCount.set(block.targetCalendarId, calCount + 1);
        // Throttle: short delay between writes to avoid burst
        if (DELAY_BETWEEN_WRITES_MS > 0) await new Promise(r => setTimeout(r, DELAY_BETWEEN_WRITES_MS));
      } catch (err) {
        const errorMsg = (err as Error)?.message ?? String(err);
        // Check if it's a permanent failure (e.g., 404 calendar not found, 403 no access, requiredAccessLevel)
        const isPermanent = errorMsg.includes("404") || errorMsg.includes("notFound") || errorMsg.includes("requiredAccessLevel");
        // Quota exceeded is transient — don't exhaust attempts, just back off
        const isQuota = errorMsg.includes("quotaExceeded") || errorMsg.includes("Calendar usage limits exceeded");
        // 401 = token expired/invalid — not the block's fault, don't increment attempts
        const isTokenExpired = errorMsg.includes("401") || errorMsg.includes("UNAUTHENTICATED") || errorMsg.includes("Invalid Credentials");
        // Generic 403 that's NOT requiredAccessLevel — likely a token issue, treat as transient
        const isGeneric403 = errorMsg.includes("403") && !errorMsg.includes("requiredAccessLevel") && !isQuota;

        await db.update(shadowBlocks)
          .set({
            syncStatus: (isQuota || isTokenExpired || isGeneric403) ? "pending_sync" : "sync_failed",
            syncAttempts: isPermanent ? MAX_ATTEMPTS : (isQuota || isTokenExpired || isGeneric403) ? block.syncAttempts : block.syncAttempts + 1,
            lastSyncError: errorMsg.slice(0, 1000),
            lastSyncAttemptAt: now,
          })
          .where(eq(shadowBlocks.id, block.id));
        failed++;

        // If quota exceeded, token expired, or generic 403, block this calendar for the rest of the run
        if (isQuota || isGeneric403 || isTokenExpired) {
          blockedCalendars.add(block.targetCalendarId);
        }
      }
    }

    console.log(
      `[ShadowBlockSyncRetry] Processed ${blocksToSync.length}: ${synced} synced, ${failed} failed, ${skipped} skipped (${Date.now() - startedAt}ms)`
    );

    return res.json({
      processed: blocksToSync.length,
      synced,
      failed,
      skipped,
      priority: { urgent: urgentCount, fresh: freshCount, backlog: backlogCount },
      elapsed: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[ShadowBlockSyncRetry] Handler error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
import { ENV } from "../_core/env";
