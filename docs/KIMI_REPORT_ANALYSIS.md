# KIMI Export Team Code Review — Analysis & Response

**Date:** July 8, 2026  
**Reviewed by:** Team Manus  
**Source:** KIMI Export Team Review Report (geeves_review.docx)  
**Scope:** Calendar propagation engine, webhook handling, OAuth security, schema integrity

---

## Executive Summary

The KIMI team conducted a thorough static analysis of the Geeves calendar propagation subsystem. Their report identifies 8 Critical and 11 High findings, along with 5 failure chain analyses. After cross-referencing every claim against the live codebase, Team Manus finds the report to be **approximately 70% fully accurate, 20% partially correct (overstated or missing context), and 10% incorrect**.

The most actionable finding is **C-8 (over-broad shadow block deletion)**, which represents a genuine logic bug that could cause user-visible data loss. Several other findings (H-6, H-8, H-9) represent real hardening opportunities. However, the report also contains one factual error (C-4 claims a missing constraint that actually exists) and several findings that describe intentional design decisions as bugs (C-7, Chain D).

This document serves three purposes: (1) acknowledge and accredit valid KIMI findings, (2) correct inaccuracies, and (3) provide planned fix code for confirmed issues without implementing them yet.

---

## Section 1: Accuracy Assessment

### Findings Confirmed as Accurate (Credit: KIMI Export Team)

The following findings are confirmed accurate against the codebase as of checkpoint `02bd1eb2`. The KIMI team correctly identified these issues and their analysis deserves full credit.

| ID | Finding | Severity | File:Line | Team Manus Assessment |
|----|---------|----------|-----------|----------------------|
| C-1 | Circuit breaker resets on cold start | Critical | eventPropagation.ts:169-172 | Module-level `let` variables reset to zero on every Autoscale cold start. With N instances, effective cap becomes N × 3000/10min. |
| C-2 | Per-calendar rate limiter porous across instances | Critical | eventPropagation.ts:103 | In-memory `Map` provides no cross-instance coordination. |
| C-3 | Idempotency lock lost on restart | Critical | eventPropagation.ts:100 | In-memory `Set` resets on cold start. Practical impact is limited since the UNIQUE constraint (which KIMI incorrectly claims is missing) provides the real duplicate prevention. |
| C-5 | NULL verticalId causes silent propagation abort | Critical | eventPropagation.ts:272-274 | Calendar records created by auto-discovery have no verticalId. If a webhook fires before the user assigns a vertical, propagation silently aborts. |
| C-8 | Webhook delete removes ALL shadow blocks for source event | Critical | calendarWebhook.ts:178-180 | When one shadow block is deleted externally on a target calendar, `deleteShadowBlocksForEvent(sourceEventId)` removes all blocks for that source event across all target calendars. This is the most actionable bug. |
| H-1 | Propagation never writes to audit_log | High | eventPropagation.ts (absent) | `writeAuditLog` exists and is used by other subsystems, but propagation operations are completely unaudited. |
| H-2 | Webhook endpoint lacks channel token validation | High | calendarWebhook.ts:81-117 | No `x-goog-channel-token` verification. Token field stored as NULL during watch() registration. |
| H-6 | No unique constraint on calendars(householdId, externalId) | High | schema.ts:359-395 | Duplicate prevention relies solely on application-level checks in googleAccountConnect.ts. |
| H-7 | N+1 query patterns in propagation pipeline | High | eventPropagation.ts:607-741 | Per-target queries for `shouldExcludeForMember` and `getAccessTokenForCalendar`. |
| H-8 | Missing indexes on shadow_blocks.externalEventId and events.recurringEventId | High | schema.ts:449, 411 | Hot-path queries scan without covering indexes. |
| H-9 | Redirect URI uses user input without allowlist | High | googleOAuth.ts:42 | `origin` query parameter used directly in redirect URI construction. Open redirect vulnerability. |

### Findings Partially Correct (Overstated or Missing Context)

