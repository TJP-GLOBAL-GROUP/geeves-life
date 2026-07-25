# Gmail READ Scope & Enriched Booking Data — Ground-Truth Audit

**Date:** 2026-06-28  
**Auditor:** Manus AI (self-audit)  
**Scope:** `server/auth/providers.ts`, `server/auth/googleAccountConnect.ts`, `server/routers/integrations.ts`, `server/services/multiPlatformEmailScraper.ts`, `server/services/icalAggregator.ts`, `oauth_tokens` table, `property_bookings` table, `email_scrape_jobs` table.

---

## Verdict

> **Gmail read scope present in code: NO (partially — see nuance below)**  
> **Enriched booking data functional end-to-end: NO**

The `gmail.readonly` scope is defined in `PURPOSE_SCOPES` inside `server/routers/integrations.ts` and is correctly mapped to the `email_scraping` purpose. However, it is **not present in `GOOGLE_SCOPES` in `server/auth/providers.ts`**, and critically, **the legacy `googleAccountConnect.ts` initiate handler hardcodes only `IDENTITY + CALENDAR + GMAIL_SEND`** — it never calls `buildScopesForPurposes`. The newer `integrations.getConnectUrl` tRPC mutation does use `buildScopesForPurposes` correctly, but the legacy handler is still reachable via `GET /api/auth/google/connect-account` and is the path used by `client/src/const.ts`.

Every scrape attempt on record has failed with **HTTP 403 `PERMISSION_DENIED` / `insufficientPermissions`**. No booking row in the database has a non-null `guestEmail`, `totalPrice`, or `netAmount`. The feature was designed and coded, but the scope dependency was never provisioned on any live token, and the feature has never succeeded end-to-end.

---

## Task 1 — Scope Ground Truth

### 1a. Scope arrays in code

**`server/auth/providers.ts` — `GOOGLE_SCOPES` constant (lines 41–57)**

```ts
export const GOOGLE_SCOPES = {
  IDENTITY: [
    "openid",
    "email",
    "profile",
  ],
  CALENDAR: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  GMAIL_SEND: [
    "https://www.googleapis.com/auth/gmail.send",
  ],
} as const;
```

`gmail.readonly` is **absent** from this file. There is no `GMAIL_READ` key.

**`server/auth/googleAccountConnect.ts` — initiate handler (lines 68–75)**

```ts
const featureScopes = [
  ...GOOGLE_SCOPES.IDENTITY,
  ...GOOGLE_SCOPES.CALENDAR,
  ...GOOGLE_SCOPES.GMAIL_SEND,
];
const url = provider.getAuthorizationUrl(state, redirectUri, featureScopes);
```

This handler is invoked when the user visits `GET /api/auth/google/connect-account`. It hardcodes three scope groups. `gmail.readonly` is **not included**. The string `email_scraping` and `gmail.readonly` return **zero matches** in this file (`grep -n "email_scraping|gmail.readonly" server/auth/googleAccountConnect.ts` → exit code 1, no output).

**`server/routers/integrations.ts` — `PURPOSE_SCOPES` map (lines 72–90)**

```ts
const PURPOSE_SCOPES: Record<IntegrationPurpose, string[]> = {
  calendar_sync: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  email_scraping: [
    "https://www.googleapis.com/auth/gmail.readonly",   // ← defined here
  ],
  notes:  ["https://www.googleapis.com/auth/drive.readonly"],
  tasks:  ["https://www.googleapis.com/auth/tasks.readonly"],
  gmail_send: ["https://www.googleapis.com/auth/gmail.send"],
};
```

`gmail.readonly` is correctly mapped to `email_scraping` in this router. The `getConnectUrl` tRPC mutation (lines ~240–265) calls `buildScopesForPurposes(input.purposes)`, which reads from `PURPOSE_SCOPES`. **This path is correct** — if a user calls `trpc.integrations.getConnectUrl` with `purposes: ["email_scraping"]`, the resulting OAuth URL will include `gmail.readonly`.

**Two connect paths exist; only one includes `gmail.readonly`:**

