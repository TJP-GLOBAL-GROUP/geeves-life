/**
 * Integrations Router
 *
 * Manages all external account connections (Google, Microsoft, Apple, etc.)
 * from a single global location — Settings > Integrations.
 *
 * Each connected account has one or more "purposes" that determine:
 *   1. Which OAuth scopes are requested when the account is first connected
 *   2. Which Geeves features can use the account's credentials
 *
 * Supported purposes:
 *   calendar_sync   → Google Calendar read/write
 *   email_scraping  → Gmail read-only (for booking confirmation parsing)
 *   notes           → Google Drive read-only (for Keep notes via Drive API)
 *   tasks           → Google Tasks read-only
 *   gmail_send      → Gmail send (for outbound notifications)
 *
 * Scope map (Google):
 *   calendar_sync   → https://www.googleapis.com/auth/calendar
 *                     https://www.googleapis.com/auth/calendar.events
 *   email_scraping  → https://www.googleapis.com/auth/gmail.readonly
 *   notes           → https://www.googleapis.com/auth/drive.readonly
 *   tasks           → https://www.googleapis.com/auth/tasks.readonly
 *   gmail_send      → https://www.googleapis.com/auth/gmail.send
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import * as db from "../db";

// ─── Constants ────────────────────────────────────────────────────────────────

export const INTEGRATION_PURPOSES = [
  "calendar_sync",
  "email_scraping",
  "notes",
  "tasks",
  "gmail_send",
  "sheets",
  "drive_write",
] as const;

export type IntegrationPurpose = typeof INTEGRATION_PURPOSES[number];

export const PURPOSE_LABELS: Record<IntegrationPurpose, { label: string; description: string; icon: string }> = {
  calendar_sync: {
    label: "Calendar Sync",
    description: "Read and write calendar events from this account",
    icon: "Calendar",
  },
  email_scraping: {
    label: "Email Scraping",
    description: "Read emails to extract booking confirmations and receipts",
    icon: "Mail",
  },
  notes: {
    label: "Notes",
    description: "Access Google Keep notes via Drive",
    icon: "FileText",
  },
  tasks: {
    label: "Tasks",
    description: "Read tasks from Google Tasks",
    icon: "CheckSquare",
  },
  gmail_send: {
    label: "Send Email",
    description: "Send emails on your behalf (notifications, invites)",
    icon: "Send",
  },
  sheets: {
    label: "Spreadsheets",
    description: "Read and write Google Sheets (tax workbook, expense classification)",
    icon: "Table",
  },
  drive_write: {
    label: "Drive (Full Access)",
    description: "Read, create, and manage files in Google Drive",
    icon: "HardDrive",
  },
};

/** Google OAuth scopes required for each purpose */
const PURPOSE_SCOPES: Record<IntegrationPurpose, string[]> = {
  calendar_sync: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  email_scraping: [
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  notes: [
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  tasks: [
    "https://www.googleapis.com/auth/tasks.readonly",
  ],
  gmail_send: [
    "https://www.googleapis.com/auth/gmail.send",
  ],
  sheets: [
    "https://www.googleapis.com/auth/spreadsheets",
  ],
  drive_write: [
    "https://www.googleapis.com/auth/drive",
  ],
};

/** Base scopes always included for Google accounts */
const GOOGLE_BASE_SCOPES = ["openid", "email", "profile"];

/**
 * Build the OAuth scope string for a given set of purposes.
 */
export function buildScopesForPurposes(purposes: string[]): string {
  const scopes = new Set(GOOGLE_BASE_SCOPES);
  for (const purpose of purposes) {
    const purposeScopes = PURPOSE_SCOPES[purpose as IntegrationPurpose];
    if (purposeScopes) {
      for (const s of purposeScopes) scopes.add(s);
    }
  }
  return Array.from(scopes).join(" ");
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const integrationsRouter = {
  /**
   * List all connected accounts for the current member.
   * Returns safe subset — no access/refresh tokens.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    const tokens = await db.getAllOAuthTokens(member.id, "google");
    return tokens.map(t => ({
      id: t.id,
      provider: "google" as const,
      accountEmail: t.accountEmail,
      displayName: t.displayName ?? null,
      purposes: (Array.isArray(t.purposes) ? t.purposes : []) as string[],
      status: t.status,
      scopes: t.scopes,
      expiresAt: t.expiresAt ?? null,
      lastRefreshedAt: t.lastRefreshedAt,
      createdAt: t.createdAt,
    }));
  }),

  /**
   * Update the purposes (and optional display name) for a connected account.
   * This does NOT re-authorise — it only updates the metadata.
   * If new purposes require scopes not yet granted, the UI should prompt
   * the user to reconnect the account with the new scopes.
   */
  updatePurposes: protectedProcedure.input(z.object({
    // P-11: tokenId preferred for unambiguous targeting; accountEmail kept as fallback for backwards compat
    tokenId: z.string().uuid().optional(),
    accountEmail: z.string().email().optional(),
    purposes: z.array(z.enum(INTEGRATION_PURPOSES)).min(1, "At least one purpose is required"),
    displayName: z.string().max(100).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    let token;
    if (input.tokenId) {
      token = await db.getOAuthTokenById(input.tokenId);
      if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Connected account not found" });
      if (token.memberId !== member.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your account" });
    } else if (input.accountEmail) {
      token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
      if (!token) throw new TRPCError({ code: "NOT_FOUND", message: `No connected account for ${input.accountEmail}` });
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Either tokenId or accountEmail is required" });
    }

    await db.updateOAuthTokenPurposes(token.id, input.purposes, input.displayName);

    // If calendar_sync was just added and wasn't previously set, trigger calendar discovery
    const previousPurposes = (Array.isArray(token.purposes) ? token.purposes : []) as string[];
    const calendarSyncAdded = input.purposes.includes("calendar_sync") && !previousPurposes.includes("calendar_sync");

    if (calendarSyncAdded) {
      // Non-blocking calendar discovery
      import("../services/googleCalendarSync").then(async ({ listGoogleCalendars, performFullSync, refreshAccessToken }) => {
        const { emitSyncStatus } = await import("../realtime");
        const { randomUUID } = await import("crypto");
        const { nanoid } = await import("nanoid");

        let accessToken = token.accessToken;
        if (token.expiresAt && token.expiresAt < Date.now() + 60_000 && token.refreshToken) {
          try {
            const refreshed = await refreshAccessToken(token.refreshToken);
            accessToken = refreshed.accessToken;
            await db.updateOAuthToken(token.id, {
              accessToken: refreshed.accessToken,
              expiresAt: refreshed.expiresAt,
              lastRefreshedAt: new Date(),
            });
          } catch (e) {
            console.warn(`[Integrations] Token refresh failed for ${input.accountEmail}:`, e);
            return;
          }
        }

        const googleCalendars = await listGoogleCalendars(accessToken);
        const existingCalendars = await db.getCalendarsByMember(member.id);
        const existingExternalIds = new Set(existingCalendars.map((c: { externalId: string | null }) => c.externalId));

        for (const gc of googleCalendars) {
          if (existingExternalIds.has(gc.id)) continue;
          const calendarId = nanoid();
          await db.createCalendar({
            id: calendarId,
            householdId: member.householdId,
            memberId: member.id,
            provider: "google_personal",
            externalId: gc.id,
            accountEmail: input.accountEmail,
            name: gc.summary || gc.id,
            color: gc.backgroundColor || "#4285f4",
            syncType: "push",
            isPrimary: gc.primary || false,
            isVisible: true,
            accessLevel: gc.accessRole === "owner" || gc.accessRole === "writer" ? "read_write" : "read_only",
          });
          try {
            emitSyncStatus(member.householdId, calendarId, "syncing");
            await performFullSync(accessToken, gc.id, calendarId, member.householdId, {
              upsertEvent: async (event: any) => {
                await db.upsertEvent({ id: randomUUID(), ...event, source: "sync" });
              },
              updateSyncToken: async (calId: string, syncToken: string) => {
                await db.updateCalendarSyncToken(calId, syncToken);
              },
            });
            emitSyncStatus(member.householdId, calendarId, "synced");
          } catch (syncError) {
            emitSyncStatus(member.householdId, calendarId, "error", String(syncError));
          }
        }
      }).catch(err => {
        console.error(`[Integrations] Calendar discovery failed for ${input.accountEmail}:`, err);
      });
    }

    return { success: true };
  }),

  /**
   * Disconnect a connected account (revoke token).
   * Does NOT remove calendars — those remain but will stop syncing.
   */
  remove: protectedProcedure.input(z.object({
    // P-11: Use tokenId (row UUID) for unambiguous deletion — accountEmail alone is non-unique
    // when the same email has been connected multiple times.
    tokenId: z.string().uuid(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    // Verify ownership — the token must belong to this member's household
    const token = await db.getOAuthTokenById(input.tokenId);
    if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Connected account not found" });
    if (token.memberId !== member.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your account" });

        await db.revokeOAuthToken(token.id);
    return { success: true };
  }),

  /**
   * P-37-A: Purge a connected account — revokes the token AND permanently deletes all linked
   * calendars, events, shadow_blocks, webhook_channels, and scope_consent_preferences.
   * This is destructive and cannot be undone. Distinct from `remove` (disconnect-only).
   */
  purgeAccount: protectedProcedure.input(z.object({
    tokenId: z.string().uuid(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    const token = await db.getOAuthTokenById(input.tokenId);
    if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Connected account not found" });
    if (token.memberId !== member.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your account" });

    const { calendarCount } = await db.purgeOAuthAccount(
      token.id,
      member.id,
      token.accountEmail,
      ctx.user.id,
    );

    await db.writeAuditLog({
      householdId: member.householdId,
      actorUserId: ctx.user.id,
      action: "integrations.purgeAccount",
      category: "integrations",
      resourceType: "oauth_token",
      resourceId: input.tokenId,
      outcome: "success",
      metadata: { accountEmail: token.accountEmail, provider: token.provider, calendarCount },
    });

    return { success: true, calendarCount };
  }),

  /**
   * Get the OAuth connect URL for a given provider and set of purposes.
   * The frontend uses this to initiate the OAuth flow with the correct scopes.
   *
   * The `purposes` array is encoded into the state parameter so the callback
   * can store the correct purposes after the user authorises.
   */
  getConnectUrl: protectedProcedure.input(z.object({
    provider: z.enum(["google"]),
    purposes: z.array(z.enum(INTEGRATION_PURPOSES)).min(1),
    origin: z.string().url(),
    returnPath: z.string().default("/settings?tab=integrations"),
    displayName: z.string().max(100).optional(),
  })).mutation(async ({ ctx, input }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth not configured" });

    const scopes = buildScopesForPurposes(input.purposes);
    const state = Buffer.from(JSON.stringify({
      origin: input.origin,
      returnPath: input.returnPath,
      action: "connect_account",
      purposes: input.purposes,
      displayName: input.displayName ?? null,
    })).toString("base64url");

    const redirectUri = `${input.origin}/api/auth/google/connect-account/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }),

  /**
   * Check which purposes are missing required scopes for a connected account.
   * Returns a list of purposes that need re-authorisation.
   */
  getMissingScopes: protectedProcedure.input(z.object({
    accountEmail: z.string().email(),
  })).query(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return { missingPurposes: [] };

    const token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
    if (!token) return { missingPurposes: [] };

    const grantedScopes = new Set((token.scopes || "").split(" ").filter(Boolean));
    const purposes = (Array.isArray(token.purposes) ? token.purposes : []) as string[];

    const missingPurposes: string[] = [];
    for (const purpose of purposes) {
      const required = PURPOSE_SCOPES[purpose as IntegrationPurpose];
      if (required && required.some(s => !grantedScopes.has(s))) {
        missingPurposes.push(purpose);
      }
    }

    return { missingPurposes };
  }),

  /**
   * Get the OAuth reconnect URL for an existing account.
   * Reads the account's current purposes, displayName, and scopes from the DB
   * and generates an OAuth URL pre-populated with those values.
   * NO dialog needed — single click triggers the OAuth flow.
   * After the callback, the token is updated in-place and all metadata is preserved.
   */
  getReconnectUrl: protectedProcedure.input(z.object({
    accountEmail: z.string().email(),
    origin: z.string().url(),
    returnPath: z.string().default("/settings?tab=integrations"),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth not configured" });

    // Find the existing token — may be revoked or expired
    const token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
    if (!token) throw new TRPCError({ code: "NOT_FOUND", message: `No account found for ${input.accountEmail}` });

    // Use the existing purposes and scopes — do NOT reset them
    const purposes = (Array.isArray(token.purposes) ? token.purposes : ["calendar_sync"]) as string[];
    const scopes = buildScopesForPurposes(purposes);

    const state = Buffer.from(JSON.stringify({
      origin: input.origin,
      returnPath: input.returnPath,
      action: "reconnect_account",   // <-- tells callback to skip calendar re-discovery
      purposes,
      displayName: token.displayName ?? null,
    })).toString("base64url");

    const redirectUri = `${input.origin}/api/auth/google/connect-account/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",   // force consent to get a fresh refresh token
      login_hint: input.accountEmail,   // pre-fill the Google account picker
      state,
    });

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }),

  /**
   * Get reconnect URLs for ALL expired or revoked accounts in one call.
   * The frontend can use this to show a "Reconnect All" banner.
   * Returns an array of { accountEmail, displayName, url } objects.
   */
  reconnectAll: protectedProcedure.input(z.object({
    origin: z.string().url(),
    returnPath: z.string().default("/settings?tab=integrations"),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth not configured" });

    const allTokens = await db.getAllOAuthTokens(member.id, "google");
    const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

    // Also fetch emails that have needs_reauth jobs — these accounts may show gmail.readonly
    // in their stored scopes but the actual access has been revoked or the refresh token is bad.
    // We must force-reconnect them regardless of what the stored scopes say.
    let needsReauthEmails = new Set<string>();
    try {
      const d = await db.getDb();
      if (d) {
        const { sql } = await import("drizzle-orm");
        const raw = await d.execute(
          sql`SELECT DISTINCT pp.notificationEmail
               FROM email_scrape_jobs esj
               JOIN property_platforms pp ON pp.id = esj.platformId
               JOIN properties p ON p.id = pp.propertyId
               WHERE esj.status = 'needs_reauth'
                 AND p.householdId = ${member.householdId}
                 AND pp.notificationEmail IS NOT NULL`
        ) as any;
        const rows: Array<{ notificationEmail: string }> = Array.isArray(raw) ? (raw[0] ?? raw) : raw;
        for (const row of rows) {
          if (row.notificationEmail) needsReauthEmails.add(row.notificationEmail.toLowerCase());
        }
      }
    } catch (_) { /* non-fatal — fall back to scope-only check */ }

    // Build a map keyed by accountEmail so we can merge issues per account
    // without duplicating the same account in the sequence.
    const toReconnect = new Map<string, { token: typeof allTokens[0]; needsEmailScope: boolean }>();

    for (const token of allTokens) {
      const isRevoked = token.status === "revoked" || token.status === "expired";
      const purposes = (Array.isArray(token.purposes) ? token.purposes : []) as string[];
      const grantedScopes = new Set((token.scopes || "").split(" ").filter(Boolean));
      const hasGmailRead = grantedScopes.has(gmailReadonlyScope) || grantedScopes.has("gmail.readonly");
      const hasEmailPurpose = purposes.includes("email_scraping");
      // Missing scope check (stored scopes don't include gmail.readonly)
      const needsEmailScopeByStoredScopes = hasEmailPurpose && !hasGmailRead;
      // Actual failure check (jobs are failing even though scopes look ok — token revoked at Google)
      const needsEmailScopeByJobFailure = needsReauthEmails.has(token.accountEmail.toLowerCase());
      const needsEmailScope = needsEmailScopeByStoredScopes || needsEmailScopeByJobFailure;

      if (isRevoked || needsEmailScope) {
        const existing = toReconnect.get(token.accountEmail);
        if (existing) {
          existing.needsEmailScope = existing.needsEmailScope || needsEmailScope;
        } else {
          toReconnect.set(token.accountEmail, { token, needsEmailScope });
        }
      }
    }

    // Also handle notification emails that don't match any stored token
    // (e.g., the email was never added as a connected account but is used for scraping)
    for (const email of Array.from(needsReauthEmails)) {
      if (!toReconnect.has(email)) {
        const matchingToken = allTokens.find(t => t.accountEmail.toLowerCase() === email);
        if (matchingToken) {
          toReconnect.set(matchingToken.accountEmail, { token: matchingToken, needsEmailScope: true });
        }
      }
    }

    const results = Array.from(toReconnect.values()).map(({ token, needsEmailScope }) => {
      const storedPurposes = (Array.isArray(token.purposes) ? token.purposes : ["calendar_sync"]) as string[];
      // For email-only reconnects: request minimum necessary scopes.
      // Always include email_scraping; also include calendar_sync if the account has a calendar
      // (e.g. tarik@maxfieldmarket.com is both email-scraping AND has a Maxfield Market calendar).
      // Do NOT include notes, tasks, gmail_send — those caused scope bloat.
      // For non-email reconnects (revoked token): use stored purposes as-is.
      let reconnectPurposes: string[];
      if (needsEmailScope) {
        reconnectPurposes = ["email_scraping"];
        if (storedPurposes.includes("calendar_sync")) reconnectPurposes.push("calendar_sync");
      } else {
        reconnectPurposes = storedPurposes;
      }
      const scopes = buildScopesForPurposes(reconnectPurposes);

      const state = Buffer.from(JSON.stringify({
        origin: input.origin,
        returnPath: input.returnPath,
        action: "reconnect_account",
        // Full stored purposes so callback can merge correctly
        purposes: storedPurposes,
        reconnectPurposes, // scopes actually being requested
        displayName: token.displayName ?? null,
      })).toString("base64url");

      const redirectUri = `${input.origin}/api/auth/google/connect-account/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        login_hint: token.accountEmail,
        state,
      });

      return {
        accountEmail: token.accountEmail,
        displayName: token.displayName ?? null,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      };
    });

    return { accounts: results };
  }),

  /**
   * Get reconnect URLs for all accounts that need email_scraping scope.
   * Covers: missing gmail.readonly scope OR revoked/expired token with email_scraping purpose.
   */
  getEmailReconnectUrls: protectedProcedure.input(z.object({
    origin: z.string().url(),
    returnPath: z.string().default("/properties"),
    emails: z.array(z.string().email()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth not configured" });

    const allTokens = await db.getAllOAuthTokens(member.id, "google");
    const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
    const emailsFilter = input.emails ? new Set(input.emails.map(e => e.toLowerCase())) : null;

    const needsEmailReconnect = allTokens.filter(token => {
      if (emailsFilter && !emailsFilter.has(token.accountEmail.toLowerCase())) return false;
      const grantedScopes = new Set((token.scopes || "").split(" ").filter(Boolean));
      const hasGmailRead = grantedScopes.has(gmailReadonlyScope) || grantedScopes.has("gmail.readonly");
      const purposes = (Array.isArray(token.purposes) ? token.purposes : []) as string[];
      const hasEmailPurpose = purposes.includes("email_scraping");
      return hasEmailPurpose && (!hasGmailRead || token.status === "revoked" || token.status === "expired");
    });

    const results = needsEmailReconnect.map(token => {
      const storedPurposes = (Array.isArray(token.purposes) ? token.purposes : ["email_scraping"]) as string[];
      // Email reconnect should only request the minimum necessary scopes.
      // Always include email_scraping (gmail.readonly).
      // Also include calendar_sync if the account has calendar_sync in its stored purposes
      // (e.g. tarik@maxfieldmarket.com is both an email-scraping account AND has a calendar).
      // Do NOT include notes, tasks, gmail_send — those were extra purposes that caused scope bloat.
      const minimalPurposes = ["email_scraping"];
      if (storedPurposes.includes("calendar_sync")) minimalPurposes.push("calendar_sync");
      const scopes = buildScopesForPurposes(minimalPurposes);
      const state = Buffer.from(JSON.stringify({
        origin: input.origin,
        returnPath: input.returnPath,
        action: "reconnect_account",
        // Pass the full stored purposes so the callback can merge them back correctly
        purposes: storedPurposes,
        reconnectPurposes: minimalPurposes, // scopes actually being requested in this flow
        displayName: token.displayName ?? null,
      })).toString("base64url");
      const redirectUri = `${input.origin}/api/auth/google/connect-account/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        login_hint: token.accountEmail,
        state,
      });
      return {
        accountEmail: token.accountEmail,
        displayName: token.displayName ?? null,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      };
    });
    return { accounts: results };
  }),

  /**
   * Get a single email reconnect URL for a specific account.
   * Used by the per-platform "Reconnect" button on the Properties screen.
   * Always ensures email_scraping purpose is included in the reconnect scope.
   */
  getEmailReconnectUrl: protectedProcedure.input(z.object({
    accountEmail: z.string().email(),
    origin: z.string().url(),
    returnPath: z.string().default("/properties"),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth not configured" });

    const token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
    // Email reconnect should only request the minimum necessary scopes.
    // Always include email_scraping (gmail.readonly).
    // Also include calendar_sync if the account has calendar_sync in its stored purposes
    // (e.g. tarik@maxfieldmarket.com is both an email-scraping account AND has a calendar).
    // Do NOT include notes, tasks, gmail_send — those were extra purposes that caused scope bloat.
    const storedPurposes = token
      ? (Array.isArray(token.purposes) ? token.purposes : ["email_scraping"]) as string[]
      : ["email_scraping"];
    const reconnectPurposes = ["email_scraping"];
    if (storedPurposes.includes("calendar_sync")) reconnectPurposes.push("calendar_sync");
    const scopes = buildScopesForPurposes(reconnectPurposes);
    const state = Buffer.from(JSON.stringify({
      origin: input.origin,
      returnPath: input.returnPath,
      action: token ? "reconnect_account" : "connect_account",
      purposes: storedPurposes,
      reconnectPurposes, // scopes actually being requested
      displayName: token?.displayName ?? null,
    })).toString("base64url");
    const redirectUri = `${input.origin}/api/auth/google/connect-account/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      login_hint: input.accountEmail,
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }),

  /**
   * Unified integration health — returns all connected accounts with health status,
   * plus email scraping warnings, in a single call for the centralized Integrations hub
   * and the global attention badge shown on other pages.
   */
  getUnifiedHealth: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return { accounts: [], emailWarnings: [], totalIssues: 0 };

    // 1. OAuth tokens — compute health per account
    const tokens = await db.getAllOAuthTokens(member.id, "google");
    const accounts = tokens.map(t => {
      const purposes = (Array.isArray(t.purposes) ? t.purposes : []) as string[];
      const scopeStr: string = typeof t.scopes === "string" ? t.scopes : Array.isArray(t.scopes) ? (t.scopes as string[]).join(" ") : "";
      const hasGmailRead = scopeStr.includes("gmail.readonly");
      const needsEmailReconnect = purposes.includes("email_scraping") && !hasGmailRead;
      let health: "connected" | "needs_attention" | "expired" = "connected";
      if (t.status === "revoked" || t.status === "expired") health = "expired";
      else if (needsEmailReconnect) health = "needs_attention";
      return {
        id: t.id,
        accountEmail: t.accountEmail,
        displayName: t.displayName ?? null,
        purposes,
        status: t.status,
        health,
        needsEmailReconnect,
        expiresAt: t.expiresAt ?? null,
        lastRefreshedAt: t.lastRefreshedAt,
      };
    });

    // 2. Email scraping warnings (needs_reauth jobs from property platforms)
    const d = await db.getDb();
    let emailWarnings: Array<{
      platformId: string;
      platform: string;
      notificationEmail: string;
      propertyId: string;
      propertyName: string;
    }> = [];
    if (d) {
      const { sql } = await import("drizzle-orm");
      // Scope email warnings to properties whose vertical is owned by this member.
      // household_admin sees all; regular members only see their own vertical's properties.
      const isAdmin = member.role === "household_admin";
      const raw = await d.execute(
        isAdmin
          ? sql`SELECT DISTINCT pp.id as platformId, pp.platform, pp.notificationEmail,
                  p.id as propertyId, p.name as propertyName
           FROM email_scrape_jobs esj
           JOIN property_platforms pp ON pp.id = esj.platformId
           JOIN properties p ON p.id = pp.propertyId
           WHERE esj.status = 'needs_reauth'
             AND p.householdId = ${member.householdId}
             AND esj.completedAt = (
               SELECT MAX(esj2.completedAt) FROM email_scrape_jobs esj2
               WHERE esj2.platformId = esj.platformId AND esj2.status = 'needs_reauth'
             )
           ORDER BY p.name, pp.platform`
          : sql`SELECT DISTINCT pp.id as platformId, pp.platform, pp.notificationEmail,
                  p.id as propertyId, p.name as propertyName
           FROM email_scrape_jobs esj
           JOIN property_platforms pp ON pp.id = esj.platformId
           JOIN properties p ON p.id = pp.propertyId
           LEFT JOIN verticals v ON v.id = p.verticalId
           WHERE esj.status = 'needs_reauth'
             AND p.householdId = ${member.householdId}
             AND (v.ownerMemberId = ${member.id} OR v.id IS NULL)
             AND esj.completedAt = (
               SELECT MAX(esj2.completedAt) FROM email_scrape_jobs esj2
               WHERE esj2.platformId = esj.platformId AND esj2.status = 'needs_reauth'
             )
           ORDER BY p.name, pp.platform`
      ) as any;
      emailWarnings = (Array.isArray(raw) ? raw[0] ?? raw : raw) as typeof emailWarnings;
    }

    const totalIssues = accounts.filter(a => a.health !== "connected").length
      + emailWarnings.length;

    return { accounts, emailWarnings, totalIssues };
  }),

  /**
   * P-35: Persist "Do Not Show Again" for a scope consent modal.
   * Called when the user checks the checkbox before proceeding to Google OAuth.
   */
  dismissScopeConsent: protectedProcedure
    .input(z.object({
      scopeKey: z.enum(["google.calendar", "google.gmail.readonly", "google.gmail.send"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { nanoid } = await import("nanoid");
      const { scopeConsentPreferences } = await import("../../drizzle/schema");
      const d = await db.getDb();
      if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Upsert — if the user already dismissed this scope, update the timestamp
      await d.execute(
        (await import("drizzle-orm")).sql`
          INSERT INTO scope_consent_preferences (id, userId, scopeKey, dismissedAt)
          VALUES (${nanoid()}, ${ctx.user.id}, ${input.scopeKey}, ${Date.now()})
          ON DUPLICATE KEY UPDATE dismissedAt = ${Date.now()}
        `
      );
      return { ok: true };
    }),

  /**
   * P-35: Return which scope consent modals the current user has dismissed.
   * The frontend uses this to skip the modal for scopes the user has already acknowledged.
   */
  getScopeConsentPreferences: protectedProcedure.query(async ({ ctx }) => {
    const d = await db.getDb();
    if (!d) return { dismissed: [] as string[] };
    const { sql } = await import("drizzle-orm");
    const raw = await d.execute(
      sql`SELECT scopeKey FROM scope_consent_preferences WHERE userId = ${ctx.user.id}`
    ) as any;
    const rows: Array<{ scopeKey: string }> = Array.isArray(raw) ? raw[0] ?? raw : raw;
    return { dismissed: rows.map(r => r.scopeKey) };
  }),
};
