/**
 * Central Event Propagation Service
 *
 * Single entry point for all shadow-block logic. Called after ANY event
 * upsert or delete, regardless of source (manual, webhook sync, booking approval, import).
 *
 * What it does:
 *  1. For each source event, finds all TARGET calendars that should receive a
 *     "Busy" blocker based on cross-vertical visibility rules.
 *  2. Writes a shadow_blocks DB row for every target calendar — this is MANDATORY
 *     and happens even when the Google Calendar write fails (e.g. no access token).
 *  3. BEST-EFFORT: also writes a real blocker event to each target Google Calendar
 *     (so external users of those calendars see the block). Failure here is logged
 *     but does NOT prevent the DB row from being written.
 *  4. On delete, removes the blocker events from all target Google Calendars and
 *     deletes the shadow_blocks DB rows.
 *
 * Propagation rules (in priority order):
 *  A. Same vertical, different calendar (same or different member) → always propagate
 *     with the source vertical's busyLabel (or event title for same-member calendars).
 *  B. Cross-vertical: for every OTHER vertical in the household, check
 *     vertical_visibility rules. If a rule exists with visibilityLevel = "busy_only"
 *     or "full", propagate to all calendars in that target vertical using the
 *     rule's busyLabel.
 *  C. DEFAULT-BUSY FALLBACK: if no rules exist for the source vertical, propagate
 *     "Busy" to all other verticals.
 *  D. Calendars with no verticalId are skipped (holiday/iCal feeds etc.).
 *
 * KEY INVARIANT: The shadow_blocks DB row is ALWAYS written if a target calendar
 * is identified by the rules above. The Google Calendar write is best-effort only.
 * This ensures Geeves's own calendar view always shows the correct busy blocks,
 * even when Google Calendar API access is temporarily unavailable.
 */

import { nanoid } from "nanoid";
import { randomUUID } from "crypto";
import * as db from "../db";
import {
  createGoogleEvent,
  deleteGoogleEvent,
} from "./googleCalendarSync";
import { getAccessTokenForCalendar } from "./calendarWebhook";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";

// ─── Propagation Retry Queue ────────────────────────────────────────────────
/** Enqueue a failed propagation for later retry. Deduplicates by eventId. */
export async function enqueuePropagationRetry(
  eventId: string,
  householdId: string,
  reason: "rate_limit" | "circuit_breaker" | "lock_conflict" | "google_error" | "network_error",
): Promise<void> {
  try {
    const dbMod = await import("../db");
    const dbInstance = await dbMod.getDb();
    if (!dbInstance) return;
    const { propagationQueue } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    // Deduplicate: skip if already pending for this event
    const existing = await dbInstance.select({ id: propagationQueue.id }).from(propagationQueue)
      .where(and(eq(propagationQueue.eventId, eventId), eq(propagationQueue.status, "pending")))
      .limit(1);
    if (existing.length > 0) return;
    const now = Date.now();
    await dbInstance.insert(propagationQueue).values({
      id: randomUUID(),
      eventId,
      householdId,
      reason,
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: now + 60_000, // first retry in 1 minute
      createdAt: now,
      status: "pending",
    });
    console.log(`[Propagation] \u2709\ufe0f Enqueued retry for event ${eventId} (reason: ${reason})`);
  } catch (err) {
    console.warn(`[Propagation] Failed to enqueue retry for ${eventId}:`, (err as Error)?.message);
  }
}

// ─── Safeguard constants ────────────────────────────────────────────────────

/** Maximum shadow blocks a single onEventUpserted call may write. Exceeding this
 *  aborts the write and notifies the owner so they can investigate. */
const PROPAGATION_WRITE_CAP = 100;

/** Maximum shadow block writes to a single target calendar within a 1-hour window.
 *  Exceeding this pauses writes to that calendar and notifies the owner. */
const PER_CALENDAR_HOURLY_CAP = 2000;

/** Maximum new shadow_block rows across ALL calendars within a 10-minute window.
 *  Exceeding this trips the circuit breaker and halts ALL propagation.
 *  Raised from 500 → 2500 → 3000 after assessment showed legitimate propagation
 *  volume for the Constellation household exceeds prior caps. */
const CIRCUIT_BREAKER_10MIN_CAP = 3000;

// ─── Safeguard state (in-process, resets on server restart) ─────────────────

/** Idempotency lock: prevents concurrent onEventUpserted calls for the same event. */
const propagationLock = new Set<string>();