| Path | Scopes requested | `gmail.readonly` included? |
|---|---|---|
| `GET /api/auth/google/connect-account` (legacy, `googleAccountConnect.ts`) | IDENTITY + CALENDAR + GMAIL_SEND | **NO** |
| `trpc.integrations.getConnectUrl` (new, `integrations.ts`) | `buildScopesForPurposes(purposes)` | **YES, if `email_scraping` is in purposes** |

The legacy path is still referenced in `client/src/const.ts` line 30 (`getGoogleConnectAccountUrl`), though it is imported but not actively called in the current Settings UI. The Settings UI now uses `trpc.integrations.getConnectUrl`, which is the correct path — but the legacy path remains a footgun.

### 1b. Live token scopes (from `oauth_tokens` table)

All 12 rows queried. The columns `scopes` and `purposes` are stored per token. Key findings:

| accountEmail | scopes (abbreviated) | purposes | status |
|---|---|---|---|
| `tarikp.us@gmail.com` | calendar, calendar.events, gmail.send, openid, profile, email | `["email_scraping"]` | **expired** |
| `eniola@tjperkinsfam.com` | calendar, calendar.events, gmail.send, openid, profile, email | `["calendar_sync"]` | active |
| `eniola@tjperkinsfam.com` (2nd row) | calendar, calendar.events, gmail.send, openid, profile, email | `["calendar_sync"]` | active |
| `tarikp.us@gmail.com` (2nd row) | calendar, calendar.events, gmail.send, openid, profile, email | `["calendar_sync"]` | active |
| `tarik@tjperkinsfam.com` | calendar, calendar.events, gmail.send, openid, profile, email | `["calendar_sync"]` | active |
| `tarik.perkins@startout.org` | **gmail.readonly**, gmail.send, tasks.readonly, drive.readonly, calendar, calendar.events, openid, profile, email | `["calendar_sync","email_scraping","notes","tasks","gmail_send"]` | **active** |
| `tarikp@gmail.com` | **gmail.readonly**, gmail.send, drive.readonly, tasks.readonly, calendar, calendar.events, openid, profile, email | `["calendar_sync","email_scraping","notes","tasks","gmail_send"]` | **active** |
| `tarik@maxfieldmarket.com` | calendar, calendar.events, gmail.send, openid, profile, email | `["calendar_sync","email_scraping","notes","tasks","gmail_send"]` | active |
| `tarik@maxfieldbakery.com` | calendar, calendar.events, openid, profile, email | `["calendar_sync","email_scraping","notes","tasks","gmail_send"]` | active |
| `tarik@tjperkinsfam.com` (2nd row) | **gmail.readonly**, gmail.send, tasks.readonly, drive.readonly, calendar, calendar.events, openid, profile, email | `["calendar_sync","email_scraping","notes","tasks","gmail_send"]` | **active** |
| `tarik@tjperkinsfam.com` (3rd row) | calendar, calendar.events, openid, profile, email | `["calendar_sync"]` | active |

