/**
 * Google Calendar Webhook & Sync Orchestration
 * 
 * Handles:
 * 1. Webhook endpoint for Google push notifications
 * 2. Sync triggering (initial full sync + incremental sync)
 * 3. Calendar connection flow
 */

import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import * as db from "../db";
import {
  isGoogleCalendarConfigured,
  listGoogleCalendars,
  performFullSync,
  syncGoogleEvents,
  refreshAccessToken,
  fetchGoogleEvents,
  convertGoogleEvent,
  setupWebhookChannel,
} from "./googleCalendarSync";
import { emitSyncStatus, emitCalendarEvent } from "../realtime";
import { onEventUpserted, onEventDeleted } from "./eventPropagation";
import { notifyOwner } from "../_core/cloudNotification";
import { ENV } from "../_core/env";

/**
 * Fire a one-time owner notification + Resend email when a token is first marked expired.
 * Uses expiredNotifiedAt as a guard to prevent duplicate alerts on every sync failure.
 */
async function notifyTokenExpired(tokenId: string, accountEmail: string, memberId: string): Promise<void> {
  try {
    // Re-fetch to check if already notified (race condition guard)
    const token = await db.getOAuthTokenByEmail(memberId, "google", accountEmail);
    if (!token || (token as any).expiredNotifiedAt) return;
    // Mark notified first
    await db.updateOAuthToken(tokenId, { expiredNotifiedAt: new Date() } as any);
    // In-app push notification (non-blocking)
    notifyOwner({
      title: `⚠️ Google account disconnected: ${accountEmail}`,
      content: `Calendar sync is paused for ${accountEmail}. Shadow blocks and event propagation are suspended.\n\nGo to Settings → Integrations → Reconnect All to restore sync.`,
    }).catch(() => {});
    // Resend email alert (non-blocking)
    const apiKey = ENV.resendApiKey;
    if (apiKey) {
      const member = await db.getHouseholdMember(memberId);
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Geeves.Life Alerts <reports@geeves.life>",
          to: ["tarik@tjperkinsfam.com"],
          subject: `⚠️ Geeves: Google account disconnected — ${accountEmail}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#111;color:#eee">
<h2 style="color:#f59e0b;margin-top:0">⚠️ Google Account Disconnected</h2>
<p>The Google account <strong>${accountEmail}</strong>${member ? ` (${member.displayName})` : ""} has been disconnected from Geeves.Life.</p>
<p><strong>Impact:</strong> Calendar sync, shadow blocks, and event propagation are paused for this account.</p>
<p><a href="https://geeves.life/settings?tab=integrations" style="background:#14b8a6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">Reconnect Now →</a></p>
<hr style="margin:24px 0;border:none;border-top:1px solid #333">
<p style="font-size:12px;color:#666">Geeves.Life · geeves.life</p>
</div>`,
          text: `Google account disconnected: ${accountEmail}\n\nCalendar sync is paused. Reconnect at: https://geeves.life/settings?tab=integrations`,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn(`[Sync] Failed to send expiry notification for ${accountEmail}:`, err);
  }
}

// ─── Webhook Endpoint ──────────────────────────────────────────────

export function setupCalendarWebhook(app: Express) {
  /**
   * POST /api/webhooks/google-calendar
   * 
   * Google sends push notifications here when calendar events change.
   * We respond with 200 immediately, then process the sync asynchronously.
   */
  app.post("/api/webhooks/google-calendar", async (req: Request, res: Response) => {
    try {
      // B4: Optional webhook token validation (ENABLE_WEBHOOK_TOKEN_CHECK=true to enable)
      if (ENV.enableWebhookTokenCheck) {
        const channelToken = req.headers["x-goog-channel-token"] as string | undefined;
        const incomingChannelId = req.headers["x-goog-channel-id"] as string;
        const storedToken = await db.getWebhookToken(incomingChannelId);
        if (!storedToken || storedToken !== channelToken) {
          console.warn(`[Webhook] Invalid or missing token for channel ${incomingChannelId} — rejecting`);
          res.status(403).send("Invalid token");
          return;
        }
      }

      // Always respond 200 immediately (Google requires fast response)
      res.status(200).send("OK");

      const channelId = req.headers["x-goog-channel-id"] as string;
      const resourceId = req.headers["x-goog-resource-id"] as string;
      const resourceState = req.headers["x-goog-resource-state"] as string;

      console.log(`[Webhook] Received notification: state=${resourceState}, channel=${channelId}, resource=${resourceId}`);

      // Ignore sync messages (initial subscription confirmation)
      if (resourceState === "sync") {
        console.log("[Webhook] Sync confirmation received, ignoring");
        return;
      }

      // Look up the webhook channel to find the associated calendar
      const channel = await db.getWebhookChannelByResourceId(resourceId);
      if (!channel) {
        console.warn(`[Webhook] No active channel found for resource ${resourceId}`);
        return;
      }

      // Get the calendar details
      const calendar = await db.getCalendar(channel.calendarId);
      if (!calendar) {
        console.warn(`[Webhook] Calendar not found: ${channel.calendarId}`);
        return;
      }

      // Perform incremental sync
      await performIncrementalSync(calendar.id, calendar.householdId, calendar.externalId!, calendar.memberId);
    } catch (error) {
      console.error("[Webhook] Error processing notification:", error);
    }
  });

  console.log("[Calendar] Webhook endpoint registered at /api/webhooks/google-calendar");
}

// ─── Sync Operations ───────────────────────────────────────────────

/**
 * Perform an incremental sync for a calendar using its stored sync token.
 * Falls back to full sync if the token is expired.
 */
export async function performIncrementalSync(
  calendarId: string,
  householdId: string,
  googleCalendarId: string,
  memberId: string
): Promise<{ synced: number; errors: number }> {
  try {
    // Get access token (try service account first, then user OAuth)
    const accessToken = await getAccessTokenForCalendar(calendarId, memberId);
    if (!accessToken) {
      console.warn(`[Sync] No access token available for calendar ${calendarId}`);
      return { synced: 0, errors: 0 };
    }

    // Check for existing sync token
    const syncToken = await db.getCalendarSyncToken(calendarId);
    
    if (!syncToken) {
      // No sync token — perform full sync
      console.log(`[Sync] No sync token for calendar ${calendarId}, performing full sync`);
      return await performFullSyncForCalendar(calendarId, householdId, googleCalendarId, accessToken);
    }

    emitSyncStatus(householdId, calendarId, "syncing");

    // Incremental sync
    const result = await syncGoogleEvents(accessToken, googleCalendarId, syncToken);

    if (result.fullSyncRequired) {
      console.log(`[Sync] Sync token expired for calendar ${calendarId}, performing full sync`);
      return await performFullSyncForCalendar(calendarId, householdId, googleCalendarId, accessToken);
    }

    let synced = 0;
    let errors = 0;

    for (const gEvent of result.events) {
      try {
        const converted = convertGoogleEvent(gEvent, calendarId);

        // ── Shadow-block guard ─────────────────────────────────────────────
        // If this Google event is a shadow block we wrote to this calendar,
        // skip propagation entirely to prevent the delete-triggers-create loop.
        // A user deleting a shadow block on a target calendar should NOT trigger
        // new propagation — the source event controls the lifecycle.
        if (gEvent.id) {
          const shadowBlock = await db.getShadowBlockByExternalId(gEvent.id, calendarId);
          if (shadowBlock) {
            // This is a shadow block event — if it was deleted externally, clean up
            // the DB record but do NOT re-propagate from the source event.
            if (converted.status === "cancelled") {
              console.log(`[Sync] Shadow block ${gEvent.id} was deleted externally on ${calendarId} — cleaning up DB record`);
              await db.deleteShadowBlocksForEvent(shadowBlock.sourceEventId);
            }
            // Either way, skip further processing for this event
            continue;
          }
        }
        // ── End shadow-block guard ─────────────────────────────────────────

        // Aug 8 2026 (fix/recurring-delete-resurrection): a 'cancelled' tombstone
        // must DELETE the local row, not upsert a row with status='cancelled'.
        // Previously every tombstone re-created an events row, so a series deleted
        // with scope=all/following resurrected on the calendar after the webhook
        // sync that confirmed the deletion — making series deletes look broken.
        if (converted.status === "cancelled") {
          if (gEvent.id) {
            const drizzleDb = await db.getDb();
            if (drizzleDb) {
              const { sql: rawSql } = await import("drizzle-orm");
              const found: any = await drizzleDb.execute(rawSql`SELECT id FROM events WHERE calendarId = ${calendarId} AND externalId = ${gEvent.id} LIMIT 1`);
              const row = Array.isArray(found) ? (Array.isArray(found[0]) ? found[0][0] : found[0]) : null;
              if (row?.id) {
                await db.deleteEvent(row.id);
                onEventDeleted(row.id).catch(e => console.warn("[Sync] Propagation delete failed:", e));
              }
            }
          }
          synced++;
          emitCalendarEvent(householdId, "deleted", {
            calendarId,
            externalId: gEvent.id,
            title: converted.title,
            startTime: converted.startTime,
            endTime: converted.endTime,
          });
          continue;
        }

        const upserted = await db.upsertEvent({
          id: randomUUID(),
          ...converted,
          status: converted.status as "confirmed" | "tentative",
          calendarId,
          householdId,
          source: "sync",
        });
        // Propagate blocker events to all target Google Calendars
        onEventUpserted(upserted.id, householdId).catch(e => console.warn("[Sync] Propagation upsert failed:", e));
        synced++;
        // Emit real-time update so CalendarView auto-refetches
        emitCalendarEvent(householdId, converted.status === "cancelled" ? "deleted" : "updated", {
          calendarId,
          externalId: gEvent.id,
          title: converted.title,
          startTime: converted.startTime,
          endTime: converted.endTime,
        });
      } catch (e) {
        errors++;
        console.error(`[Sync] Error syncing event ${gEvent.id}:`, e);
      }
    }

    if (result.nextSyncToken) {
      await db.updateCalendarSyncToken(calendarId, result.nextSyncToken);
    }

    emitSyncStatus(householdId, calendarId, "synced");
    console.log(`[Sync] Incremental sync complete for ${calendarId}: ${synced} synced, ${errors} errors`);

    return { synced, errors };
  } catch (error) {
    console.error(`[Sync] Error during incremental sync for ${calendarId}:`, error);
    await db.setCalendarSyncError(calendarId, String(error));
    emitSyncStatus(householdId, calendarId, "error", String(error));
    return { synced: 0, errors: 1 };
  }
}

/**
 * Perform a full sync for a calendar.
 *
 * Exported (Aug 7 2026) so the reconnect recovery flow in googleAccountConnect.ts
 * can reuse this exact path — it propagates upserts/deletes through
 * onEventUpserted/onEventDeleted (so events created while an account was
 * disconnected generate their shadow blocks on recovery), applies the
 * shadow-block loop guard, and performs orphan cleanup.
 */
export async function performFullSyncForCalendar(
  calendarId: string,
  householdId: string,
  googleCalendarId: string,
  accessToken: string
): Promise<{ synced: number; errors: number }> {
  // Track which externalIds we see during this full sync for orphan cleanup
  const seenExternalIds = new Set<string>();

  const result = await performFullSync(accessToken, googleCalendarId, calendarId, householdId, {
    upsertEvent: async (event) => {
      // ── Shadow-block guard (full sync) ────────────────────────────────
      // If this event is a shadow block we wrote, skip propagation.
      if (event.externalId) {
        const shadowBlock = await db.getShadowBlockByExternalId(event.externalId, calendarId);
        if (shadowBlock) {
          if (event.status === "cancelled") {
            console.log(`[FullSync] Shadow block ${event.externalId} deleted externally — cleaning up`);
            await db.deleteShadowBlocksForEvent(shadowBlock.sourceEventId);
          }
          if (event.externalId) seenExternalIds.add(event.externalId);
          return; // skip further processing
        }
      }
      // ── End shadow-block guard ───────────────────────────────────────
      const upserted = await db.upsertEvent({
        id: randomUUID(),
        ...event,
        source: "sync",
      });
      if (event.externalId) seenExternalIds.add(event.externalId);
      // Propagate: cancelled = delete shadow blocks; otherwise re-propagate
      if (event.status === "cancelled") {
        onEventDeleted(upserted.id).catch(e =>
          console.warn("[FullSync] Propagation delete failed:", e)
        );
      } else {
        onEventUpserted(upserted.id, householdId).catch(e =>
          console.warn("[FullSync] Propagation upsert failed:", e)
        );
      }
      // Emit real-time update so CalendarView auto-refetches
      emitCalendarEvent(householdId, event.status === "cancelled" ? "deleted" : "updated", {
        calendarId,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
      });
    },
    updateSyncToken: async (calId, token) => {
      await db.updateCalendarSyncToken(calId, token);
    },
  });

  // Orphan cleanup: delete shadow blocks for events that no longer exist in Google
  // (events deleted externally between full syncs won't appear as "cancelled" — they simply
  // won't be in the response at all, so we must reconcile against our local records)
  try {
    const allLocalEvents = await db.getEventsByCalendar(calendarId);
    const orphans = allLocalEvents.filter(
      e => e.externalId && !seenExternalIds.has(e.externalId) && e.status !== "cancelled"
    );
    if (orphans.length > 0) {
      console.log(`[FullSync] Cleaning up ${orphans.length} orphaned shadow block(s) for calendar ${calendarId}`);
      for (const orphan of orphans) {
        await onEventDeleted(orphan.id);
      }
    }
  } catch (cleanupErr) {
    console.warn("[FullSync] Orphan cleanup failed:", cleanupErr);
  }

  return result;
}

/**
 * Get an access token for a calendar.
 *
 * All accounts use per-account OAuth tokens. Service account / domain-wide delegation
 * was deprecated in June 2026 — all Google accounts (personal Gmail, custom domains,
 * external Workspace) now authenticate via stored OAuth refresh tokens.
 */
export async function getAccessTokenForCalendar(calendarId: string, memberId: string): Promise<string | null> {
  // Multi-account: if the calendar has a specific accountEmail, use that token
  const calendar = calendarId !== "discovery" ? await db.getCalendar(calendarId) : null;
  const accountEmail = calendar?.accountEmail;

  // Get the appropriate OAuth token
  let oauthToken = accountEmail
    ? await db.getOAuthTokenByEmail(memberId, "google", accountEmail)
    : await db.getOAuthToken(memberId, "google");

  const emailForRouting = accountEmail || oauthToken?.accountEmail;

  // OAuth path: return stored access token if still valid (> 5 min remaining).
  // Only call Google's token endpoint when the token is expired or about to expire.
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  const tokenExpiresAt = oauthToken?.expiresAt ? Number(oauthToken.expiresAt) : 0;
  const tokenStillValid = oauthToken?.accessToken && tokenExpiresAt > Date.now() + REFRESH_BUFFER_MS;

  if (tokenStillValid) {
    return oauthToken!.accessToken;
  }

  if (oauthToken?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(oauthToken.refreshToken);
      await db.updateOAuthToken(oauthToken.id, {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        lastRefreshedAt: new Date(),
        status: "active",
      });
      return refreshed.accessToken;
    } catch (e) {
      // Refresh token has been revoked or expired — mark the token in the DB so
      // the UI health dot turns red and the user is prompted to reconnect.
      // Do NOT fall back to the stale access token: using a known-expired token
      // will only produce 401 errors from Google and mask the real problem.
      console.warn(`[Sync] OAuth token refresh failed for ${emailForRouting} — marking expired:`, e);
      try {
        await db.updateOAuthToken(oauthToken.id, { status: "expired" });
        // Fire one-time notification (non-blocking)
        if (emailForRouting) notifyTokenExpired(oauthToken.id, emailForRouting, memberId).catch(() => {});
      } catch (dbErr) {
        console.error(`[Sync] Failed to mark token expired for ${emailForRouting}:`, dbErr);
      }
      return null;
    }
  }

  // No refresh token available — mark as expired so UI can surface reconnect
  if (oauthToken) {
    console.warn(`[Sync] No refresh token for ${emailForRouting} — marking expired`);
    try {
      await db.updateOAuthToken(oauthToken.id, { status: "expired" });
      // Fire one-time notification (non-blocking)
      if (emailForRouting) notifyTokenExpired(oauthToken.id, emailForRouting, memberId).catch(() => {});
    } catch (dbErr) {
      console.error(`[Sync] Failed to mark token expired for ${emailForRouting}:`, dbErr);
    }
  }

  return null;
}