/** Per-calendar write counter: { count, windowStart (ms epoch) } */
const calendarWriteCounter = new Map<string, { count: number; windowStart: number }>();

/** Notification cooldown: PERSISTENT DB-based cooldown that survives cold starts.
 *  Reads lastNotifiedAt from notification_settings table and only allows sending
 *  if enough time has elapsed. Updates the timestamp atomically on send.
 */
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours fallback

/** Map from notification key prefix to the DB setting key */
const NOTIF_KEY_TO_SETTING: Record<string, string> = {
  "circuit-breaker": "circuit_breaker",
  "rate-limit": "rate_limit",
  "cancellation-pending": "cancellation_pending",
  "date-mismatch": "date_mismatch",
  "integration-health": "integration_health",
  "propagation-health": "propagation_health",
};

/**
 * Check if a notification should be sent, using PERSISTENT DB-based cooldown.
 * This survives serverless cold starts unlike the previous in-memory Map approach.
 */
async function shouldNotifyAsync(key: string): Promise<boolean> {
  const settingKey = Object.entries(NOTIF_KEY_TO_SETTING).find(([prefix]) => key.startsWith(prefix))?.[1];
  if (!settingKey) {
    // Unknown key — allow but with a basic in-memory guard
    return true;
  }
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return false; // Can't verify cooldown — suppress to be safe
    const { notificationSettings } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(notificationSettings).where(eq(notificationSettings.key, settingKey)).limit(1);
    const row = rows[0];
    if (!row) {
      // No setting row exists — create one with default 6h cooldown and mark as just notified
      await db.insert(notificationSettings).values({
        key: settingKey,
        label: settingKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        description: `Auto-created setting for ${settingKey}`,
        cooldownHours: 6,
        enabled: true,
        householdId: "system",
        lastNotifiedAt: Date.now(),
      }).onDuplicateKeyUpdate({ set: { lastNotifiedAt: Date.now() } });
      return true; // First time — allow
    }
    // If disabled, never notify
    if (!row.enabled) return false;
    // Check persistent cooldown
    const cooldownMs = row.cooldownHours * 60 * 60 * 1000;
    const lastNotified = row.lastNotifiedAt ?? 0;
    if (Date.now() - lastNotified < cooldownMs) return false;
    // Update lastNotifiedAt atomically
    await db.update(notificationSettings)
      .set({ lastNotifiedAt: Date.now() })
      .where(eq(notificationSettings.key, settingKey));
    return true;
  } catch (err) {
    console.error(`[Notification] Cooldown check failed for ${key}:`, err);
    return false; // Suppress on error to prevent flood
  }
}

/** Circuit breaker: total new rows written in the last 10-minute window. */
let circuitBreakerCount = 0;
let circuitBreakerWindowStart = Date.now();
let circuitBreakerTripped = false;

/** Reset the 10-minute circuit breaker window. */
function tickCircuitBreaker(newRows: number): boolean {
  const now = Date.now();
  if (now - circuitBreakerWindowStart > 10 * 60 * 1000) {
    circuitBreakerCount = 0;
    circuitBreakerWindowStart = now;
    circuitBreakerTripped = false;
  }
  circuitBreakerCount += newRows;
  if (circuitBreakerCount > CIRCUIT_BREAKER_10MIN_CAP && !circuitBreakerTripped) {
    circuitBreakerTripped = true;
    shouldNotifyAsync("circuit-breaker").then(ok => {
      if (ok) {
        notifyOwner({
          title: "🚨 Geeves Shadow Block Circuit Breaker Tripped",
          content:
            `Shadow block writes exceeded ${CIRCUIT_BREAKER_10MIN_CAP} rows in 10 minutes ` +
            `(current window: ${circuitBreakerCount} rows). All propagation is now paused. ` +
            `Restart the server or call /api/internal/reset-circuit-breaker to resume.`,
        }).catch(() => {});
      }
    }).catch(() => {});
    return true; // tripped
  }
  return circuitBreakerTripped;
}

/** Check and increment the per-calendar hourly write counter.
 *  Returns true if the calendar has been rate-limited (caller should skip the write). */
