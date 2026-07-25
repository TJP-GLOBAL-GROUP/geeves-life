/**
 * Google OAuth Express Routes
 * 
 * Handles Google Sign-In and creates a proper app session (JWT cookie).
 * Also stores OAuth tokens for calendar sync access.
 * 
 * Fixes applied:
 * - A1: Stores OAuth tokens for first-time users even without household/member
 * - A2: Auto-syncs Workspace accounts on login (detects domain → impersonates → registers calendars)
 * - A5: Differentiates google_workspace vs google_personal provider
 */

import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { GoogleAuthProvider } from "./providers";
import * as db from "../db";
import { randomUUID, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { registerNonce, verifyAndConsumeNonce } from "./nonceStore";

/** Generate a cryptographically random hex nonce */
function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function setupGoogleOAuth(app: Express) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[Auth] Google OAuth not configured — GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing");
    return;
  }

  const provider = new GoogleAuthProvider(clientId, clientSecret);
  console.log("[Auth] Google OAuth configured successfully");

  // ─── Login Route ─────────────────────────────────────────────────────
  app.get("/api/auth/google/login", async (req: Request, res: Response) => {
    const origin = req.query.origin as string || `${req.protocol}://${req.get("host")}`;
    const returnPath = req.query.returnPath as string || "/dashboard";

    // CSRF protection: generate a random nonce, register it server-side (DB-backed),
    // and embed it in the state parameter. The callback verifies the nonce exists in the
    // server-side store before processing the code exchange.
    // NOTE: We use DB-backed storage (not in-memory) so nonces survive across Autoscale
    // instances — the login redirect and callback can hit different cold-start instances.
    const nonce = generateNonce();
    await registerNonce(nonce);

    const state = Buffer.from(JSON.stringify({ origin, returnPath, nonce })).toString("base64url");
    const redirectUri = `${origin}/api/auth/google/callback`;
    const url = provider.getAuthorizationUrl(state, redirectUri);
    res.redirect(url);
  });

  // ─── Callback Route ──────────────────────────────────────────────────
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) { 
        res.status(400).send("Missing code or state"); 
        return; 
      }

      const stateData = JSON.parse(Buffer.from(state as string, "base64url").toString());
      const origin = stateData.origin;
      const returnPath = stateData.returnPath || "/dashboard";
      const redirectUri = `${origin}/api/auth/google/callback`;

      // CSRF nonce verification — reject the callback if the nonce in state
      // is not found in the server-side nonce store (missing, expired, or already used).
      if (!stateData.nonce || !(await verifyAndConsumeNonce(stateData.nonce))) {
        console.warn("[Auth] CSRF nonce mismatch on Google OAuth callback — possible CSRF attack or expired session");
        res.status(400).send("Invalid OAuth state. Please try signing in again.");
        return;
      }

      // 1. Exchange authorization code for tokens
      const tokens = await provider.exchangeCode(code as string, redirectUri);
      
      // 2. Get user profile from Google
      const profile = await provider.getUserProfile(tokens.accessToken);
      console.log(`[Auth] Google OAuth success for: ${profile.email}`);

      // 3. Create a stable openId from Google profile (google:{googleId})
      const openId = `google:${profile.id}`;

      // 4. Upsert user into our database
      await db.upsertUser({
        openId,
        name: profile.name,
        email: profile.email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      // 5. Get the user record
      const user = await db.getUserByOpenId(openId);
      if (!user) {
        throw new Error("Failed to create/retrieve user record");
      }

      // 6. Determine household membership
      let householdId: string | null = null;
      let memberId: string | null = null;

      // Check if user already has a household
      const existingMember = await db.getHouseholdMemberByUserId(user.id);
      if (existingMember) {
        householdId = existingMember.householdId;
        memberId = existingMember.id;
      } else {
        // Check if user created a household (legacy lookup)
        const createdHousehold = await db.getHouseholdByCreator(user.id);
        if (createdHousehold) {
          householdId = createdHousehold.id;
          // Find their member record
          const userMember = await db.getHouseholdMemberByUserId(user.id);
          memberId = userMember?.id || null;
        }
      }

      // ✅ Stamp users.householdId + users.memberId on every login so ctx.user is always current
      if (householdId && memberId) {
        try {
          await db.updateUserHousehold(user.id, householdId, memberId);
        } catch (stampErr) {
          console.warn("[Auth] Failed to stamp householdId on user:", stampErr);
        }
        // DB-04: Re-link any tokens stored with pending_ memberId from a previous login
        // when the user had no household yet. Now that we have the real memberId, update them.
        try {
          const pendingMemberId = `pending_${user.id}`;
          const { getDb } = await import("../db");
          const d = await getDb();
          if (d) {
            const { oauthTokens } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const result = await d.update(oauthTokens)
              .set({ memberId, householdId })
              .where(eq(oauthTokens.memberId, pendingMemberId));
            const relinked = (result as any)?.rowsAffected ?? 0;
            if (relinked > 0) {
              console.log(`[Auth] Re-linked ${relinked} pending_ token(s) to memberId:${memberId} for user ${user.id}`);
            }
          }
        } catch (relinkErr) {
          console.warn("[Auth] Failed to re-link pending_ tokens (non-fatal):", relinkErr);
        }
      }

      // 7. Store OAuth tokens — ALWAYS store them, even without household
      // For users without a household yet, we store with placeholder IDs
      // and update them when the household is created
      const tokenHouseholdId = householdId || `pending_${user.id}`;
      const tokenMemberId = memberId || `pending_${user.id}`;

      try {
        // Check if token already exists for this member+provider
        const existingToken = await db.getOAuthToken(tokenMemberId, "google");
        if (existingToken) {
          // Update existing token
          await db.updateOAuthToken(existingToken.id, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || existingToken.refreshToken,
            expiresAt: Date.now() + (tokens.expiresIn * 1000),
            scopes: tokens.scope || existingToken.scopes,
            status: "active",
            lastRefreshedAt: new Date(),
          });
          console.log(`[Auth] Updated Google OAuth tokens for ${profile.email}`);
        } else {
          // Create new token record
          await db.storeOAuthToken({
            id: randomUUID(),
            householdId: tokenHouseholdId,
            memberId: tokenMemberId,
            provider: "google",
            accountEmail: profile.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || null,
            expiresAt: Date.now() + (tokens.expiresIn * 1000),
            scopes: tokens.scope || null,
            status: "active",
          });
          console.log(`[Auth] Stored Google OAuth tokens for ${profile.email}`);
        }
      } catch (tokenError) {
        // Non-fatal: user can still log in even if token storage fails
        console.error("[Auth] Failed to store OAuth tokens:", tokenError);
      }

      // 8. Calendar auto-sync intentionally NOT called here.
      //    P-35: Geeves.Life only requests calendar access when the user explicitly
      //    connects an account via Settings → Integrations → Add Account.
      //    The login flow uses identity-only scopes (openid, email, profile) and
      //    must never trigger calendar API calls — doing so would cause Google to
      //    send a security alert to the user's inbox even though no calendar scope
      //    was granted. Calendar sync is initiated in googleAccountConnect.ts after
      //    the user has explicitly consented to calendar access.

      // 9. Create session JWT and set cookie (same mechanism as Manus OAuth)
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // 10. Redirect
      // Priority order:
      //   a) Explicit /join?token=... link — honour it directly
      //   b) User has no household — check if there is a pending invite by email
      //      If yes → /invitation-accept (show accept/decline screen)
      //      If no  → /household?setup=true (create their own group)
      //   c) User already has a household — go to returnPath (usually "/")
      const isJoinPath = returnPath.startsWith("/join");
      if (isJoinPath) {
        // Explicit invite link — honour it
        res.redirect(302, `${origin}${returnPath}`);
      } else if (!householdId) {
        // No household yet — check for a pending invite by email
        const pendingInvite = await db.getPendingInviteByEmail(profile.email);
        if (pendingInvite) {
          // Found an invite — send to the accept/decline screen
          res.redirect(302, `${origin}/invitation-accept?memberId=${pendingInvite.id}`);
        } else {
          // No invite found — send to household setup
          res.redirect(302, `${origin}/household?setup=true`);
        }
      } else {
        res.redirect(302, `${origin}${returnPath}`);
      }
    } catch (error: any) {
      console.error("[Auth] Google OAuth callback error:", error.message);
      res.status(500).send("Authentication failed. Please try again.");
    }
  });
}