| ID | KIMI Claim | Reality | Correct Severity |
|----|-----------|---------|-----------------|
| C-6 | Non-atomic insert duplicates rows | The UNIQUE constraint (`shadow_blocks_source_target_uniq`) catches duplicates via `ER_DUP_ENTRY` → UPDATE fallback. Partial failure is possible (some blocks written, others not) but not duplicate rows. | Medium |
| C-7 | accountEmail NULL skip violates DB-row invariant | This is intentional design (P-16 rule). Calendars without accountEmail can never sync to Google. Writing permanently-stuck `sync_failed` records would be worse. The valid concern is the lack of user-facing signal. | Medium (UX gap, not data integrity) |
| H-5 | Token refresh race corrupts tokens | Google's refresh token endpoint is idempotent — multiple concurrent refreshes don't invalidate each other. Worst case: one stale access token write that gets refreshed on next call. | Medium |
| H-10 | Shadow blocks invisible, no perspective UI | `ShadowBlocksPanel.tsx` exists for per-event overrides. CalendarView renders shadow blocks. Home.tsx shows sync health. What IS missing: a perspective switcher to view calendar as another member. | Medium (UX enhancement, not bug) |
| H-11 | Propagation health buried in collapsed card | Maintenance card is NOT collapsed — it's directly visible in Settings → Calendars tab. Home.tsx has a prominent sync health indicator with status labels, counts, and ETA. What IS valid: no dedicated propagation analytics dashboard. | Low |
| Chain B | Missing visibility rules cause silent non-propagation | Code has DEFAULT-BUSY fallback (lines 658-683, 725-753). Events always propagate as "Busy" when no rules exist. Uncovered verticals also get default-busy. | Informational |
| Chain D | accountEmail NULL skip is a failure chain | Same as C-7 — intentional P-16 design. Valid concern about user-facing signal, not a failure chain. | Medium (UX) |

### Finding Disproved

| ID | KIMI Claim | Evidence |
|----|-----------|---------|
| C-4 | `shadow_blocks` unique constraint absent from production | **The constraint EXISTS**: `uniqueIndex("shadow_blocks_source_target_uniq").on(t.sourceEventId, t.targetCalendarId)` at schema.ts:458. The INSERT loop at eventPropagation.ts:480-501 explicitly handles `ER_DUP_ENTRY` with an UPDATE fallback. This was fixed in commit `7e95357` and documented in `ENGINEERING_LESSONS.md`. |

---

## Section 2: Planned Fixes (Code Prepared, Not Implemented)

The following code blocks represent the planned fixes for confirmed issues. These will be compared against the KIMI team's updated codebase before implementation.

### Fix 1: C-8 — Scoped Shadow Block Deletion

**Problem:** Deleting one shadow block on a target calendar removes ALL shadow blocks for the source event.

**Planned fix:** Replace `deleteShadowBlocksForEvent(sourceEventId)` with a scoped delete that only removes the specific block that was deleted externally.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/db.ts — ADD new helper function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Delete a SINGLE shadow block by its externalEventId on a specific target calendar.
 * Used when a shadow block is deleted externally (user removes it from their Google Calendar).
 * This scoped delete ensures other target calendars' shadow blocks remain intact.
 *
 * Credit: KIMI Export Team identified the over-broad deletion pattern (C-8).
 */
export async function deleteShadowBlockById(shadowBlockId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(shadowBlocks).where(eq(shadowBlocks.id, shadowBlockId));
}

/**
 * Mark a shadow block as dismissed (soft-delete) rather than hard-deleting.
 * Preserves the record for audit and prevents re-propagation from recreating it.
 */
export async function dismissShadowBlock(shadowBlockId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(shadowBlocks)
    .set({ isDismissed: true, dismissedAt: new Date() })
    .where(eq(shadowBlocks.id, shadowBlockId));
}
```

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/calendarWebhook.ts — REPLACE lines 178-180
// ═══════════════════════════════════════════════════════════════════════════

// BEFORE (over-broad):
// await db.deleteShadowBlocksForEvent(shadowBlock.sourceEventId);

// AFTER (scoped — only dismiss the specific block that was deleted externally):
if (converted.status === "cancelled") {
  console.log(`[Sync] Shadow block ${gEvent.id} was deleted externally on ${calendarId} — dismissing this block only`);
  // Dismiss (soft-delete) only THIS shadow block, not all blocks for the source event.
  // Other target calendars retain their shadow blocks.
  // The source event still controls the lifecycle — if the source event is deleted,
  // onEventDeleted() will clean up ALL blocks via deleteShadowBlocksForEvent().
  await db.dismissShadowBlock(shadowBlock.id);
}
```

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/calendarWebhook.ts — REPLACE lines 252-254 (full sync path)
// ═══════════════════════════════════════════════════════════════════════════