function checkCalendarRateLimit(calendarId: string): boolean {
  const now = Date.now();
  const entry = calendarWriteCounter.get(calendarId);
  if (!entry || now - entry.windowStart > 60 * 60 * 1000) {
    calendarWriteCounter.set(calendarId, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (entry.count > PER_CALENDAR_HOURLY_CAP) {
    if (entry.count === PER_CALENDAR_HOURLY_CAP + 1) {
      shouldNotifyAsync(`rate-limit-${calendarId}`).then(ok => {
        if (ok) {
          notifyOwner({
            title: "⚠️ Geeves Shadow Block Rate Limit",
            content:
              `Calendar ${calendarId} has received more than ${PER_CALENDAR_HOURLY_CAP} shadow block writes in the last hour. ` +
              `Further writes to this calendar are paused for the remainder of the hour.`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }
    return true; // rate-limited
  }
  return false;
}

/** Expose a way to reset the circuit breaker from an admin endpoint. */
export function resetCircuitBreaker(): void {
  circuitBreakerCount = 0;
  circuitBreakerWindowStart = Date.now();
  circuitBreakerTripped = false;
  console.log("[Propagation] Circuit breaker manually reset");
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface PropagationTarget {
  calendarId: string;
  externalCalendarId: string | null; // Google Calendar ID (null = no external calendar)
  memberId: string;
  maskedTitle: string;
  accessToken: string | null; // null = no token available (Google write will be skipped)
  // P-25: when true, skip Google Calendar API write for this target (external/work/shared calendars)
  noGoogleWrite: boolean;
}

// ─── Main API ──────────────────────────────────────────────────────────────

/**
 * Called after any event create or update.
 * Idempotent: deletes existing shadow blocks for this event, then re-propagates.
 *
 * IMPORTANT: Shadow blocks DB rows are ALWAYS written for all target calendars
 * identified by visibility rules, regardless of whether the Google Calendar write
 * succeeds. This ensures Geeves's own calendar view is always correct.
 */
export async function onEventUpserted(
  eventId: string,
  householdId: string,
  options: { skipGoogleWrite?: boolean; skipRateLimit?: boolean } = {},
): Promise<void> {
  try {
    // Kill switch: SHADOW_BLOCK_ENGINE_ENABLED=false disables all propagation
    if (!ENV.shadowBlockEngineEnabled) {
      console.log(`[Propagation] Shadow block engine is disabled (SHADOW_BLOCK_ENGINE_ENABLED=false) — skipping propagation for event ${eventId}`);
      return;
    }
    const event = await db.getEvent(eventId);
    if (!event) {
      console.warn(`[Propagation] Event ${eventId} not found in DB — skipping propagation`);
      return;
    }

    const srcCal = await db.getCalendar(event.calendarId);
    if (!srcCal || !srcCal.verticalId) {
      // B1: Loud error + throw so the webhook retry queue can re-attempt
      console.error(`[Propagation] CRITICAL: Event ${eventId} on calendar "${(srcCal as any)?.name || 'unknown'}" (${srcCal?.id}, household: ${(srcCal as any)?.householdId || 'unknown'}) has no verticalId. Propagation aborted.`);
      throw new Error(`Calendar ${srcCal?.id || 'unknown'} has no verticalId — cannot propagate event ${eventId}`);
    }

    // Skip cancelled events — delegate to onEventDeleted
    if (event.status === "cancelled") {
      await onEventDeleted(eventId);
      return;
    }

    // Skip shadow block events — they were written by propagation itself and
    // must not re-propagate when synced back from Google Calendar (infinite loop guard)
    if (event.isShadowBlock) {
      console.log(`[Propagation] Event ${eventId} is a shadow block — skipping re-propagation`);
      return;
    }

    // P-15: shadowSource guard — shared/team calendars (e.g. Team StartOut, Family shared)
    // have shadowSource=false and must NOT generate shadow blocks on other calendars.
    // They can still RECEIVE blocks (controlled by shadowBlocking on the target).
    if (!(srcCal as any).shadowSource && (srcCal as any).shadowSource !== undefined) {
      console.log(`[Propagation] Calendar ${srcCal.id} (${srcCal.name}) has shadowSource=false — skipping outbound propagation`);
      return;
    }

    // ── Idempotency lock ───────────────────────────────────────────────────
    if (propagationLock.has(eventId)) {
      console.log(`[Propagation] Event ${eventId} is already being propagated — skipping concurrent call`);
      return;
    }
    propagationLock.add(eventId);

    // ── Circuit breaker check ──────────────────────────────────────────────
    // skipRateLimit=true (used by retry handler) bypasses the breaker entirely
    if (circuitBreakerTripped && !options.skipRateLimit) {
      console.warn(`[Propagation] Circuit breaker is tripped — skipping propagation for event ${eventId}`);
      enqueuePropagationRetry(eventId, householdId, "circuit_breaker").catch(() => {});
      propagationLock.delete(eventId);
      return;
    }

    // Build the list of targets (includes calendars with no token — they still get DB rows)
    const targets = await buildPropagationTargets(srcCal, householdId, event.title ?? "Busy", {
      isAllDay: event.isAllDay ?? false,
      isMultiDay: (event.isAllDay ?? false) && (Number(event.endTime) - Number(event.startTime)) > 86400000,
    });
    if (targets.length === 0) {
      console.log(`[Propagation] Event ${eventId}: no propagation targets found`);
      propagationLock.delete(eventId);
      return;
    }

    // ── Write-cap safeguard ────────────────────────────────────────────────
    if (targets.length > PROPAGATION_WRITE_CAP) {
      console.error(
        `[Propagation] ⛔ Write-cap exceeded for event ${eventId}: ` +
        `${targets.length} targets > cap of ${PROPAGATION_WRITE_CAP}. Aborting propagation.`
      );
      await notifyOwner({
        title: "⛔ Geeves Shadow Block Write-Cap Exceeded",
        content:
          `Event "${event.title}" (ID: ${eventId}) would generate ${targets.length} shadow blocks, ` +
          `which exceeds the safety cap of ${PROPAGATION_WRITE_CAP}. ` +
          `Propagation was aborted. Please review your vertical visibility rules and calendar shadowBlocking settings, ` +
          `then call the admin repropagateEvent procedure to manually approve this event.`,
      }).catch(() => {});
      propagationLock.delete(eventId);
      return;
    }

    // Delete stale shadow blocks (and their Google blockers) before re-propagating
    try {
      await deleteExistingBlockers(eventId);
    } catch (deleteErr) {
      console.warn(`[Propagation] Could not delete existing blockers for ${eventId}:`, deleteErr);
    }

    // Write shadow_blocks DB rows and best-effort Google Calendar events
    const newBlocks: Array<{
      id: string;
      householdId: string;
      sourceEventId: string;
      sourceCalendarId: string;
      targetCalendarId: string;
      maskedTitle: string;
      startTime: number;
      endTime: number;
      isAllDay: boolean;
      isDismissed: boolean;
      externalEventId: string | null;
      syncStatus: 'pending_sync' | 'synced' | 'sync_failed';
      syncAttempts: number;
      lastSyncError: string | null;
      lastSyncAttemptAt: number | null;
    }> = [];

    for (const target of targets) {
      // ── Per-calendar rate limit check ──────────────────────────────────
      if (!options.skipRateLimit && checkCalendarRateLimit(target.calendarId)) {
        console.warn(`[Propagation] ⏸ Calendar ${target.calendarId} hit hourly cap (${PER_CALENDAR_HOURLY_CAP}/hr). Queuing retry for remaining targets.`);
        enqueuePropagationRetry(eventId, householdId, "rate_limit").catch(() => {});
        continue;
      }

      let externalEventId: string | null = null;

      // P-25b: Idempotency guard — if a shadow block already exists with an externalEventId,
      // the Google event was already created; skip the write to prevent duplicates.
      // This handles the case where propagateEvent is called twice (e.g. webhook + poll race).
      const existingBlock = await db.getShadowBlockBySourceAndTarget(eventId, target.calendarId);
      if (existingBlock?.externalEventId) {
        externalEventId = existingBlock.externalEventId;
        console.log(`[Propagation] ⏭ Skipping Google write for ${target.externalCalendarId} — already has externalEventId ${existingBlock.externalEventId}`);
      }
      // P4: Google write is MANDATORY when conditions are met. Failure = sync_failed (not silent).
      // P-25: noGoogleWrite guard — skip Google API write for external/work/shared calendars
      // P-26: Auto-detect Google-managed read-only calendars by externalId pattern.
      // group.v.calendar.google.com calendars (holidays, shared read-only feeds) always reject writes.
      const isGoogleManagedReadOnly = !!(target.externalCalendarId?.includes('group.v.calendar.google.com'));
      let syncStatus: 'pending_sync' | 'synced' | 'sync_failed' = 'pending_sync';
      let syncError: string | null = null;

      // Determine if this target SHOULD get a Google write
      const shouldWriteToGoogle = !options.skipGoogleWrite && !target.noGoogleWrite && !isGoogleManagedReadOnly && target.externalCalendarId;
      // Determine if this target CAN'T get a Google write (no token, no accountEmail, etc.)
      const cannotWriteToGoogle = !target.accessToken;

      if (isGoogleManagedReadOnly && !target.noGoogleWrite) {
        console.log(`[Propagation] 🔒 Auto-detected read-only Google calendar ${target.externalCalendarId} — marking synced (no write needed)`);
        syncStatus = 'synced'; // Read-only calendars don't need writes
      } else if (target.noGoogleWrite || options.skipGoogleWrite) {
        // Explicitly opted out of Google writes — mark as synced (this is intentional)
        syncStatus = 'synced';
        if (target.noGoogleWrite) {
          console.log(`[Propagation] 🔒 Calendar ${target.calendarId} has noGoogleWrite=true — DB-only (synced)`);
        }
      } else if (shouldWriteToGoogle && !cannotWriteToGoogle) {
        try {
          const tz = "America/New_York";
          const gEvent = await createGoogleEvent(target.accessToken!, target.externalCalendarId!, {
            summary: target.maskedTitle,
            description: "Blocked time (managed by Geeves)",
            start: event.isAllDay
              ? { date: new Date(Number(event.startTime)).toISOString().slice(0, 10) }
              : { dateTime: new Date(Number(event.startTime)).toISOString(), timeZone: tz },
            end: event.isAllDay
              // Google all-day end.date is EXCLUSIVE — add 1 day to the last inclusive day
              // B3: DST-safe — use setUTCDate(+1) instead of +86400000ms
              ? { date: (() => { const d = new Date(Number(event.endTime)); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })() }
              : { dateTime: new Date(Number(event.endTime)).toISOString(), timeZone: tz },
          });
          externalEventId = gEvent.id ?? null;
          syncStatus = 'synced';
          console.log(`[Propagation] ✓ Created Google blocker on ${target.externalCalendarId}: ${gEvent.id}`);
        } catch (err) {
          // P4: Google write failure is NOT silent — mark as sync_failed for retry
          syncStatus = 'sync_failed';
          syncError = (err as Error)?.message ?? String(err);
          console.error(`[Propagation] ✗ FAILED Google write to ${target.externalCalendarId}: ${syncError}`);
        }
      } else if (cannotWriteToGoogle) {
        // No access token — this is a sync failure, not a silent skip
        syncStatus = 'sync_failed';
        syncError = `No access token for calendar ${target.calendarId}`;
        console.error(`[Propagation] ✗ No access token for calendar ${target.calendarId} — marking sync_failed`);
      } else if (!target.externalCalendarId) {
        // No external calendar ID — can't write to Google, mark as failed
        syncStatus = 'sync_failed';
        syncError = `Calendar ${target.calendarId} has no externalCalendarId`;
        console.error(`[Propagation] ✗ Calendar ${target.calendarId} has no external ID — marking sync_failed`);
      }

      // ALWAYS write the DB row — this is the mandatory part
      // Include startTime/endTime/isAllDay so the calendar view can render shadow blocks
      // without a JOIN back to the events table on every query.
      // P4: syncStatus tracks whether Google write succeeded
      newBlocks.push({
        id: nanoid(),
        householdId,
        sourceEventId: eventId,
        sourceCalendarId: event.calendarId,
        targetCalendarId: target.calendarId,
        maskedTitle: target.maskedTitle,
        startTime: Number(event.startTime),
        endTime: Number(event.endTime),
        isAllDay: event.isAllDay ?? false,
        isDismissed: false,
        externalEventId,
        syncStatus,
        syncAttempts: syncStatus === 'sync_failed' ? 1 : 0,
        lastSyncError: syncError,
        lastSyncAttemptAt: syncStatus !== 'synced' || externalEventId ? Date.now() : null,
      });
    }

    // ── Circuit breaker tick ──────────────────────────────────────────────
    if (newBlocks.length > 0 && tickCircuitBreaker(newBlocks.length)) {
      console.error(`[Propagation] ⚡ Circuit breaker tripped during event ${eventId} — halting remaining writes`);
      // Still write the blocks we already prepared (they're already in newBlocks)
      // but future calls will be blocked until the breaker is reset.
    }

    if (newBlocks.length > 0) {
      const dbInstance = await (db as any).getDb?.();
      if (dbInstance) {
        const { shadowBlocks } = await import("../../drizzle/schema");
        const { sql: rawSql } = await import("drizzle-orm");
        for (const block of newBlocks) {
          try {
            await dbInstance.insert(shadowBlocks).values(block);
          } catch (err: any) {
            if (err?.code === 'ER_DUP_ENTRY' || err?.message?.includes('Duplicate entry')) {
              // Already exists — update the externalEventId, maskedTitle, and sync fields
              await dbInstance.update(shadowBlocks)
                .set({
                  externalEventId: block.externalEventId,
                  maskedTitle: block.maskedTitle,
                  syncStatus: block.syncStatus,
                  syncAttempts: block.syncAttempts,
                  lastSyncError: block.lastSyncError,
                  lastSyncAttemptAt: block.lastSyncAttemptAt,
                  updatedAt: rawSql`now()`,
                })
                .where(
                  rawSql`sourceEventId = ${block.sourceEventId} AND targetCalendarId = ${block.targetCalendarId}`
                );
            } else {
              throw err;
            }
          }
        }
      }
    }

    const syncedCount = newBlocks.filter(b => b.syncStatus === 'synced').length;
    const failedCount = newBlocks.filter(b => b.syncStatus === 'sync_failed').length;
    const pendingCount = newBlocks.filter(b => b.syncStatus === 'pending_sync').length;
    console.log(
      `[Propagation] Event ${eventId} ("${event.title}"): ` +
      `${newBlocks.length} block(s) — ${syncedCount} synced, ${failedCount} sync_failed, ${pendingCount} pending`
    );
  } catch (err) {
    console.error(`[Propagation] Error propagating event ${eventId}:`, err);
  } finally {
    propagationLock.delete(eventId);
  }
}

/**
 * Called after any event delete.
 * Removes all Google blocker events and shadow_block rows for this event.
 */
export async function onEventDeleted(eventId: string): Promise<void> {
  try {
    // Kill switch: SHADOW_BLOCK_ENGINE_ENABLED=false disables all propagation
    if (!ENV.shadowBlockEngineEnabled) {
      console.log(`[Propagation] Shadow block engine is disabled — skipping delete propagation for event ${eventId}`);
      return;
    }
    await deleteExistingBlockers(eventId);
    console.log(`[Propagation] Cleaned up blockers for deleted event ${eventId}`);
  } catch (err) {
    console.error(`[Propagation] Error cleaning up event ${eventId}:`, err);
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Delete all existing shadow blocks for an event, including their Google Calendar
 * blocker events (best-effort — failures are logged but don't prevent DB cleanup).
 */
async function deleteExistingBlockers(eventId: string): Promise<void> {
  const existingBlocks = await getExistingShadowBlocks(eventId);

  for (const block of existingBlocks) {
    if (!block.externalEventId) continue;
    try {
      const tgtCal = await db.getCalendar(block.targetCalendarId);
      if (!tgtCal?.externalId) continue;
      const accessToken = await getAccessTokenForCalendar(tgtCal.id, tgtCal.memberId);
      if (!accessToken) continue;
      await deleteGoogleEvent(accessToken, tgtCal.externalId, block.externalEventId);
      console.log(`[Propagation] Deleted Google blocker ${block.externalEventId} from ${tgtCal.externalId}`);
    } catch (err) {
      console.warn(`[Propagation] Could not delete Google blocker ${block.externalEventId}:`, (err as Error)?.message ?? err);
    }
  }

  // Always delete from our DB regardless of Google write success
  await db.deleteShadowBlocksForEvent(eventId);
}

/**
 * Retrieve existing shadow blocks for an event.
 */
async function getExistingShadowBlocks(eventId: string) {
  try {
    const { getDb } = await import("../db");
    const dbInstance = await (getDb as any)();
    if (!dbInstance) return [];
    const { shadowBlocks } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return dbInstance.select().from(shadowBlocks).where(eq(shadowBlocks.sourceEventId, eventId));
  } catch {
    return [];
  }
}

/**
 * Build the full list of propagation targets for a source calendar event.
 *
 * KEY CHANGE: This function now returns ALL target calendars identified by visibility
 * rules, INCLUDING those with no access token. The caller decides whether to attempt
 * a Google Calendar write — but the DB shadow_block row is always written.
 *
 * Rules:
 *  1. Same-vertical siblings (different calendar, same household)
 *  2. Cross-vertical targets based on vertical_visibility rules
 *  3. DEFAULT-BUSY FALLBACK: if no rules exist, propagate to all other verticals
 */
async function buildPropagationTargets(
  srcCal: Awaited<ReturnType<typeof db.getCalendar>>,
  householdId: string,
  eventTitle: string,
  eventMeta: { isAllDay: boolean; isMultiDay: boolean } = { isAllDay: false, isMultiDay: false },
): Promise<PropagationTarget[]> {
  if (!srcCal) return [];

  const allCalendars = await db.getCalendars(householdId);
  const allVerticals = await db.getVerticals(householdId);

  // B2: Load all access rules in a single query instead of one per target calendar
  const allAccessRules = await db.getAllMemberCalendarAccessForHousehold(householdId);

  const srcVertical = allVerticals.find(v => v.id === srcCal.verticalId);
  const srcBusyLabel = (srcVertical as any)?.busyLabel || "Busy";

  const targets: PropagationTarget[] = [];
  const seen = new Set<string>();

  // ── Helper: check if a target member has excludeMultiDayEvents set ────────
  // Returns true if the event should be SKIPPED for this target member.
  // B2: Now synchronous — uses pre-loaded allAccessRules map (no DB round-trip per call)
  function shouldExcludeForMember(memberId: string, verticalId: string): boolean {
    if (!eventMeta.isMultiDay) return false; // only applies to multi-day all-day events
    const rule = allAccessRules.find(r => r.memberId === memberId && r.verticalId === verticalId);
    return !!rule?.excludeMultiDayEvents;
  }

  // ── Rule 1: same-vertical siblings ──────────────────────────────────────
  const sameVerticalCals = allCalendars.filter(
    c => c.verticalId === srcCal.verticalId && c.id !== srcCal.id
  );

  for (const tgt of sameVerticalCals) {
    if (seen.has(tgt.id)) continue;
    // P-10 + P-12: shadowBlocking guard MUST be applied to same-vertical siblings too.
    // MySQL returns 0/1 (TINYINT) not boolean — use falsy check.
    if (!(tgt as any).shadowBlocking) {
      console.log(`[Propagation] Calendar ${tgt.id} (${tgt.name}) has shadowBlocking=false — skipping same-vertical shadow block`);
      seen.add(tgt.id);
      continue;
    }
    // P-16: Skip calendars with NULL accountEmail — they can never sync to Google
    if (!(tgt as any).accountEmail) {
      console.log(`[Propagation] Calendar ${tgt.id} (${tgt.name}) has no accountEmail — skipping (cannot sync to Google)`);
      seen.add(tgt.id);
      continue;
    }
    // Check excludeMultiDayEvents for this member
    if (shouldExcludeForMember(tgt.memberId, tgt.verticalId!)) {
      console.log(`[Propagation] Skipping multi-day event for member ${tgt.memberId} (excludeMultiDayEvents=true)`);
      seen.add(tgt.id);
      continue;
    }
    // Same member → show real title; different member → show busyLabel
    const label = tgt.memberId === srcCal.memberId ? eventTitle : srcBusyLabel;
    // Try to get token — but don't skip if unavailable (DB row still needed)
    const token = tgt.externalId ? await getAccessTokenForCalendar(tgt.id, tgt.memberId) : null;
    targets.push({
      calendarId: tgt.id,
      externalCalendarId: tgt.externalId ?? null,
      memberId: tgt.memberId,
      maskedTitle: label,
      accessToken: token,
      noGoogleWrite: !!(tgt as any).noGoogleWrite,
    });
    seen.add(tgt.id);
  }

  // ── Rule 2: cross-vertical targets ──────────────────────────────────────
  const visibilityRules = await db.getVerticalVisibility(srcCal.verticalId!);
  const otherVerticals = allVerticals.filter(v => v.id !== srcCal.verticalId);

  if (visibilityRules.length === 0) {
    // No rules configured → default: show "Busy" on all other verticals
    console.log(`[Propagation] No visibility rules for vertical ${srcCal.verticalId} — applying default-busy to ${otherVerticals.length} other vertical(s)`);
    for (const vert of otherVerticals) {
      const targetCals = allCalendars.filter(c => c.verticalId === vert.id);
      for (const tgt of targetCals) {
        if (seen.has(tgt.id)) continue;
        if (!(tgt as any).shadowBlocking) continue; // MySQL returns 0/1; falsy check covers both false and 0
        if (!(tgt as any).accountEmail) continue; // P-16: no accountEmail = can never sync
        if (shouldExcludeForMember(tgt.memberId, tgt.verticalId!)) {
          console.log(`[Propagation] Skipping multi-day event for member ${tgt.memberId} (excludeMultiDayEvents=true)`);
          seen.add(tgt.id);
          continue;
        }
        const token = tgt.externalId ? await getAccessTokenForCalendar(tgt.id, tgt.memberId) : null;
        targets.push({
          calendarId: tgt.id,
          externalCalendarId: tgt.externalId ?? null,
          memberId: tgt.memberId,
          maskedTitle: "Busy",
          accessToken: token,
          noGoogleWrite: !!(tgt as any).noGoogleWrite,
        });
        seen.add(tgt.id);
      }
    }
  } else {
    // Rules exist — respect them exactly ("none" means explicitly blocked)
    for (const rule of visibilityRules) {
      if (rule.visibilityLevel === "none") continue;

      const label = rule.busyLabel || "Busy";
      // calendarExclusions: JSON array of calendar IDs excluded from shadow blocks for this rule.
      // Events can override per-event via shadow_overrides.
      const exclusions: string[] = Array.isArray((rule as any).calendarExclusions)
        ? (rule as any).calendarExclusions
        : [];
      const targetCals = allCalendars.filter(c => c.verticalId === rule.toVerticalId);

      for (const tgt of targetCals) {
        if (seen.has(tgt.id)) continue;
        if (!(tgt as any).shadowBlocking) continue; // MySQL returns 0/1; falsy check covers both false and 0
        if (!(tgt as any).accountEmail) continue; // P-16: no accountEmail = can never sync
        // Skip calendars excluded by the visibility rule (unless overridden per-event)
        if (exclusions.includes(tgt.id)) {
          console.log(`[Propagation] Calendar ${tgt.id} excluded by calendarExclusions rule ${rule.id} — skipping`);
          seen.add(tgt.id);
          continue;
        }
        if (shouldExcludeForMember(tgt.memberId, tgt.verticalId!)) {
          console.log(`[Propagation] Skipping multi-day event for member ${tgt.memberId} (excludeMultiDayEvents=true)`);
          seen.add(tgt.id);
          continue;
        }
        const token = tgt.externalId ? await getAccessTokenForCalendar(tgt.id, tgt.memberId) : null;
        targets.push({
          calendarId: tgt.id,
          externalCalendarId: tgt.externalId ?? null,
          memberId: tgt.memberId,
          maskedTitle: label,
          accessToken: token,
          noGoogleWrite: !!(tgt as any).noGoogleWrite,
        });
        seen.add(tgt.id);
      }
    }

    // DEFAULT-BUSY for verticals NOT covered by any rule:
    const coveredVerticalIds = new Set(visibilityRules.map(r => r.toVerticalId));
    const uncoveredVerticals = otherVerticals.filter(v => !coveredVerticalIds.has(v.id));

    if (uncoveredVerticals.length > 0) {
      console.log(`[Propagation] ${uncoveredVerticals.length} vertical(s) not covered by rules — applying default-busy`);
      for (const vert of uncoveredVerticals) {
        const targetCals = allCalendars.filter(c => c.verticalId === vert.id);
        for (const tgt of targetCals) {
          if (seen.has(tgt.id)) continue;
          if (!(tgt as any).shadowBlocking) continue; // MySQL returns 0/1; falsy check covers both false and 0
          if (shouldExcludeForMember(tgt.memberId, tgt.verticalId!)) {
            console.log(`[Propagation] Skipping multi-day event for member ${tgt.memberId} (excludeMultiDayEvents=true)`);
            seen.add(tgt.id);
            continue;
          }
          const token = tgt.externalId ? await getAccessTokenForCalendar(tgt.id, tgt.memberId) : null;
          targets.push({
            calendarId: tgt.id,
            externalCalendarId: tgt.externalId ?? null,
            memberId: tgt.memberId,
            maskedTitle: "Busy",
            accessToken: token,
            noGoogleWrite: !!(tgt as any).noGoogleWrite,
          });
          seen.add(tgt.id);
        }
      }
    }
  }

  return targets;
}
