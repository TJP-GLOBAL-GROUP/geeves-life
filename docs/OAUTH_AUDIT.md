# Geeves.Life — OAuth 2.0 Incremental Authorisation Audit

**Date:** June 25, 2026  
**Scope:** All Google OAuth 2.0 flows — login, account connect, reconnect, token refresh, logout  
**Standard:** [Google OAuth 2.0 Incremental Authorisation Best Practices](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth) + [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) + [RFC 6819 (Threat Model)](https://datatracker.ietf.org/doc/html/rfc6819)

---

## Executive Summary

The platform has a well-structured, purpose-mapped scope system in `server/routers/integrations.ts` that correctly defines incremental authorisation for *additional* Google accounts connected via Settings → Integrations. However, the **primary login flow** (`/api/auth/google/login`) violates incremental authorisation by requesting all scopes upfront — including `calendar`, `calendar.events`, and `gmail.send` — before the user has indicated they want those features. Five additional issues of varying severity were identified.

---

## Findings

### FINDING 1 — CRITICAL: Login flow requests all scopes upfront (violates incremental auth)

**File:** `server/auth/providers.ts` — `GoogleAuthProvider.getAuthorizationUrl()` (lines 39–54)  
**File:** `server/services/gmailSend.ts` — comment on line 5: *"gmail.send scope — now included in the Google OAuth login flow"*

**What the code does today:**

```ts
scope: [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
].join(" "),
```

Every user who signs in to Geeves.Life is asked to grant calendar read/write and Gmail send permissions on the very first login screen — before they have set up a household, connected any calendars, or sent a single email. This is the exact pattern Google's incremental authorisation guidelines are designed to prevent.

**Why it matters:**

- Google's own review guidelines flag broad upfront scope requests as a reason to reject or restrict OAuth apps. This is likely a contributing factor to the app losing Production status.
- Users (especially new household members like Eniola and Cary) see a consent screen demanding access to their entire Google Calendar and the ability to send email on their behalf before they understand what the app does. This reduces trust and increases abandonment.
- The `gmail.send` scope in particular is a high-sensitivity scope that Google scrutinises closely. Bundling it into the login flow means every user grants it even if they never use the email-sending feature.

**Recommended fix:**

Split scopes into two tiers:

| Tier | Scopes | When requested |
|---|---|---|
| **Login (identity only)** | `openid email profile` | At first sign-in — always |
| **Calendar sync** | `calendar` `calendar.events` | When user first adds a Google account in Settings → Integrations with `calendar_sync` purpose |
| **Gmail send** | `gmail.send` | When user explicitly enables the "Send Email" purpose on an account |
| **Email scraping** | `gmail.readonly` | When user enables "Email Scraping" purpose |
| **Notes / Tasks** | `drive.readonly` `tasks.readonly` | When user enables those purposes |

The `getConnectUrl` procedure in `integrations.ts` already implements this correctly for additional accounts. The fix is to apply the same pattern to the primary login flow by removing the calendar and Gmail scopes from `GoogleAuthProvider.getAuthorizationUrl()`.

---

### FINDING 2 — HIGH: Manus OAuth callback route is still mounted server-side

**File:** `server/_core/index.ts` — lines 84, 91  
**File:** `server/_core/oauth.ts` — `/api/oauth/callback` handler

**What the code does today:**

```ts
app.use("/api/oauth", authLimiter);
// ...
registerOAuthRoutes(app);  // mounts /api/oauth/callback
```

The Manus OAuth callback route (`/api/oauth/callback`) remains active on the server even though the Manus login button was removed from the UI. Any actor who constructs a valid Manus OAuth URL and completes the flow can still create an authenticated session on Geeves.Life. This is an orphaned attack surface.

**Recommended fix:**

Remove `registerOAuthRoutes(app)` from `server/_core/index.ts` and remove or disable `server/_core/oauth.ts`. The `app.use("/api/oauth", authLimiter)` rate limiter line can also be removed. If Manus OAuth is ever re-enabled in the future, it should be re-added deliberately with fresh review.

---

### FINDING 3 — HIGH: State parameter carries no CSRF nonce

**File:** `server/auth/googleOAuth.ts` — line 38  
**File:** `server/auth/googleAccountConnect.ts` — lines 50–54  
**File:** `server/routers/integrations.ts` — lines 259–265, 334–340

**What the code does today:**

```ts
// googleOAuth.ts
const state = Buffer.from(JSON.stringify({ origin, returnPath })).toString("base64url");

// integrations.ts
const state = Buffer.from(JSON.stringify({
  origin, returnPath, action, purposes, displayName,
})).toString("base64url");
```

The `state` parameter is used to carry routing data (origin, returnPath, purposes) but contains no random nonce. RFC 6749 §10.12 and Google's own documentation require the state parameter to include an unguessable value that is bound to the user's session and verified on callback. Without a nonce, the callback endpoint is vulnerable to CSRF: an attacker can craft a callback URL with a valid `code` and a forged `state` and potentially hijack the OAuth flow.

**Recommended fix:**

Generate a cryptographically random nonce per-request, store it in a short-lived server-side session (or a signed `state_nonce` cookie), and verify it in the callback before processing the code exchange:

```ts
import { randomBytes } from "crypto";

// On initiation:
const nonce = randomBytes(16).toString("hex");
// Store nonce in session or signed cookie (expires in 10 min)
res.cookie("oauth_nonce", nonce, { httpOnly: true, secure: true, maxAge: 600_000, sameSite: "lax" });

const state = Buffer.from(JSON.stringify({ origin, returnPath, nonce })).toString("base64url");

// On callback:
const stateData = JSON.parse(Buffer.from(state as string, "base64url").toString());
const cookieNonce = req.cookies["oauth_nonce"];
if (!cookieNonce || cookieNonce !== stateData.nonce) {
  res.status(400).send("Invalid state — possible CSRF attack");
  return;
}
res.clearCookie("oauth_nonce");
```

---

### FINDING 4 — MEDIUM: Token refresh failure silently falls back to stale access token

**File:** `server/services/calendarWebhook.ts` — lines 303–312

**What the code does today:**

```ts
} catch (e) {
  console.warn(`[Sync] OAuth token refresh failed for member ${memberId}...`);
}
// Last resort: use stored access token as-is (may work if not yet expired)
if (oauthToken?.accessToken) {
  console.warn(`[Sync] Using potentially stale access token...`);
  return oauthToken.accessToken;
}
```

When a token refresh fails (e.g., the refresh token has been revoked by the user in their Google Account settings), the code logs a warning and then returns the stale access token anyway. Google access tokens expire in 1 hour. Using a stale token will result in 401 errors from the Google Calendar API, but the token row in the database is never updated to `status: "expired"` — so the UI health dot will continue to show green, and the user will not be prompted to reconnect.

**Recommended fix:**

On refresh failure, update the token status to `expired` in the database so the UI can surface the reconnect affordance:

```ts
} catch (e) {
  console.warn(`[Sync] OAuth token refresh failed — marking token expired`);
  await db.updateOAuthToken(oauthToken.id, { status: "expired" });
  return null;  // do not fall back to stale token
}
```

---

### FINDING 5 — MEDIUM: Logout does not revoke Google OAuth tokens

**File:** `server/routers.ts` — `auth.logout` mutation (lines 111–128)

**What the code does today:**

Logout clears the Geeves session cookie and writes an audit log entry. It does not call Google's token revocation endpoint (`https://oauth2.googleapis.com/revoke`).

**Why it matters:**

Per RFC 6749 §1.5 and Google's security guidance, when a user logs out of an application, the application should revoke the OAuth tokens it holds. Without revocation, a stolen or leaked refresh token remains valid indefinitely (Google refresh tokens do not expire unless unused for 6 months). If a household member's device is compromised after they log out of Geeves, their Google Calendar and Gmail access remains exposed through the stored refresh token.

This is especially important for Geeves.Life given the sensitivity of the data (family calendars, email access, property bookings).

**Recommended fix:**

Add a Google token revocation call to the logout flow. This should be non-blocking (fire-and-forget) so a Google API failure does not prevent the user from logging out:

```ts
// In auth.logout mutation — after clearing the cookie:
if (ctx.user) {
  // Non-blocking: revoke all Google refresh tokens for this user
  revokeGoogleTokensForUser(ctx.user.id).catch(err => {
    console.warn("[Auth] Token revocation failed on logout:", err);
  });
}

async function revokeGoogleTokensForUser(userId: string) {
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) return;
  const tokens = await db.getAllOAuthTokens(member.id, "google");
  for (const token of tokens) {
    if (token.refreshToken) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token.refreshToken}`, { method: "POST" });
    }
  }
}
```

Note: Revocation on logout is appropriate for a personal/household platform. For a shared-device scenario (e.g., a child's tablet that multiple people use), consider whether "log out of Geeves" should also revoke the Google token or only clear the Geeves session.

---

### FINDING 6 — LOW: Token encryption falls back to zero-key if JWT_SECRET is absent

**File:** `server/tokenEncryption.ts` — lines 25–33

**What the code does today:**

```ts
if (!secret) {
  console.warn("[TokenEncryption] JWT_SECRET not set - tokens stored without encryption");
  return Buffer.alloc(32, 0);  // all-zero key
}
```

If `JWT_SECRET` is not set (e.g., in a misconfigured staging environment), all OAuth tokens are stored with an all-zero AES key — effectively plaintext. The platform should fail hard rather than silently degrade to an insecure state.

**Recommended fix:**

```ts
if (!secret) {
  throw new Error("[TokenEncryption] FATAL: JWT_SECRET not set. Cannot start without token encryption key.");
}
```

---

## Summary Table

| # | Severity | Finding | File(s) | Fix Complexity |
|---|---|---|---|---|
| 1 | **Critical** | Login requests all scopes upfront — violates incremental auth | `providers.ts`, `gmailSend.ts` | Medium — split login scopes from feature scopes |
| 2 | **High** | Manus OAuth callback still mounted server-side (orphaned attack surface) | `_core/index.ts`, `_core/oauth.ts` | Low — remove two lines |
| 3 | **High** | State parameter has no CSRF nonce | `googleOAuth.ts`, `googleAccountConnect.ts`, `integrations.ts` | Medium — add nonce generation + verification |
| 4 | **Medium** | Refresh failure silently uses stale token; DB status not updated | `calendarWebhook.ts` | Low — update status on failure, remove fallback |
| 5 | **Medium** | Logout does not revoke Google OAuth tokens | `routers.ts` | Low — add non-blocking revocation call |
| 6 | **Low** | Token encryption falls back to zero-key on missing JWT_SECRET | `tokenEncryption.ts` | Low — throw instead of fallback |

---

## Recommended Implementation Order

1. **Finding 2** (remove Manus OAuth route) — 5 minutes, zero risk, immediate security improvement.
2. **Finding 6** (hard-fail on missing JWT_SECRET) — 5 minutes, protects staging/preview environments.
3. **Finding 4** (mark token expired on refresh failure) — 30 minutes, improves UX and data accuracy.
4. **Finding 5** (revoke on logout) — 1 hour, important for shared/family device scenarios.
5. **Finding 3** (CSRF nonce in state) — 2 hours, requires session/cookie plumbing across three flows.
6. **Finding 1** (incremental auth for login scopes) — 3–4 hours, most impactful for Google app review and user trust. Requires updating the login flow, ensuring the `getConnectUrl` path is the canonical scope-granting mechanism, and updating the `gmailSend` service to use a purpose-filtered token rather than the first available token.

---

## Resolution Status — Jun 25, 2026

All six findings were resolved in a single sprint on Jun 25, 2026. See `AI_MEMORY.md` Section 22 for the full architectural documentation.

| # | Finding | Status | Resolution |
|---|---|---|---|
| 1 | Login requests all scopes upfront | ✅ **Resolved** | `providers.ts` now defaults to `GOOGLE_SCOPES.IDENTITY` (openid, email, profile). Feature scopes (calendar, gmail.send) are only requested via the connect-account flow. |
| 2 | Manus OAuth callback still mounted | ✅ **Resolved** | `registerOAuthRoutes` removed from `_core/index.ts`. Route and rate limiter deleted. |
| 3 | No CSRF nonce in state parameter | ✅ **Resolved** | Cryptographic nonce added to all three flows (login, connect-account). Nonce bound to browser via httpOnly cookie, verified in callback, cleared after use. |
| 4 | Refresh failure uses stale token | ✅ **Resolved** | `calendarWebhook.ts` now marks token `status = "expired"` on refresh failure. Stale-token fallback removed entirely. |
| 5 | Logout does not revoke Google tokens | ✅ **Resolved** | `revokeGoogleTokensForUser()` added to `routers.ts`. Called fire-and-forget on logout. Tokens marked `revoked` in DB. |
| 6 | Zero-key fallback on missing JWT_SECRET | ✅ **Resolved** | `tokenEncryption.ts` now throws a fatal error if `JWT_SECRET` is absent. Server will not start. |

**Test results after sprint:** 10/10 test files passed, 182/182 tests passed, 0 TypeScript errors.