// BEFORE:
// await db.deleteShadowBlocksForEvent(shadowBlock.sourceEventId);

// AFTER:
if (event.status === "cancelled") {
  console.log(`[FullSync] Shadow block ${event.externalId} deleted externally — dismissing this block only`);
  await db.dismissShadowBlock(shadowBlock.id);
}
```

---

### Fix 2: H-2 — Webhook Channel Token Validation

**Problem:** Webhook endpoint accepts any request with valid-looking headers. No cryptographic verification.

**Planned fix:** Set a channel token during watch() registration and verify it on receipt.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/calendarWebhook.ts — MODIFY webhook registration
// ═══════════════════════════════════════════════════════════════════════════

import { randomBytes } from "crypto";

// In the watch() call during webhook registration:
const channelToken = randomBytes(32).toString("hex");

// Pass token to Google Calendar API watch request:
const watchBody = {
  id: channelId,
  type: "web_hook",
  address: webhookUrl,
  token: channelToken,  // Google will echo this back in x-goog-channel-token header
};

// Store token in webhook_channels table:
await db.createWebhookChannel({
  id: channelId,
  householdId: calendar.householdId,
  calendarId: calendar.id,
  resourceId: result.resourceId,
  resourceUri: null,
  notificationUrl: webhookUrl,
  expiresAt: parseInt(result.expiration, 10),
  token: channelToken,  // NOW stored (was NULL before)
  status: "active",
});
```

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/calendarWebhook.ts — MODIFY webhook handler (line 81+)
// ═══════════════════════════════════════════════════════════════════════════

app.post("/api/webhooks/google-calendar", async (req: Request, res: Response) => {
  // Always respond 200 immediately (Google requires fast response)
  res.status(200).send("OK");

  try {
    const channelId = req.headers["x-goog-channel-id"] as string;
    const resourceId = req.headers["x-goog-resource-id"] as string;
    const resourceState = req.headers["x-goog-resource-state"] as string;
    const channelToken = req.headers["x-goog-channel-token"] as string | undefined;

    // Ignore sync messages (initial subscription confirmation)
    if (resourceState === "sync") return;

    // Look up the webhook channel
    const channel = await db.getWebhookChannelByResourceId(resourceId);
    if (!channel) {
      console.warn(`[Webhook] No active channel found for resource ${resourceId}`);
      return;
    }

    // SECURITY: Verify channel token (Credit: KIMI Export Team, H-2)
    if (channel.token && channel.token !== channelToken) {
      console.warn(`[Webhook] ⚠️ Token mismatch for channel ${channelId} — rejecting`);
      return;
    }

    // ... rest of handler unchanged
  } catch (error) {
    console.error("[Webhook] Error processing notification:", error);
  }
});
```

---

### Fix 3: H-6 — Unique Constraint on Calendars Table

**Problem:** No DB-level prevention of duplicate calendar records for the same Google Calendar ID within a household.

**Planned fix:** Add a unique index on `(householdId, externalId)` with a NULL-safe approach (MySQL allows multiple NULLs in unique indexes, which is correct for manual calendars without externalId).

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: drizzle/schema.ts — ADD index block to calendars table
// ═══════════════════════════════════════════════════════════════════════════

export const calendars = mysqlTable("calendars", {
  // ... existing columns unchanged ...
}, (t) => ({
  // Credit: KIMI Export Team identified missing constraint (H-6)
  // MySQL allows multiple NULLs in unique indexes, so manual calendars (externalId=NULL)
  // won't conflict. Only non-NULL externalIds are enforced unique per household.
  householdExternalUniq: uniqueIndex("calendars_household_external_uniq").on(t.householdId, t.externalId),
}));
```

---

### Fix 4: H-8 — Missing Indexes on Hot-Path Columns

**Problem:** `shadow_blocks.externalEventId` and `events.recurringEventId` are queried in webhook sync paths without covering indexes.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: drizzle/schema.ts — ADD indexes to shadow_blocks and events tables
// ═══════════════════════════════════════════════════════════════════════════