/**
 * Auto-discover and sync all personal Google calendars for a user.
 * Uses the OAuth access token obtained during login.
 * Runs for non-Workspace accounts (e.g. @gmail.com).
 */
async function autoSyncPersonalCalendars(
  householdId: string,
  memberId: string,
  email: string,
  accessToken: string
): Promise<void> {
  const { listGoogleCalendars, performFullSync } = await import("../services/googleCalendarSync");
  const { emitSyncStatus } = await import("../realtime");

  console.log(`[Auth] Auto-syncing personal calendars for ${email}`);

  try {
    const googleCalendars = await listGoogleCalendars(accessToken);
    console.log(`[Auth] Found ${googleCalendars.length} personal calendars for ${email}`);

    const existingCalendars = await db.getCalendarsByMember(memberId);
    const existingExternalIds = new Set(existingCalendars.map(c => c.externalId));

    let newCalendarsAdded = 0;

    for (const gc of googleCalendars) {
      if (existingExternalIds.has(gc.id)) continue;

      const calendarId = nanoid();

      await db.createCalendar({
        id: calendarId,
        householdId,
        memberId,
        provider: "google_personal",
        externalId: gc.id,
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

        const result = await performFullSync(accessToken, gc.id, calendarId, householdId, {
          upsertEvent: async (event) => {
            await db.upsertEvent({ id: randomUUID(), ...event, source: "sync" });
          },
          updateSyncToken: async (calId, token) => {
            await db.updateCalendarSyncToken(calId, token);
          },
        });

        emitSyncStatus(householdId, calendarId, "synced");
        console.log(`[Auth] Synced personal calendar "${gc.summary}": ${result.synced} events`);
      } catch (syncError) {
        emitSyncStatus(householdId, calendarId, "error", String(syncError));
        console.warn(`[Auth] Failed to sync personal calendar "${gc.summary}":`, syncError);
      }
    }

    console.log(`[Auth] Personal auto-sync complete for ${email}: ${newCalendarsAdded} new calendars added`);
  } catch (error) {
    console.error(`[Auth] Personal auto-sync failed for ${email}:`, error);
  }
}


