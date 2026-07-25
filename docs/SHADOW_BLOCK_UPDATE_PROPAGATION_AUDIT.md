# Shadow Block Update Propagation — Event Lifecycle Audit

## Event Under Investigation

| Field | Value |
|---|---|
| Event ID | `0ba2395e-22d5-4944-a6a4-f22a7911a34a` |
| Title | Allison // Tarik 1:1 |
| Source Calendar | `tarik.perkins@startout.org` (ID: `S6TrhZoBJZdG5W-EiV5hL`) |
| External ID | `70ivd07njrhp97grp4j1me5uns_20260702T170000Z` |
| Original Time | 2026-07-02 17:00 UTC (1:00 PM EST) — from externalId suffix |
| Rescheduled To | 2026-07-02 15:45 UTC (11:45 AM EST) — 75 minutes earlier |
| Created in DB | 2026-06-15T10:47:51Z (initial full sync) |
| Updated in DB | 2026-07-02T19:18:33Z (webhook sync picked up reschedule) |

## Timeline Reconstruction

1. **Jun 15, 10:47 UTC** — Event first synced into Geeves DB during initial full sync of StartOut calendar.
2. **Jul 02, ~16:18 UTC** — Backfill started. At this point the event was still at 17:00 UTC (1:00 PM). Backfill wrote SBs with 17:00 UTC time.
3. **Jul 02, ~17:00 UTC** — Allison rescheduled the event to 15:45 UTC (11:45 AM). Google sent a push notification to our webhook.
4. **Jul 02, ~17:00 UTC** — Webhook fired → incremental sync ran → `upsertEvent` updated the DB row (startTime changed to 15:45 UTC). `onEventUpserted` was called fire-and-forget (`.catch()`).
5. **Jul 02, ~17:00 UTC** — `onEventUpserted` hit the **circuit breaker** (tripped by the backfill) → propagation skipped silently. Old SBs from step 2 remained with stale 17:00 UTC time.
6. **Jul 02, 17:12:42 UTC** — We manually called `/api/internal/repropagate-event` → deleted stale SBs → re-created 7 SBs with correct 15:45 UTC time.
7. **Jul 02, 19:18:33 UTC** — Another sync cycle updated the `updatedAt` timestamp (no functional change).

## Root Cause

The webhook **DID fire**. The sync **DID update** the event in the DB. `onEventUpserted` **WAS called**. But the propagation was **silently blocked** by the circuit breaker (which was tripped from the backfill running at the same time).

There is **no retry mechanism**. When `onEventUpserted` fails (rate limit, circuit breaker, idempotency lock), the failure is logged to console but **never retried**. The shadow blocks remain stale until either:
- A manual repropagate call
- The next backfill run (but backfill only picks up events with 0 SBs, not stale ones)

## Webhook Status

The StartOut calendar has an **active webhook** (expires 2026-07-09T11:48:35Z). All 8 household calendars have active webhooks. The push notification infrastructure is working correctly.

## The Gap: No Retry Queue

Current flow:
```
Webhook → Sync → upsertEvent → onEventUpserted(.catch()) → [blocked by rate limit/CB] → LOST
```

Required flow:
```
Webhook → Sync → upsertEvent → onEventUpserted → [blocked] → ENQUEUE → [retry later] → SUCCESS
```

## Cross-Platform Architecture Design

### Current State: Google Calendar Only

| Mechanism | Status |
|---|---|
| Google Push Webhooks | ✅ Active (7-day TTL, auto-renewed) |
| Incremental Sync (syncToken) | ✅ Working |
| Full Sync (fallback) | ✅ Working |
| Shadow Block Propagation | ✅ Working (but no retry on failure) |

### Future State: Google + Microsoft + Apple

| Platform | Push Mechanism | Polling Fallback | Auth Model |
|---|---|---|---|
| Google Calendar | Push webhooks (7-day TTL) | syncToken incremental | OAuth 2.0 per-account |
| Microsoft Outlook | Graph subscriptions (3-day TTL) | deltaLink incremental | OAuth 2.0 (MSAL) |
| Apple Calendar (iCloud) | No push available | CalDAV REPORT (10-min poll) | App-specific password or OAuth |
| CalDAV generic | No push available | ctag/etag polling | Basic auth or OAuth |

