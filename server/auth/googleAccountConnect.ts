/**
 * Google Account Connect Routes
 *
 * Allows an already-authenticated Geeves user to connect additional Google
 * accounts for calendar sync — without replacing their existing session.
 *
 * Flow:
 *  1. User clicks "Add Google Account" in Settings > Calendars
 *  2. Frontend calls GET /api/auth/google/connect-account?origin=...&returnPath=...
 *  3. User authorises the Google account in the popup/redirect
 *  4. Callback at /api/auth/google/connect-account/callback stores the new
 *     oauth_tokens row (keyed by memberId + accountEmail) and auto-discovers
 *     all calendars for that account
 *  5. Redirects back to returnPath (typically /settings?tab=calendars)
 */

import type { Express, Request, Response } from "express";
import { GoogleAuthProvider, GOOGLE_SCOPES } from "./providers";
import * as db from "../db";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { randomUUID, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { registerNonce, verifyAndConsumeNonce } from "./nonceStore";

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function setupGoogleAccountConnect(app: Express) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[AccountConnect] Google OAuth not configured — skipping account-connect routes");
    return;
  }

  const provider = new GoogleAuthProvider(clientId, clientSecret);

  // ─── Initiate Account Connection ────────────────────────────────────
  app.get("/api/auth/google/connect-account", async (req: Request, res: Response) => {
    // Verify user is logged in
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).send("You must be logged in to connect a Google account.");
      return;
    }

    const origin = req.query.origin as string || `${req.protocol}://${req.get("host")}`;
    const returnPath = req.query.returnPath as string || "/settings?tab=calendars";

    // CSRF nonce — registered server-side (not in a cookie).
    // Mobile browsers silently drop cookies set during OAuth redirects, so
    // cookie-based nonces fail on mobile. Server-side storage is fully CSRF-safe.
    const nonce = generateNonce();
    await registerNonce(nonce);

    const state = Buffer.from(JSON.stringify({
      origin,
      returnPath,
      action: "connect_account",
      nonce,
    })).toString("base64url");

    const redirectUri = `${origin}/api/auth/google/connect-account/callback`;
    // Incremental auth: request calendar + gmail.send + gmail.readonly scopes here (not at login).
    // This is the correct point to ask for sensitive scopes — the user has
    // explicitly chosen to connect a Google account for calendar/email sync.
    //
    // NOTE: This legacy handler is used by const.ts getGoogleConnectAccountUrl().
    // New connections should use trpc.integrations.getConnectUrl (which calls
    // buildScopesForPurposes) so scopes stay in sync with the PURPOSE_SCOPES map.
    // This handler requests all feature scopes unconditionally as a safe default.
    //
    // IMPORTANT: GMAIL_READ (gmail.readonly) was added 2026-06-28 (P-09 fix).
    // Accounts connected before this date will NOT have gmail.readonly on their
    // token. They must reconnect via Settings > Integrations > Reconnect to get
    // the new scope. The checkEmailAuthStatus procedure checks for this scope.
    const featureScopes = [
      ...GOOGLE_SCOPES.IDENTITY,
      ...GOOGLE_SCOPES.CALENDAR,
      ...GOOGLE_SCOPES.GMAIL_SEND,
      ...GOOGLE_SCOPES.GMAIL_READ,   // P-09 fix: required for email scraping
      ...GOOGLE_SCOPES.SHEETS,       // Tax workbook and expense classification
      ...GOOGLE_SCOPES.DRIVE,        // File management and uploads
    ];
    const url = provider.getAuthorizationUrl(state, redirectUri, featureScopes);
    res.redirect(url);
  });

  // ─── Callback ────────────────────────────────────────────────────────
  app.get("/api/auth/google/connect-account/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    // Parse state first so we can redirect on error
    let origin = `${req.protocol}://${req.get("host")}`;
    let returnPath = "/settings?tab=calendars";

    let purposes: string[] = [];
    let displayName: string | null = null;
    let action: string = "connect_account";
    let stateNonce: string | null = null;
    try {
      if (state) {
        const stateData = JSON.parse(Buffer.from(state as string, "base64url").toString());
        origin = stateData.origin || origin;
        returnPath = stateData.returnPath || returnPath;
        purposes = Array.isArray(stateData.purposes) ? stateData.purposes : [];
        displayName = stateData.displayName || null;
        action = stateData.action || "connect_account";
        stateNonce = stateData.nonce || null;
      }
    } catch {
      // ignore state parse errors
    }
    // Default to calendar_sync for backwards-compatibility (old connect-account links
    // that don't carry a purposes param were always calendar-only)
    if (purposes.length === 0) purposes = ["calendar_sync"];

    // CSRF nonce verification — reject if nonce is not in the server-side store
    // (missing, expired, or already consumed).
    if (stateNonce && !(await verifyAndConsumeNonce(stateNonce))) {
      console.warn("[AccountConnect] CSRF nonce mismatch — possible CSRF attack or expired session");
      res.redirect(`${origin}${returnPath}?connect_error=invalid_state`);
      return;
    }

    if (error) {
      console.warn("[AccountConnect] OAuth error:", error);
      res.redirect(`${origin}${returnPath}?connect_error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code) {
      res.redirect(`${origin}${returnPath}?connect_error=missing_code`);
      return;
    }

    try {
      // 1. Verify the existing session — user must already be logged in
      const user = await sdk.authenticateRequest(req);

      // 2. Get their household membership
      const member = await db.getHouseholdMemberByUserId(user.id);
      if (!member) {
        res.redirect(`${origin}${returnPath}?connect_error=no_household`);
        return;
      }

      // 3. Exchange code for tokens
      const redirectUri = `${origin}/api/auth/google/connect-account/callback`;
      const tokens = await provider.exchangeCode(code as string, redirectUri);

      // 4. Get the Google account profile
      const profile = await provider.getUserProfile(tokens.accessToken);
      console.log(`[AccountConnect] Connecting Google account: ${profile.email} for user ${user.id}`);

      // 5. Store/update the OAuth token for this account
      await db.upsertOAuthToken({
        id: randomUUID(),
        householdId: member.householdId,
        memberId: member.id,
        provider: "google",
        accountEmail: profile.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: Date.now() + (tokens.expiresIn * 1000),
        scopes: tokens.scope || null,
        purposes,
        displayName: displayName || undefined,
        status: "active",
      });

      console.log(`[AccountConnect] ${action === "reconnect_account" ? "Reconnected" : "Connected"} Google account: ${profile.email} with purposes: ${purposes.join(", ")}`);

      // P-34: Scope validation — verify that the granted scopes match the declared purposes.
      // If a purpose requires a scope that was not granted, warn immediately so the user
      // can reconnect with the correct scopes before the next sync run fails silently.
      const grantedScopes = (tokens.scope || "").split(" ");
      const SCOPE_REQUIREMENTS: Record<string, { scope: string; label: string }[]> = {
        email_scraping: [
          { scope: "https://www.googleapis.com/auth/gmail.readonly", label: "Gmail Read" },
        ],
        calendar_sync: [
          { scope: "https://www.googleapis.com/auth/calendar", label: "Google Calendar" },
        ],
      };
      const missingScopeWarnings: string[] = [];
      for (const purpose of purposes) {
        const required = SCOPE_REQUIREMENTS[purpose] || [];
        for (const req of required) {
          if (!grantedScopes.includes(req.scope)) {
            missingScopeWarnings.push(
              `${profile.email} declared purpose "${purpose}" but was not granted "${req.label}" (${req.scope})`
            );
          }
        }
      }
      if (missingScopeWarnings.length > 0) {
        const warningMsg = missingScopeWarnings.join("; ");
        console.warn(`[AccountConnect] ⚠️ SCOPE MISMATCH: ${warningMsg}`);
        // Fire owner notification so the missing scope surfaces immediately — non-blocking
        import("../_core/notification").then(({ notifyOwner }) => {
          notifyOwner({
            title: "⚠️ Integration Scope Mismatch",
            content: `Account connected but required scopes were not granted.\n\n${warningMsg}\n\nPlease reconnect this account and approve all requested permissions.`,
          }).catch(() => {});
        }).catch(() => {});
      }

      // 6. Auto-discover calendars ONLY for new connections (not reconnects)
      //    Reconnect = token refresh only; all calendar assignments and metadata are preserved.
      if (action !== "reconnect_account" && purposes.includes("calendar_sync")) {
        autoDiscoverCalendarsForAccount(
          member.householdId,
          member.id,
          profile.email,
          tokens.accessToken
        ).catch(err => {
          console.error(`[AccountConnect] Calendar discovery failed for ${profile.email}:`, err);
        });
      } else if (action === "reconnect_account") {
        console.log(`[AccountConnect] Reconnect — skipping calendar discovery for ${profile.email} (all assignments preserved)`);
        // Recovery: full sync WITH propagation for all existing calendars so events
        // created while the account was disconnected are pulled in AND generate their
        // shadow blocks; then re-register push webhook channels so new changes resume
        // flowing immediately instead of waiting for the next server restart.
        if (purposes.includes("calendar_sync")) {
          triggerFullSyncForReconnectedAccount(
            member.householdId,
            member.id,
            profile.email,
            tokens.accessToken
          ).catch((err: unknown) => {
            console.error(`[AccountConnect] Post-reconnect recovery failed for ${profile.email}:`, err);
          });
        }
      } else {
        console.log(`[AccountConnect] Skipping calendar discovery for ${profile.email} (purposes: ${purposes.join(", ")})`);
      }

      // 7. Auto-trigger email scrape backfill when email_scraping purpose is granted.
      //    Runs for both new connections and reconnects — a reconnect may be adding the
      //    gmail.readonly scope for the first time, so we always want a backfill pass.
      //    scrapeAllMultiPlatformEmails() is idempotent: it skips bookings that already
      //    have guestName populated, so re-running is safe.
      if (purposes.includes("email_scraping")) {
        // Clear any needs_reauth jobs for this account so the error count resets immediately
        // after a successful reconnect (before the scrape run completes).
        try {
          const d = await db.getDb();
          if (d) {
            const { sql } = await import("drizzle-orm");
            await d.execute(
              sql`UPDATE email_scrape_jobs esj
                  INNER JOIN property_platforms pp ON pp.id = esj.platformId
                  INNER JOIN properties p ON p.id = pp.propertyId
                  SET esj.status = 'pending', esj.errorMessage = NULL
                  WHERE esj.status = 'needs_reauth'
                    AND pp.notificationEmail = ${profile.email}
                    AND p.householdId = ${member.householdId}`
            );
            console.log(`[AccountConnect] Cleared needs_reauth jobs for ${profile.email}`);
          }
        } catch (clearErr) {
          console.warn(`[AccountConnect] Failed to clear needs_reauth jobs for ${profile.email}:`, clearErr);
        }

        import("../services/multiPlatformEmailScraper").then(({ scrapeAllMultiPlatformEmails }) => {
          console.log(`[AccountConnect] Triggering email scrape backfill for ${profile.email} (email_scraping purpose granted)`);
          scrapeAllMultiPlatformEmails().catch(err => {
            console.error(`[AccountConnect] Email scrape backfill failed for ${profile.email}:`, err);
          });
        }).catch(err => {
          console.error(`[AccountConnect] Failed to import email scraper:`, err);
        });
      }

      // 8. Redirect back with success indicator
      //    reconnect_success param tells the UI to show "settings preserved" toast instead of "account connected"
      const successParam = action === "reconnect_account" ? "reconnect_success" : "connect_success";
      const successUrl = `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}${successParam}=${encodeURIComponent(profile.email)}`;
      res.redirect(successUrl);

    } catch (err: any) {
      console.error("[AccountConnect] Callback error:", err.message);
      res.redirect(`${origin}${returnPath}?connect_error=${encodeURIComponent(err.message)}`);
    }
  });
}

/**
 * Discover and sync all calendars for a newly connected Google account.
 * All accounts use per-account OAuth tokens — service account deprecated June 2026.
 */
async function autoDiscoverCalendarsForAccount(
  householdId: string,
  memberId: string,
  accountEmail: string,
  accessToken: string
): Promise<void> {
  const { listGoogleCalendars, performFullSync } =
    await import("../services/googleCalendarSync");
  const { emitSyncStatus } = await import("../realtime");

  console.log(`[AccountConnect] Auto-discovering calendars for ${accountEmail}`);

  try {
    const googleCalendars = await listGoogleCalendars(accessToken);
    console.log(`[AccountConnect] Found ${googleCalendars.length} calendars for ${accountEmail}`);

    const existingCalendars = await db.getCalendarsByMember(memberId);
    const existingExternalIds = new Set(existingCalendars.map(c => c.externalId));

    // Also check household-wide to prevent duplicates when the same account is reconnected
    // under a different memberId (e.g. after a re-invite or account migration)
    const householdCalendars = await db.getCalendars(householdId);
    const householdExternalIds = new Set(householdCalendars.map((c: any) => c.externalId));

    let newCalendarsAdded = 0;

    for (const gc of googleCalendars) {
      if (existingExternalIds.has(gc.id)) continue;
      if (householdExternalIds.has(gc.id)) {
        // Calendar already exists in household under a different member — skip creation
        // but log so we can investigate if verticalId is missing
        console.warn(`[AccountConnect] Skipping duplicate calendar "${gc.summary}" (${gc.id}) — already exists in household ${householdId}`);
        continue;
      }

      const calendarId = nanoid();

      await db.createCalendar({
        id: calendarId,
        householdId,
        memberId,
        provider: "google_personal",  // all Google calendars use google_personal (workspace deprecated)
        externalId: gc.id,
        accountEmail,
        name: gc.summary || gc.id,
        color: gc.backgroundColor || "#4285f4",
        syncType: "push",
        isPrimary: gc.primary || false,
        isVisible: true,
        accessLevel: gc.accessRole === "owner" || gc.accessRole === "writer" ? "read_write" : "read_only",
      });

      newCalendarsAdded++;

      try {
        emitSyncStatus(householdId, calendarId, "syncing");

        await performFullSync(accessToken, gc.id, calendarId, householdId, {
          upsertEvent: async (event) => {
            await db.upsertEvent({ id: randomUUID(), ...event, source: "sync" });
          },
          updateSyncToken: async (calId, token) => {
            await db.updateCalendarSyncToken(calId, token);
          },
        });

        emitSyncStatus(householdId, calendarId, "synced");
        console.log(`[AccountConnect] Synced calendar "${gc.summary}" for ${accountEmail}`);
      } catch (syncError) {
        emitSyncStatus(householdId, calendarId, "error", String(syncError));
        console.warn(`[AccountConnect] Failed to sync calendar "${gc.summary}":`, syncError);
      }
    }

    console.log(`[AccountConnect] Discovery complete for ${accountEmail}: ${newCalendarsAdded} new calendars`);
  } catch (error) {
    console.error(`[AccountConnect] Discovery failed for ${accountEmail}:`, error);
  }
}

/**
 * After a reconnect, recover all calendars belonging to the reconnected account:
 *
 *  1. Full sync WITH propagation — uses performFullSyncForCalendar from
 *     calendarWebhook.ts, which routes every upserted/deleted event through
 *     onEventUpserted/onEventDeleted (with the shadow-block loop guard and
 *     orphan cleanup). Events created while the account was disconnected are
 *     therefore not just pulled into the events table — they also generate
 *     their shadow blocks immediately. (Previously this used a bare upsert
 *     with no propagation, so recovered events never produced shadow blocks.)
 *
 *  2. Webhook channel re-registration — push channels are otherwise only
 *     (re)registered at server startup. Without this, a reconnected account
 *     has no live push channel until the next deploy/restart, and events
 *     created after reconnection never trigger an incremental sync.
 *
 * FIX (Aug 7 2026): both gaps were identified after a token-expiry incident
 * where a test event created during the disconnect window synced into the DB
 * but never propagated, and a second test event created after reconnection
 * was never detected at all.
 */
async function triggerFullSyncForReconnectedAccount(
  householdId: string,
  _memberId: string,
  accountEmail: string,
  accessToken: string
): Promise<void> {
  const { performFullSyncForCalendar, registerWebhookChannelForCalendar } =
    await import("../services/calendarWebhook");
  console.log(`[AccountConnect] Post-reconnect recovery starting for ${accountEmail}`);
  try {
    const allCalendars = await db.getCalendars(householdId);
    const accountCalendars = allCalendars.filter((c: any) => c.accountEmail === accountEmail);
    if (accountCalendars.length === 0) {
      console.log(`[AccountConnect] No calendars found for ${accountEmail} — skipping post-reconnect recovery`);
      return;
    }
    console.log(`[AccountConnect] Post-reconnect: recovering ${accountCalendars.length} calendar(s) for ${accountEmail}`);
    let synced = 0;
    let errors = 0;
    let webhooks = 0;
    for (const cal of accountCalendars) {
      if (!cal.externalId) {
        console.warn(`[AccountConnect] Skipping calendar "${cal.name}" — no externalId`);
        continue;
      }
      try {
        // Clear stale sync token so the next incremental sync starts clean
        await db.updateCalendarSyncToken(cal.id, "");
        // Full sync WITH propagation + shadow-block guard + orphan cleanup
        await performFullSyncForCalendar(cal.id, householdId, cal.externalId, accessToken);
        console.log(`[AccountConnect] Post-reconnect sync complete for "${cal.name}" (${accountEmail})`);
        synced++;
      } catch (syncErr: unknown) {
        console.warn(`[AccountConnect] Post-reconnect sync failed for "${cal.name}":`, syncErr);
        errors++;
      }
      try {
        // Restore the push channel so new changes resume flowing immediately
        if (await registerWebhookChannelForCalendar(cal.id)) webhooks++;
      } catch (webhookErr: unknown) {
        console.warn(`[AccountConnect] Webhook re-registration failed for "${cal.name}":`, webhookErr);
      }
    }
    console.log(`[AccountConnect] Post-reconnect recovery done for ${accountEmail}: ${synced} synced, ${errors} errors, ${webhooks} webhook channel(s) registered`);
  } catch (err: unknown) {
    console.error(`[AccountConnect] Post-reconnect recovery error for ${accountEmail}:`, err);
  }
}