// ─── Webhook Registration ──────────────────────────────────────────

/**
 * Register (or renew) a push webhook channel for a single calendar.
 *
 * Extracted (Aug 7 2026) from registerAllWebhooks so the reconnect recovery
 * flow can restore push notifications for a reconnected account's calendars
 * immediately — previously channels were only (re)registered at server
 * startup, which meant a reconnected account had no live push channel until
 * the next deploy/restart, and new events created after reconnection were
 * never synced until then.
 *
 * Mirrors the startup-loop guards: skips Google-managed read-only calendars,
 * skips calendars with an active non-expiring channel (unless the stored
 * notification URL is stale), and skips calendars with no usable token.
 *
 * Returns true if a new channel was registered.
 */
export async function registerWebhookChannelForCalendar(calendarId: string): Promise<boolean> {
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
  if (!appUrl) {
    console.log("[Webhook] APP_URL not set — cannot register channel");
    return false;
  }

  const calendar = await db.getCalendar(calendarId);
  if (!calendar || !calendar.externalId) return false;

  // P-26: Google-managed read-only calendars reject push notification setup (HTTP 400)
  if (calendar.externalId.includes('group.v.calendar.google.com')) return false;

  const webhookUrl = `${appUrl}/api/webhooks/google-calendar`;

  // Skip if an active, non-expiring channel with a current URL already exists
  const existing = await db.getWebhookChannel(calendar.id);
  const expiresAt = existing?.expiresAt ? Number(existing.expiresAt) : 0;
  const soonExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24h from now
  const urlMismatch = existing?.notificationUrl && existing.notificationUrl !== webhookUrl;
  if (existing && expiresAt > soonExpiry && !urlMismatch) return false;

  const accessToken = await getAccessTokenForCalendar(calendar.id, calendar.memberId);
  if (!accessToken) {
    console.warn(`[Webhook] No access token for calendar ${calendar.id} (${calendar.name}) — skipping`);
    return false;
  }

  const channelId = randomUUID();
  const result = await setupWebhookChannel(accessToken, calendar.externalId, webhookUrl, channelId);
  if (existing) await db.expireWebhookChannel(existing.id);
  await db.createWebhookChannel({
    id: channelId,
    householdId: calendar.householdId,
    calendarId: calendar.id,
    resourceId: result.resourceId,
    resourceUri: null,
    // P-51: Store the notification URL so future startups can detect stale channels
    notificationUrl: webhookUrl,
    // Google returns expiration as a Unix-ms string; parseInt handles both forms
    expiresAt: parseInt(result.expiration, 10),
    token: null,
    status: "active",
  });
  console.log(`[Webhook] Registered channel for ${calendar.name} (${calendar.id}), expires ${result.expiration}`);
  return true;
}