### Proposed Architecture: Propagation Retry Queue

#### 1. `propagation_queue` Table

```sql
CREATE TABLE propagation_queue (
  id VARCHAR(36) PRIMARY KEY,
  eventId VARCHAR(36) NOT NULL,
  householdId VARCHAR(36) NOT NULL,
  reason ENUM('rate_limit', 'circuit_breaker', 'lock_conflict', 'google_error', 'network_error') NOT NULL,
  attempts INT DEFAULT 0,
  maxAttempts INT DEFAULT 5,
  nextRetryAt BIGINT NOT NULL,  -- UTC ms timestamp
  createdAt BIGINT NOT NULL,
  resolvedAt BIGINT NULL,
  status ENUM('pending', 'resolved', 'failed') DEFAULT 'pending',
  INDEX idx_next_retry (status, nextRetryAt),
  INDEX idx_event (eventId)
);
```

#### 2. Enqueue on Failure

In `onEventUpserted`, when the circuit breaker or rate limit blocks propagation, instead of just logging a warning, also write a row to `propagation_queue`:

```typescript
if (circuitBreakerTripped) {
  await enqueuePropagationRetry(eventId, householdId, 'circuit_breaker');
  propagationLock.delete(eventId);
  return;
}
```

#### 3. Heartbeat Drain Handler

A 5-minute heartbeat job (`/api/scheduled/propagation-drain`) that:
1. Selects up to 50 pending rows where `nextRetryAt <= now` and `attempts < maxAttempts`
2. Calls `onEventUpserted(eventId, householdId, { skipRateLimit: true })` for each
3. On success: marks row as `resolved`
4. On failure: increments `attempts`, sets `nextRetryAt` with exponential backoff (1m, 5m, 15m, 1h, 4h)
5. On max attempts: marks row as `failed`, notifies owner

#### 4. Stale SB Detection (Consistency Check)

A daily heartbeat job (`/api/scheduled/sb-consistency-check`) that:
1. Finds events where `events.updatedAt > shadow_blocks.createdAt` (event was modified after SBs were written)
2. Compares `events.startTime` vs `shadow_blocks.startTime` — if they differ, the SB is stale
3. Enqueues stale events into `propagation_queue` for re-propagation

This catches ANY case where an update was missed — regardless of platform or failure reason.

#### 5. Microsoft Graph Integration (Future)

```typescript
// Microsoft Graph subscription (similar to Google webhook)
// TTL: 3 days (shorter than Google's 7 days)
// Notification URL: /api/webhooks/microsoft-calendar
// Resource: /me/events
// Change types: created, updated, deleted
```

Key differences from Google:
- Subscriptions expire in 3 days (vs 7 for Google) — need more frequent renewal
- Delta queries use `deltaLink` (similar to Google's syncToken)
- Event format is different (ISO 8601 strings vs epoch timestamps)
- Auth uses MSAL (Microsoft Authentication Library) with refresh tokens

#### 6. Apple Calendar / CalDAV Integration (Future)

No push mechanism available. Must poll:
- Use CalDAV `REPORT` method with `calendar-query` to detect changes
- Compare `ctag` (collection tag) to detect any change, then `etag` per event
- Poll interval: 10 minutes (same as iCal feeds)
- Auth: App-specific password (iCloud) or OAuth (other CalDAV providers)

### Implementation Priority

1. **Propagation Retry Queue** — fixes the immediate problem (today's sprint)
2. **Stale SB Consistency Check** — catches edge cases across all platforms
3. **Microsoft Graph Integration** — when user connects Outlook calendars
4. **Apple CalDAV Integration** — when user connects iCloud calendars

### Rate Limiter Improvements

The current rate limiter should be modified to:
1. **Exempt webhook-triggered propagations from the per-calendar hourly cap** — these are real-time updates that MUST propagate immediately
2. **Only apply the cap to backfill/bulk operations** — add a `source: 'webhook' | 'backfill' | 'manual'` parameter
3. **Keep the circuit breaker for runaway loops** but raise the threshold during known backfill windows