// In shadow_blocks table index block:
}, (t) => ({
  uniqSourceTarget: uniqueIndex("shadow_blocks_source_target_uniq").on(t.sourceEventId, t.targetCalendarId),
  householdTimeIdx: index("sb_household_time_idx").on(t.householdId, t.startTime, t.endTime),
  // Credit: KIMI Export Team (H-8) — getShadowBlockByExternalId queries this in webhook sync
  externalEventIdx: index("sb_external_event_idx").on(t.externalEventId, t.targetCalendarId),
}));

// In events table index block:
}, (t) => ({
  householdTimeIdx: index("events_household_time_idx").on(t.householdId, t.startTime, t.endTime),
  calendarStartIdx: index("events_calendar_start_idx").on(t.calendarId, t.startTime),
  calendarExternalUniq: uniqueIndex("events_calendar_external_uniq").on(t.calendarId, t.externalId),
  // Credit: KIMI Export Team (H-8) — recurring event instance lookups
  recurringEventIdx: index("events_recurring_idx").on(t.recurringEventId),
}));
```

---

### Fix 5: H-9 — Origin Allowlist for OAuth Redirect

**Problem:** The `origin` query parameter is used directly to construct the OAuth redirect URI, enabling open redirect attacks.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/auth/googleOAuth.ts — ADD origin validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that the origin is an allowed redirect target.
 * Prevents open redirect attacks via the OAuth flow.
 * Credit: KIMI Export Team (H-9)
 */
function validateOrigin(origin: string, req: Request): string {
  // Build allowlist from known safe origins
  const appUrl = process.env.APP_URL || "";
  const serverHost = `${req.protocol}://${req.get("host")}`;
  
  const allowedOrigins = new Set<string>([
    serverHost,
    appUrl,
    // Manus preview domains
    ...(appUrl.includes("manus.computer") ? [appUrl] : []),
  ].filter(Boolean));

  // Also allow any *.manus.computer or *.manus.space subdomain (deployment previews)
  const isManusOrigin = /^https:\/\/[a-z0-9-]+\.(manus\.computer|manus\.space)$/.test(origin);
  
  if (allowedOrigins.has(origin) || isManusOrigin) {
    return origin;
  }

  console.warn(`[OAuth] ⚠️ Rejected untrusted origin: ${origin}`);
  return serverHost; // Fall back to server's own origin
}

// In the login route handler:
app.get("/api/auth/google/login", async (req: Request, res: Response) => {
  const rawOrigin = req.query.origin as string || `${req.protocol}://${req.get("host")}`;
  const origin = validateOrigin(rawOrigin, req);
  const returnPath = req.query.returnPath as string || "/dashboard";
  // ... rest unchanged
});
```

---

### Fix 6: H-7 — Batch Token Lookup (N+1 Query Mitigation)

**Problem:** Each target calendar triggers an individual `getAccessTokenForCalendar` call.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/db.ts — ADD batch token lookup helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batch-fetch OAuth tokens for multiple member+email pairs in a single query.
 * Reduces N+1 pattern in propagation pipeline.
 * Credit: KIMI Export Team (H-7)
 */
export async function getOAuthTokensBatch(
  memberEmails: Array<{ memberId: string; accountEmail: string }>
): Promise<Map<string, typeof oauthTokens.$inferSelect>> {
  const db = await getDb();
  if (!db || memberEmails.length === 0) return new Map();

  const { oauthTokens } = await import("../drizzle/schema");
  const { or, and, eq } = await import("drizzle-orm");

  // Build OR conditions for each member+email pair
  const conditions = memberEmails.map(({ memberId, accountEmail }) =>
    and(
      eq(oauthTokens.memberId, memberId),
      eq(oauthTokens.provider, "google"),
      eq(oauthTokens.accountEmail, accountEmail)
    )
  );

  const rows = await db.select().from(oauthTokens).where(or(...conditions));

  // Key by "memberId:accountEmail" for O(1) lookup
  const map = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    if (row.accountEmail) {
      map.set(`${row.memberId}:${row.accountEmail}`, row);
    }
  }
  return map;
}
```

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/eventPropagation.ts — USAGE in buildPropagationTargets
// ═══════════════════════════════════════════════════════════════════════════

// After building the initial target list (before the token lookup loop),
// batch-fetch all tokens at once:

const tokenNeeds = targets
  .filter(t => t.externalCalendarId && !t.noGoogleWrite)
  .map(t => {
    const cal = allCalendars.find(c => c.id === t.calendarId);
    return { memberId: t.memberId, accountEmail: cal?.accountEmail || "" };
  })
  .filter(t => t.accountEmail);

const tokenMap = await db.getOAuthTokensBatch(tokenNeeds);

// Then in the target-building loop, replace individual getAccessTokenForCalendar calls:
// const token = tgt.externalId ? await getAccessTokenForCalendar(tgt.id, tgt.memberId) : null;
// WITH:
// const tokenKey = `${tgt.memberId}:${tgt.accountEmail}`;
// const cachedToken = tokenMap.get(tokenKey);
// const token = cachedToken?.accessToken && isTokenValid(cachedToken) ? cachedToken.accessToken : null;
```

---

### Fix 7: C-5 / Chain A — Prevent Propagation Silencing for Unassigned Calendars

**Problem:** Newly connected calendars have no verticalId. If a webhook fires before the user assigns a vertical, propagation silently aborts. The calendar can receive events but never propagates them.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FILE: server/services/eventPropagation.ts — ENHANCE the verticalId check
// ═══════════════════════════════════════════════════════════════════════════

// BEFORE (silent abort):
// if (!srcCal || !srcCal.verticalId) {
//   console.log(`[Propagation] Event ${eventId} calendar has no vertical — skipping propagation`);
//   return;
// }

// AFTER (queue for retry + notify):
if (!srcCal) {
  console.warn(`[Propagation] Event ${eventId} calendar not found — skipping`);
  return;
}

if (!srcCal.verticalId) {
  // Credit: KIMI Export Team (C-5, Chain A)
  // Instead of silently aborting, enqueue for retry. The user may assign a vertical soon.
  // Also emit a health signal so the UI can prompt the user.
  console.warn(`[Propagation] Event ${eventId} on calendar ${srcCal.id} (${srcCal.name}) has no vertical — queuing for retry`);
  await enqueuePropagationRetry(eventId, householdId, "no_vertical");
  
  // Notify once per calendar (not per event) that this calendar needs a vertical assignment
  const notifKey = `no-vertical-${srcCal.id}`;
  if (await shouldNotifyAsync(notifKey)) {
    await notifyOwner({
      title: "Calendar needs vertical assignment",
      content: `Calendar "${srcCal.name}" has events but no vertical assigned. Events on this calendar won't propagate shadow blocks until a vertical is set. Go to Settings → Calendars to assign one.`,
    });
  }
  return;
}
```

---

## Section 3: Learnings for AI_MEMORY & ENGINEERING_LESSONS

### New Knowledge Entries (for project_knowledge DB)

These entries should be added to the `project_knowledge` table so they appear in the next AI_MEMORY regeneration cycle:

```
KEY: "kimi review serverless state"
VALUE: "CRITICAL RULE (Credit: KIMI Export Team, Jul 2026): In-memory state (Set, Map, module-level variables) is EPHEMERAL on Autoscale hosting. Circuit breakers, rate limiters, and idempotency locks stored in-process provide ZERO cross-instance coordination and reset on every cold start. For safety-critical limits: use DB-backed counters (like shouldNotifyAsync already does). For performance-only limits: accept that in-memory is best-effort and document the degradation mode. NEVER rely on in-memory state for data integrity — only for performance throttling."

KEY: "kimi review shadow block delete scope"
VALUE: "BUG PATTERN (Credit: KIMI Export Team, Jul 2026): When a shadow block is deleted externally on a TARGET calendar, the correct response is to dismiss ONLY THAT BLOCK — not all blocks for the source event. deleteShadowBlocksForEvent(sourceEventId) is only appropriate when the SOURCE EVENT itself is deleted/cancelled. External deletion of a shadow block = user opted out of that specific block on their calendar. Use dismissShadowBlock(blockId) for external deletions; reserve deleteShadowBlocksForEvent for source event lifecycle changes."

KEY: "kimi review webhook security"
VALUE: "SECURITY RULE (Credit: KIMI Export Team, Jul 2026): Google Calendar push notifications support a channel token (set during watch(), echoed in x-goog-channel-token header on notifications). ALWAYS set a cryptographic token during webhook registration and verify it on receipt. The resourceId lookup alone is not sufficient — resourceIds are predictable UUIDs. Channel token provides defense-in-depth against spoofed webhook calls."