/**
 * On server startup, register Google Calendar push webhooks for all calendars
 * that don't already have an active channel. Also renews channels expiring within 24h.
 */
export async function registerAllWebhooks(): Promise<void> {
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
  if (!appUrl) {
    console.log("[Webhook] APP_URL not set — skipping webhook registration");
    return;
  }
  try {
    const allCalendars = await db.getAllGoogleCalendars();
    let registered = 0;
    let skipped = 0;
    for (const calendar of allCalendars) {
      try {
        const didRegister = await registerWebhookChannelForCalendar(calendar.id);
        if (didRegister) registered++;
        else skipped++;
      } catch (err) {
        console.warn(`[Webhook] Failed to register webhook for calendar ${calendar.id}:`, err);
      }
    }
    console.log(`[Webhook] Startup registration complete: ${registered} registered, ${skipped} already active`);
  } catch (err) {
    console.warn("[Webhook] Startup registration failed:", err);
  }
}

// ─── Calendar Discovery & Connection ───────────────────────────────

/**
 * Discover all Google Calendars for a user and return them for selection.
 */
export async function discoverGoogleCalendars(memberId: string): Promise<{
  calendars: Array<{ id: string; name: string; primary: boolean; color: string; accessRole: string }>;
  error?: string;
}> {
  const accessToken = await getAccessTokenForCalendar("discovery", memberId);
  if (!accessToken) {
    return { calendars: [], error: "No access token available. Please sign in with Google first." };
  }

  try {
    const googleCalendars = await listGoogleCalendars(accessToken);
    return {
      calendars: googleCalendars.map(gc => ({
        id: gc.id,
        name: gc.summary,
        primary: gc.primary || false,
        color: gc.backgroundColor || "#4285f4",
        accessRole: gc.accessRole,
      })),
    };
  } catch (error) {
    return { calendars: [], error: String(error) };
  }
}