**Critical finding:** `tarik@maxfieldmarket.com` is the `notificationEmail` configured on **every property platform** (Morabeza/VRBO, Morabeza/Airbnb, Morabeza/Booking.com, Artiste's Boutique/Airbnb, Artiste's Boutique/VRBO, Artiste's Boutique/Booking.com, Sunset Studio/Booking.com). Its `scopes` column contains only `calendar, calendar.events, gmail.send, openid, profile, email` — **no `gmail.readonly`**. The `purposes` column claims `["calendar_sync","email_scraping","notes","tasks","gmail_send"]`, but the granted scopes do not match the declared purposes.

`tarikp.us@gmail.com` is the `notificationEmail` for Sunset Studio/Airbnb. Its purposes claim `["email_scraping"]` but its scopes also lack `gmail.readonly`, and the token is **expired**.

Two accounts (`tarik.perkins@startout.org`, `tarikp@gmail.com`, `tarik@tjperkinsfam.com` row 2) do have `gmail.readonly` granted, but **none of these are configured as the `notificationEmail` on any property platform**.

---

## Task 2 — Data-Source Ground Truth for Enriched Bookings

### 2a. Code path for populating enrichment fields

The intended path is:

1. **iCal sync** (`server/services/icalAggregator.ts`, `pollPlatformIcal` function, line ~646): inserts rows into `property_bookings` with `icalUid`, `summary`, `description`, `checkIn`, `checkOut`, `bookingType`. **Does not set `guestName`, `guestEmail`, `totalPrice`, or `netAmount`** — these are left null on insert.

2. **Email scraper** (`server/services/multiPlatformEmailScraper.ts`, `scrapeMultiPlatformEmails` function): resolves a Gmail access token for `platform.notificationEmail`, calls `gmailGet()` (Gmail REST API), parses emails with LLM + regex fallback, and upserts enrichment fields (`guestName`, `guestEmail`, `guestPhone`, `totalPrice`, `netAmount`, `confirmationNumber`, `lastEnrichedAt`, `emailScrapeSource`) onto existing iCal-matched rows, or creates new rows for email-only bookings.

### 2b. Which sources are wired and callable today

| Data source | Wired in code? | Callable today? | Reason |
|---|---|---|---|
| iCal feed (VRBO, Airbnb, Booking.com) | Yes | Yes — polling runs | Confirmed: 65 booking rows exist across 9 platforms |
| Gmail API read (`gmail.readonly`) | Yes — code exists | **No** | `notificationEmail` accounts lack `gmail.readonly` scope; all scrape attempts return 403 |
| Platform API (Airbnb/VRBO/Booking.com) | No | No | Not implemented; design doc describes it as Phase 2 option |
| Manual `booking_overrides` | No | No | Schema field referenced in conflict detector but no UI/API to write it |

### 2c. Gmail API call and whether it would succeed

`server/services/multiPlatformEmailScraper.ts` line 71–78 defines `gmailGet()`:

```ts
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
async function gmailGet(path: string, accessToken: string) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
```

This is a correct implementation of the Gmail REST API. It would succeed **if and only if** the access token was granted `gmail.readonly` (or `gmail.modify` or `mail.google.com`). Given that the `notificationEmail` accounts do not have this scope, the call fails at line 462 with a 403.

---

## Task 3 — Runtime Reality

### 3a. Booking rows — enrichment field population

Query across all 9 property platforms:

| Property | Platform | notificationEmail | Total bookings | guestName ≠ null | guestEmail ≠ null | totalPrice ≠ null | netAmount ≠ null | lastEnrichedAt ≠ null |
|---|---|---|---|---|---|---|---|---|
| Morabeza | vrbo | tarik@maxfieldmarket.com | 7 | 0 | 0 | 0 | 0 | 0 |
| Morabeza | airbnb | tarik@maxfieldmarket.com | 6 | 0 | 0 | 0 | 0 | 0 |
| Morabeza | booking_com | tarik@maxfieldmarket.com | 10 | 0 | 0 | 0 | 0 | 0 |
| The Artiste's Boutique | airbnb | tarik@maxfieldmarket.com | 5 | 0 | 0 | 0 | 0 | 0 |
| The Artiste's Boutique | vrbo | tarik@maxfieldmarket.com | 7 | **1** | 0 | 0 | 0 | 0 |
| The Artiste's Boutique | booking_com | tarik@maxfieldmarket.com | 1 | 0 | 0 | 0 | 0 | 0 |
| Sunset Studio | vrbo | tarikp@gmail.com | 25 | 0 | 0 | 0 | 0 | 0 |
| Sunset Studio | airbnb | tarikp.us@gmail.com | 3 | 0 | 0 | 0 | 0 | 0 |
| Sunset Studio | booking_com | tarik@maxfieldmarket.com | 1 | 0 | 0 | 0 | 0 | 0 |

The single `guestName` value in Artiste's Boutique/VRBO is `"Lisa"` — extracted from the iCal SUMMARY field (`"Reserved - Lisa"`) by a regex in `multiPlatformEmailScraper.ts` line 267. This is **not** from email scraping; it is a first-name fragment from the iCal feed. `emailScrapeSource` is null on that row, confirming it was not email-derived.

**All financial fields (`totalPrice`, `commissionAmount`, `netAmount`, `cleaningFee`) are NULL across all 65 booking rows.** `lastEnrichedAt` is NULL on all rows.

### 3b. What the UI renders

The `BookingsTab` in `client/src/pages/Properties.tsx` renders the enrichment badge as "awaiting data" (amber) when `guestName` is null (added in the BookingGantt checkpoint). The UI correctly reflects the empty state. There is no placeholder or fabricated data — the fields are genuinely empty.

### 3c. Scrape job history

All 7 recorded `email_scrape_jobs` rows have `status: "failed"` with identical error messages:

```
Gmail search failed: Gmail API 403: {
  "error": {
    "code": 403,
    "message": "Request had insufficient authentication scopes.",
    "errors": [{ "message": "Insufficient Permission", "domain": "global", "reason": "insufficientPermissions" }],
    "status": "PERMISSION_DENIED"
  }
}
```

Every scrape attempt has failed at the Gmail search step. No emails have ever been read. No enrichment data has ever been written.

---

## Task 4 — Self-Audit: How the Miss Happened

This is a candid account of the failure chain.

**What was true:**
- (a) Feature designed: Yes. Design docs describe email scraping as a Phase 2 capability.
- (b) Feature coded: Yes. `multiPlatformEmailScraper.ts` is a complete, well-structured implementation with LLM parsing, regex fallback, iCal matching, and DB upsert logic.
- (c) Dependency provisioned: **No.** `gmail.readonly` was never added to `GOOGLE_SCOPES` in `providers.ts`, and was never included in the `googleAccountConnect.ts` initiate handler. The `PURPOSE_SCOPES` map in `integrations.ts` correctly defines the mapping, but that router was built later and is only used by the `getConnectUrl` mutation path — not by the legacy connect handler.
- (d) Feature verified end-to-end: **No.** The scraper was never run successfully. The 403 errors in `email_scrape_jobs` were present before this audit but were not surfaced.

**How the miss was reported as implemented:**

The feature was treated as "implemented" based on the presence of the service file (`multiPlatformEmailScraper.ts`) and the UI scaffolding (enrichment badges, scrape trigger buttons in Properties). The implementation was described in terms of what the code *would do* once called, rather than what it *had done* on real data.

The specific failure mode is a **P-08 (External API Contract Surprise)** instance combined with a **scope-gating assumption**: the code assumed that because `gmail.readonly` was defined in `PURPOSE_SCOPES`, it would be present on tokens when the scraper ran. This assumption was never verified against live token data. The `checkEmailAuthStatus` procedure (line 211 in `properties.ts`) even checks `token.scopes.includes("gmail.readonly")` — indicating the gap was known at the code level — but this check was never surfaced to the user or used to block scrape attempts.

The troubleshooting in prior sessions focused on downstream symptoms (empty UI fields, token expiry, propagation) rather than verifying the upstream data feed. The 403 errors in `email_scrape_jobs` were the definitive signal, but the table was not queried during those sessions.

---

## Task 5 — Remediation Plan

### Step 1: Add `gmail.readonly` to `GOOGLE_SCOPES` in `providers.ts`

```ts
// server/auth/providers.ts
export const GOOGLE_SCOPES = {
  IDENTITY: ["openid", "email", "profile"],
  CALENDAR: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  GMAIL_SEND: ["https://www.googleapis.com/auth/gmail.send"],
  GMAIL_READ: ["https://www.googleapis.com/auth/gmail.readonly"],  // ADD THIS
} as const;
```

### Step 2: Remove the hardcoded scope list from `googleAccountConnect.ts`

The legacy initiate handler must be updated to use `buildScopesForPurposes` (from `integrations.ts`) so that the scopes requested match the purposes stored on the token. The `purposes` array should be passed in the query string (already supported in the state object for the callback). Alternatively, deprecate the legacy handler entirely and route all new connections through `trpc.integrations.getConnectUrl`.

**Per OAuth 2.0 compliance:** `gmail.readonly` must only be requested in the incremental connect-account flow (already the case for the `getConnectUrl` path), not at login. The login flow in `googleOAuth.ts` must not be modified.

### Step 3: Re-consent for affected accounts

The following accounts have `email_scraping` in their `purposes` but lack `gmail.readonly` in their granted scopes and are used as `notificationEmail` on property platforms:

- `tarik@maxfieldmarket.com` — used on 7 platforms across 3 properties
- `tarikp.us@gmail.com` — used on Sunset Studio/Airbnb (token also expired)
- `tarikp@gmail.com` — used on Sunset Studio/VRBO (already has `gmail.readonly` — no re-consent needed)

Re-consent requires the user to go to Settings → Integrations → reconnect each affected account with `email_scraping` selected as a purpose. The `getReconnectUrl` mutation already calls `buildScopesForPurposes(purposes)`, so after Step 1 is deployed, reconnecting will correctly include `gmail.readonly`.

### Step 4: Add a scope guard to the scraper

Before calling `gmailGet`, `scrapeMultiPlatformEmails` should verify that the resolved token includes `gmail.readonly`. If not, it should fail fast with a clear error message (e.g., "Token for tarik@maxfieldmarket.com lacks gmail.readonly — reconnect account with Email Scraping purpose") rather than making a 403 call.

### Step 5: Security prerequisites before reading financial email at scale

The following items should be addressed before enabling bulk email reading:

1. **Audit log**: All Gmail API calls should be logged (email address, query, message count, timestamp). This is partially implemented via `email_scrape_jobs` but the error detail is truncated. Full request/response logging should be added.
2. **Data minimisation**: The scraper reads full email bodies. It should store only the parsed structured fields, not raw email content. The `rawEmailSubject` field is acceptable; storing full body text is not.
3. **Data deletion/export**: The `dataClassification.ts` file already classifies `guestName`, `guestEmail`, `guestPhone` as `guest_pii`. A deletion endpoint for guest PII (separate from household member deletion) should exist before this data is populated at scale. This is tracked as todo item C-02.
4. **Scope justification**: `gmail.readonly` grants read access to the entire inbox, not just booking emails. The Google OAuth verification process will require a privacy policy and justification. Consider requesting `gmail.metadata` (headers only) for the search step and `gmail.readonly` only for message body fetch, to minimise exposure.

---

## Task 6 — Knowledge Base Entry

### New pattern: P-09 — Scope/Permission Dependency Not Verified

**Category:** Architecture rule  
**Proposed addition to `docs/patterns/ENGINEERING_LESSONS.md`**

> **P-09: A feature that depends on an external scope or permission is not "implemented" until the scope is requested in code AND granted on the live token AND a real end-to-end API call succeeds. Documentation describing a capability is never evidence that it exists.**

**Root cause:** The scope was defined in a purpose-to-scope mapping table but was not propagated to the OAuth initiate handler. The service code was written assuming the scope would be present, but no integration test verified the full path from consent → token → API call → data written to DB.

**Known instances:**
- `gmail.readonly` for email scraping: defined in `PURPOSE_SCOPES` (integrations.ts), absent from `GOOGLE_SCOPES` (providers.ts) and from the legacy connect handler. All scrape attempts failed with 403. (2026-06-28)

**Prevention checklist:**
- [ ] Every new external scope must be added to `GOOGLE_SCOPES` in `providers.ts` with a named key
- [ ] The connect-account flow must use `buildScopesForPurposes` (not hardcoded scope arrays) so purpose → scope mapping is single-source-of-truth
- [ ] After deploying a scope addition, query `oauth_tokens` to verify at least one live token has the new scope
- [ ] Run the dependent service against a real token and verify data is written to the DB before marking the feature complete
- [ ] Check `email_scrape_jobs` (or equivalent job table) for 403/401 errors before reporting a scraping/integration feature as working

### Definition of Done checklist for integration-dependent features

This checklist should be added to `docs/patterns/ENGINEERING_LESSONS.md` and reviewed at the start of every session that touches an integration feature:

```
Integration Feature Definition of Done
────────────────────────────────────────
[ ] Scope/permission added to the correct constant in providers.ts (or equivalent)
[ ] Scope included in the OAuth initiate handler for the correct flow (NOT login)
[ ] At least one live token in oauth_tokens has the scope granted (verified by DB query)
[ ] Service code makes a real API call against the live token (not mocked)
[ ] API call returns 200 (not 401/403)
[ ] Data is written to the database (verified by SELECT, not by reading code)
[ ] UI renders the real data (not empty state, not placeholder)
[ ] Job/log table (if applicable) shows status = "success" for at least one run
```

**Where it should live:** Append to `docs/patterns/ENGINEERING_LESSONS.md` as a standing section titled "Integration Feature Definition of Done". The `knowledgeReview.ts` file already registers this document in `DOCS_TO_REVIEW`, ensuring it is read at the start of sessions that touch integration code.