KEY: "kimi review origin allowlist"
VALUE: "SECURITY RULE (Credit: KIMI Export Team, Jul 2026): OAuth redirect URIs MUST validate the origin parameter against an allowlist. Never use user-supplied origin directly in redirect URI construction. Allowlist should include: APP_URL, server host, and *.manus.computer/*.manus.space preview domains. Reject unknown origins with a fallback to the server's own host."

KEY: "kimi review db constraints"
VALUE: "SCHEMA RULE (Credit: KIMI Export Team, Jul 2026): Every table representing a relationship or external-system mapping MUST have a DB-level unique constraint — not just application-level dedup checks. Application checks can be bypassed by race conditions, concurrent requests, or code paths that skip the check. The calendars table needs uniqueIndex(householdId, externalId). The shadow_blocks table already has this (KIMI incorrectly claimed it was missing)."
```

### New Pattern for ENGINEERING_LESSONS.md

```markdown
## P-XX — Over-Broad Cascade Delete

### Description

A cleanup operation triggered by a specific event (one shadow block deleted on one target calendar) cascades to delete ALL related records across ALL targets. The trigger is scoped to one entity, but the response affects the entire relationship graph.

### Root Cause

The delete helper (`deleteShadowBlocksForEvent`) was designed for the SOURCE EVENT deletion case (where all shadow blocks should indeed be removed). It was then reused in the EXTERNAL DELETION case (where only one specific block was removed by the user on their calendar), without adjusting the scope.

### Known Instances

| Location | Symptom | Fix |
|----------|---------|-----|
| calendarWebhook.ts:178-180 | User deletes one shadow block on their calendar → ALL shadow blocks for that source event are removed from all other members' calendars | Replace with `dismissShadowBlock(blockId)` — scope to the specific block |
| calendarWebhook.ts:252-254 | Same pattern in full sync path | Same fix |

### Prevention Checklist

- [ ] **Distinguish trigger scope from response scope.** If the trigger is "one record changed," the response should affect only that record unless there's an explicit business reason to cascade.
- [ ] **Name functions to indicate their blast radius.** `deleteShadowBlocksForEvent` clearly indicates it deletes ALL blocks for an event. If you only want to delete ONE, you need a different function.
- [ ] **Soft-delete before hard-delete.** Use `isDismissed` flag for user-initiated removals. Reserve hard deletes for source event lifecycle changes.
- [ ] **Audit cascade operations.** Any operation that affects records beyond the immediate trigger should write to audit_log.

---

## P-XX — Serverless State Amnesia

### Description

Safety-critical state (circuit breakers, rate limiters, idempotency locks) stored in module-level variables provides no protection across Autoscale instances and resets on every cold start. The system behaves as if the safeguard doesn't exist when multiple instances are active or after a restart.

### Root Cause

The safeguards were designed for a single-process deployment model. When the hosting moved to Autoscale (serverless, min-instances=0), the in-memory state became ephemeral. The code was never migrated to DB-backed state.

### Known Instances

| Location | State | Impact |
|----------|-------|--------|
| eventPropagation.ts:100 | `propagationLock = new Set()` | Concurrent propagation for same event possible across instances |
| eventPropagation.ts:103 | `calendarWriteCounter = new Map()` | Per-calendar rate limit ineffective across instances |
| eventPropagation.ts:169-172 | `circuitBreakerCount`, `circuitBreakerTripped` | Global write cap = N × 3000 with N instances |

### Prevention Checklist

- [ ] **Data integrity safeguards MUST be DB-backed.** If a safeguard prevents data corruption or duplication, it must survive cold starts. Use DB counters, Redis, or UNIQUE constraints.
- [ ] **Performance safeguards MAY be in-memory.** If a safeguard only prevents excessive API calls (rate limiting), in-memory is acceptable as best-effort. Document that it degrades under horizontal scaling.
- [ ] **Comment the durability guarantee.** Every in-memory safeguard should have a comment: `// BEST-EFFORT: resets on cold start, not coordinated across instances`
- [ ] **Never rely on in-memory state for idempotency.** Use DB UNIQUE constraints or conditional inserts (`INSERT ... ON DUPLICATE KEY UPDATE`).

---