/**
 * P-27: Safe-by-default calendar flags (local copy for calendarWebhook.ts).
 * Mirrors the safeCalendarFlags function in calendar.ts router.
 */
function safeCalendarFlagsLocal(gcId: string, accessRole?: string): {
  shadowSource: boolean;
  shadowBlocking: boolean;
  noGoogleWrite: boolean;
} {
  const ext = gcId || '';
  const role = accessRole || 'owner';
  if (ext.includes('group.v.calendar.google.com')) {
    return { shadowSource: false, shadowBlocking: false, noGoogleWrite: true };
  }
  if (ext.includes('group.calendar.google.com')) {
    return { shadowSource: true, shadowBlocking: false, noGoogleWrite: true };
  }
  if (ext.startsWith('http') || ext.startsWith('webcal')) {
    return { shadowSource: true, shadowBlocking: false, noGoogleWrite: true };
  }
  if (role === 'reader' || role === 'freeBusyReader') {
    return { shadowSource: false, shadowBlocking: false, noGoogleWrite: true };
  }
  return { shadowSource: true, shadowBlocking: true, noGoogleWrite: false };
}

/**
 * Connect a Google Calendar to the household by creating a calendar record
 * and triggering an initial full sync.
 */
export async function connectGoogleCalendar(opts: {
  householdId: string;
  memberId: string;
  googleCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  provider?: "google_personal";  // always google_personal — workspace distinction removed
  /** When false, events on this calendar will NOT generate shadow blocks on other calendars. Default true. */
  shadowSource?: boolean;
  /** When false, this calendar will NOT receive shadow blocks from other calendars. Default true. */
  shadowBlocking?: boolean;
  /** accessRole from Google Calendar API — used to compute safe defaults */
  accessRole?: string;
}): Promise<{ calendarId: string; synced: number; errors: number }> {
  const calendarId = randomUUID();

  // P-27: Compute safe-by-default flags based on calendar type and access role.
  // Caller-provided shadowSource/shadowBlocking override the computed defaults.
  const safeFlags = safeCalendarFlagsLocal(opts.googleCalendarId, opts.accessRole);

  // Create the calendar record (A5: use correct provider type)
  await db.createCalendar({
    id: calendarId,
    householdId: opts.householdId,
    memberId: opts.memberId,
    provider: "google_personal",  // all Google calendars use google_personal (workspace deprecated)
    externalId: opts.googleCalendarId,
    accountEmail: undefined,
    name: opts.name,
    color: opts.color,
    syncType: "push",
    isPrimary: opts.isPrimary,
    isVisible: true,
    accessLevel: safeFlags.noGoogleWrite ? "read_only" : "read_write",
    shadowBlocking: opts.shadowBlocking ?? safeFlags.shadowBlocking,
    shadowSource: opts.shadowSource ?? safeFlags.shadowSource,
    noGoogleWrite: safeFlags.noGoogleWrite,
  });

  // Get access token and perform initial sync
  const accessToken = await getAccessTokenForCalendar(calendarId, opts.memberId);
  if (!accessToken) {
    return { calendarId, synced: 0, errors: 0 };
  }

  // Perform initial full sync
  const result = await performFullSyncForCalendar(
    calendarId, opts.householdId, opts.googleCalendarId, accessToken
  );

  // Set up webhook for push notifications (if we have a public URL)
  try {
    const didRegister = await registerWebhookChannelForCalendar(calendarId);
    if (!didRegister) {
      console.log(`[Calendar] Webhook not registered for calendar ${calendarId} (already active or unavailable — will fall back to polling)`);
    }
  } catch (webhookError) {
    console.warn("[Calendar] Failed to set up webhook (will fall back to polling):", webhookError);
  }

  return { calendarId, synced: result.synced, errors: result.errors };
}
