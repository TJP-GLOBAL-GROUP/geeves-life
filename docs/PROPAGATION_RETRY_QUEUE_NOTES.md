# Propagation Retry Queue — Implementation Notes

## What was built

1. **Schema**: `propagation_queue` table in `drizzle/schema.ts` (already created in DB via direct SQL)
2. **Enqueue helper**: `enqueuePropagationRetry()` in `server/services/eventPropagation.ts`
   - Wired into circuit breaker block (line ~235) and per-calendar rate limit block (line ~297)
   - Deduplicates by eventId (won't enqueue if already pending)
   - First retry in 1 minute
3. **Drain handler**: `server/scheduledHandlers/propagationRetry.ts`
   - Endpoint: `POST /api/scheduled/propagation-retry`
   - Auth: Manus cron gateway (sdk.authenticateRequest) or localhost
   - Processes up to 50 pending items per run
   - Calls `onEventUpserted(eventId, householdId, { skipRateLimit: true })` for each
   - Exponential backoff: 1min, 4min, 9min, 16min, 25min
   - Max 5 attempts before marking as "failed"
4. **Route registered** in `server/_core/index.ts` line ~115

## Still needed

- **Register the heartbeat cron** via `manus-heartbeat create` (requires deployment first)
  - Name: `propagation-retry`
  - Cron: `0 */2 * * * *` (every 2 minutes)
  - Path: `/api/scheduled/propagation-retry`
- **Cross-platform architecture** (Google, Microsoft, Apple):
  - Google: Push webhooks already working (notifications on event changes trigger onEventUpserted)
  - Microsoft (Outlook/O365): Would need Graph API subscriptions (change notifications)
  - Apple (iCloud): No push API — must poll via CalDAV REPORT method
  - The retry queue handles ALL platforms uniformly — the gap is only in the *trigger* mechanism

## Root cause of the Allison//Tarik 1:1 stale block

The event was originally at 1:00-1:30 PM. Allison rescheduled it to 11:45 AM-12:15 PM.
When the webhook fired for the update, `onEventUpserted` was called which:
1. Calls `deleteExistingBlockers(eventId)` — removes old SBs and their Google Calendar events
2. Rebuilds targets and writes new SBs with the updated times

The issue: the per-calendar rate limiter was tripped for the target calendar, so step 2
was skipped with `continue` — the old blocks were deleted but new ones were never written.
This left a gap where the event had 0 SBs until the backfill ran.

With the retry queue, this scenario is now handled: the rate-limited write enqueues a retry,
and within 1 minute the propagation-retry handler picks it up and re-propagates with
skipRateLimit=true, ensuring the SBs are always written.

## TypeScript status: 0 errors (confirmed)