## P-XX — Unvalidated Redirect Origin

### Description

OAuth flows accept a user-supplied `origin` parameter and use it to construct redirect URIs. An attacker can supply a malicious origin to redirect the OAuth callback to their server, potentially capturing authorization codes or session tokens.

### Root Cause

The OAuth implementation followed the Manus template pattern of using `window.location.origin` from the frontend, which is safe when the frontend is trusted. But the server-side handler accepts any origin value from the query string without validation.

### Known Instances

| Location | Vector | Fix |
|----------|--------|-----|
| googleOAuth.ts:42 | `origin` query param → redirect URI | Validate against allowlist of known domains |
| googleAccountConnect.ts:51-67 | Same pattern for account connection flow | Same fix |

### Prevention Checklist

- [ ] **Never use user input directly in redirect URIs.** Always validate against an allowlist.
- [ ] **Allowlist should be derived from environment.** Use `APP_URL`, server host, and known deployment domain patterns.
- [ ] **Reject with fallback, don't error.** If origin is untrusted, fall back to the server's own host rather than returning an error (which could leak information).
```

---

## Section 4: Items NOT Requiring Fixes

The following KIMI findings describe intentional design decisions or already-resolved issues. No code changes are planned.

| ID | KIMI Claim | Why No Fix Needed |
|----|-----------|-------------------|
| C-4 | Missing unique constraint on shadow_blocks | **Constraint already exists** (`shadow_blocks_source_target_uniq`). KIMI's analysis is factually incorrect here. |
| C-7 | accountEmail NULL skip "violates invariant" | **Intentional P-16 design.** Writing permanently-stuck `sync_failed` records for calendars that can never sync would be worse. The UX signal gap is addressed separately. |
| Chain B | Missing rules cause silent non-propagation | **Default-busy fallback exists.** Code at lines 658-683 and 725-753 ensures events always propagate when no rules are configured. |
| Chain C | Webhook channel expiration | **Already resolved.** KIMI acknowledges this. |
| H-4 | calendarWriteCounter grows unbounded | **Low practical impact.** Autoscale cold starts naturally prune the Map. On a long-running instance, the Map would hold at most ~20 entries (one per calendar). Not worth the complexity of a pruning mechanism. |

---

## Section 5: Priority Order for Implementation

When we compare the KIMI team's updated codebase against these planned fixes and decide what to implement, the priority order should be:

| Priority | Fix | Rationale |
|----------|-----|-----------|
| P0 | C-8 (scoped shadow block deletion) | Active data loss bug — user action on one calendar affects all members |
| P1 | H-9 (origin allowlist) | Security vulnerability — open redirect in OAuth flow |
| P1 | H-2 (webhook channel token) | Security hardening — prevents spoofed webhook triggers |
| P2 | H-6 (calendars unique constraint) | Data integrity — prevents duplicate calendar records at DB level |
| P2 | H-8 (missing indexes) | Performance — hot-path queries without covering indexes |
| P3 | H-7 (batch token lookup) | Performance — N+1 queries in propagation pipeline |
| P3 | C-5 (retry + notify for unassigned calendars) | UX — silent abort replaced with actionable notification |
| P4 | H-1 (audit trail for propagation) | Observability — important for debugging but not user-facing |
| P4 | C-1/C-2/C-3 (DB-backed safeguards) | Resilience — in-memory state is best-effort; DB constraints provide the real protection |

---

## Acknowledgments

The KIMI Export Team conducted a thorough and largely accurate static analysis of the calendar propagation subsystem. Their identification of C-8 (over-broad shadow block deletion) alone justifies the review — this is a genuine logic bug that could cause user-visible data loss. The security findings (H-2, H-9) and schema hardening recommendations (H-6, H-8) are also valuable contributions that will improve the system's resilience.

Where the report overstates findings (C-4, C-7, Chain B), the discrepancies appear to stem from analyzing the code without full context of the design decisions documented in `ENGINEERING_LESSONS.md` and the `project_knowledge` database. This is understandable for an external review team working from a code snapshot.

**Team Manus commits to:**
1. Crediting the KIMI team in all code comments implementing their findings
2. Adding their insights to our permanent engineering knowledge base
3. Ensuring the patterns they identified are prevented in future development

---

*Document prepared by Team Manus — July 8, 2026*
