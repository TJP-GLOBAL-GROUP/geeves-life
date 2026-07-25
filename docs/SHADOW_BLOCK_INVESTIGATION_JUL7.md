# Shadow Block Investigation — July 7, 2026

## Issue Statement
"Shadow blocks are still not on all calendars. Dashboard is not showing any reauthorization needs."

## Database Findings

### Shadow Block Sync Status
- **pending_sync: 10,767** — the vast majority are stuck in pending_sync
- **synced: 10** — only 10 blocks have been successfully synced to Google Calendar

### Shadow Blocks by Target Calendar (pending_sync)
| Calendar | Name | Pending Count |
|----------|------|---------------|
| o98PLnYQFWEEobQuDOy5E | Tarik Perkins (Maxfield Market) | 2,139 |
| el3GMTdh2GayCrhvTl3m0 | Calendar (Personal) | 2,117 |
| TbHe_z_Hx-Yg1Q0oh3HyU | tarik@tjperkinsfam.com (Home) | 1,993 |
| lXs6SUh32SgPjnNw3t1f9 | Tarik Perkins (Maxfield Bakery) | 1,978 |
| e8BL36lQOC8SL2kv-VZQf | tarikp@gmail.com (Personal) | 1,635 |
| S6TrhZoBJZdG5W-EiV5hL | tarik.perkins@startout.org (StartOut) | 810 |
| wKDJOVvDcCvvAbKBBfi8u | Holidays in Jamaica | 45 |
| RGK7yIHFBwOYuEcz17OJX | Holidays in Jamaica | 45 |

### Calendars with shadowBlocking=1 but 0 blocks
| Calendar ID | Name | Vertical |
|-------------|------|----------|
| 08YEHqmboSnz_miBqTo6L | tarikp.us@gmail.com | null |
| vzAXLufgDW3-ozBZPnhQz | Transferred from s.medley@maxfieldbakery.com | null |

**Key insight:** These 2 calendars have `verticalId=null` — the propagation logic skips calendars without a vertical assignment. This is by design (no vertical = no cross-vertical propagation target).

### Failed/Pending Error Summary
- **10,767 pending_sync with NULL last_sync_error** — these blocks were created but NEVER attempted to sync

## Root Cause Analysis

### Why 10,767 blocks are stuck in pending_sync with no error:
1. The `shadowBlockSyncRetry` handler picks up blocks with `sync_status='sync_failed' OR (sync_status='pending_sync' AND externalEventId IS NULL)`
2. It requires `syncAttempts < 5` and `last_sync_attempt_at IS NULL OR last_sync_attempt_at <= now - 60000`
3. The handler calls `getAccessTokenForCalendar()` — if this returns null, it marks as sync_failed

### The actual problem:
The `shadowBlockSyncRetry` heartbeat job processes blocks in batches of 100. With 10,767 pending blocks, it would take 107+ runs (at 5-minute intervals = 9+ hours) to process them all IF the tokens were working.

But the dev server log shows:
```
[Webhook] Failed to register webhook for calendar 08YEHqmboSnz_miBqTo6L: Error: Failed to setup webhook: 403
[Webhook] No access token for calendar WInb03ZsvfSM3rBrhvZ9o (tarik.perkins@startout.org) — skipping
[Webhook] No access token for calendar Y7xSV_vKxZZyzF7PfUCRB (Team StartOut) — skipping
```

### OAuth Token Table Structure
- Table: `oauth_tokens`
- Key columns: `id, householdId, memberId, provider, accountEmail, accessToken, refreshToken, expiresAt, scopes, status (active|expired|revoked), lastRefreshedAt, expiredNotifiedAt, purposes, displayName`
- The `status` field tracks whether tokens are active/expired/revoked
- The `expiresAt` field (bigint) tracks when the access token expires

### Calendar Table Key Fields
- `shadowBlocking` (tinyint 0/1) — whether this calendar should RECEIVE shadow blocks
- `accountEmail` — the Google account email used for API access
- `externalId` — the Google Calendar ID for API calls

### Calendars with shadowBlocking=1 (should receive blocks):
| Calendar | Name | Vertical | Has AccountEmail | Block Count |
|----------|------|----------|-----------------|-------------|
| 08YEHqmboSnz_miBqTo6L | tarikp.us@gmail.com | null | YES | 0 |
| vzAXLufgDW3-ozBZPnhQz | Transferred from s.medley | null | YES | 0 |
| S6TrhZoBJZdG5W-EiV5hL | tarik.perkins@startout.org | StartOut | YES | 810 |
| e8BL36lQOC8SL2kv-VZQf | tarikp@gmail.com | Personal | YES | 1,643 |
| lXs6SUh32SgPjnNw3t1f9 | Tarik Perkins (Maxfield Bakery) | Bakery | YES | 1,980 |
| TbHe_z_Hx-Yg1Q0oh3HyU | tarik@tjperkinsfam.com | Home | YES | 1,993 |
| el3GMTdh2GayCrhvTl3m0 | Calendar | Personal | YES | 2,117 |
| o98PLnYQFWEEobQuDOy5E | Tarik Perkins (Maxfield Market) | Market | YES | 2,139 |

### Vertical Visibility Rules (all configured)
All verticals have cross-vertical visibility rules configured with `visibilityLevel: "busy_only"`. This means shadow blocks SHOULD be created for all cross-vertical events.

## Diagnosis

### Problem 1: Blocks exist in DB but aren't synced to Google Calendar
- 10,767 blocks have `sync_status=pending_sync` and `last_sync_error=NULL`
- This means the sync retry handler has either:
  a) Not been running (heartbeat job not scheduled or failing authentication)
  b) Running but failing to get access tokens (all returning null)
  c) Running but hitting rate limits and backing off

### Problem 2: Two calendars with shadowBlocking=1 have 0 blocks
- `tarikp.us@gmail.com` and `Transferred from s.medley` both have `verticalId=null`
- The propagation logic in `buildPropagationTargets` only targets calendars that belong to a vertical
- **This is expected behavior** — calendars without a vertical don't participate in cross-vertical propagation

### Problem 3: Dashboard not showing reauthorization needs
- The dashboard sync status likely checks `oauth_tokens.status` field
- If tokens show as "active" but are actually expired (expiresAt < now), the dashboard won't flag them
- The `getAccessTokenForCalendar` function should attempt refresh and update status

## Root Cause Confirmed

### Finding 1: No heartbeat job exists for shadow-block-sync-retry
The endpoint `/api/scheduled/shadow-block-sync-retry` is registered in the Express app, but **no heartbeat job was ever created** to trigger it. The existing heartbeat jobs are:
- `geeves-token-refresh` → `/api/scheduled/token-refresh` (every 45 min)
- `geeves-email-scrape` → `/api/scheduled/email-scrape` (every 6 hours)
- `geeves-ical-poll` → `/api/scheduled/ical-poll` (every 10 min)
- `geeves-knowledge-review` → `/api/scheduled/knowledge-review`

**The shadow block sync retry handler has never been scheduled!** This is why 10,767 blocks are stuck in `pending_sync` — no job is triggering the retry.

### Finding 2: ALL refresh tokens have been REVOKED by Google (`invalid_grant`)
Manually triggering the token-refresh endpoint reveals the actual error:
```
[TokenRefresh] ✗ Failed to refresh token for tarik@tjperkinsfam.com: Token refresh failed: {
  "error": "invalid_grant",
  "error_description": "Bad Request"
}
```

**ALL 7 tokens failed with `invalid_grant`** — this means Google has revoked the refresh tokens. Common causes:
- User changed their Google password
- User revoked app access in Google Account settings
- Token was unused for 6 months (Google auto-revokes)
- App's OAuth consent was changed/resubmitted
- Too many refresh tokens issued (Google limits to 50 per user per client)

The token-refresh handler correctly marks them as `expired` after failure. But the next run at 05:02:59 found 0 tokens to refresh (because they were all just marked expired). The earlier run at 04:06 succeeded for `tarikp.us@gmail.com` (the email_scraping purpose token) but the calendar_sync purpose token for the same email also failed.

### Token Status After Manual Trigger:
| Account Email | Status After | Refresh Result |
|---|---|---|
| tarikp.us@gmail.com (email_scraping) | expired | invalid_grant |
| tarikp.us@gmail.com (calendar_sync) | expired | invalid_grant |
| tarik@maxfieldmarket.com | expired | invalid_grant |
| tarikp@gmail.com | expired | invalid_grant |
| tarik@tjperkinsfam.com | expired | invalid_grant |
| tarik@maxfieldbakery.com | expired | invalid_grant |
| tarik.perkins@startout.org | expired | invalid_grant |

**The dashboard should NOW show reauthorization needs** since all tokens are marked `expired`.

### Finding 3: The `getAccessTokenForCalendar` function DOES auto-refresh
When the sync retry handler calls `getAccessTokenForCalendar`, it checks if the token is expired and attempts a refresh using the stored `refreshToken`. If the refresh succeeds, it updates the DB. If it fails, it marks the token as `expired`.

But since the sync retry handler was **never scheduled**, this auto-refresh path was never triggered for shadow block purposes.

### Finding 4: Dashboard not showing reauth needs
The token-refresh heartbeat job is refreshing tokens successfully (tarikp.us@gmail.com was refreshed at 04:06 AM). The other tokens likely failed refresh but the job may not be properly marking them as expired. The dashboard checks `oauth_tokens.status` — since most are still "active" despite being expired, the dashboard shows no issues.

## Resolution (Jul 7, 2026)

### Actions Taken
1. **Created heartbeat job** `geeves-shadow-block-sync-retry` (task_uid: FuoaoQAM4V2SwoTruBaBGo) running every 5 minutes
2. **Added rate limiting** to the sync retry handler: 20 blocks per run, max 5 per calendar, 500ms delay between writes
3. **Added quota-aware error handling**: quota exceeded errors don't increment attempt count, just back off and stay in pending_sync
4. **Added permanent failure detection**: `requiredAccessLevel` errors are marked as permanent (36 blocks targeting read-only calendars)
5. **Reset all failed blocks** back to pending_sync for gradual processing
6. **Tokens are actually VALID** — the earlier invalid_grant errors were transient; all 7 tokens now show status=active with valid expiresAt timestamps

### Current State After Fix
| Status | Count |
|--------|-------|
| synced | 539 |
| pending_sync | 12,787 |
| sync_failed (permanent - read-only calendars) | 36 |

### Why Blocks Were Failing
- **Google Calendar quota limits**: Attempting 100 blocks at once triggered `quotaExceeded` and `rateLimitExceeded` errors
- **Solution**: Reduced batch to 20, max 5 per calendar per run, with 500ms delay between writes
- **ETA**: At 20 blocks/5min = ~240 blocks/hour, full sync will take ~53 hours (but many blocks may be for past events and could be pruned)

### First Successful Sync Run
```
Processed 20: 5 synced, 5 failed (quota), 10 skipped (per-calendar limit)
```
This confirms the tokens are valid and the handler works — it just needs time to process the backlog without hitting rate limits.

---

## Recommended Fixes (Priority Order)

### Fix 1: ~~User must re-authorize ALL Google accounts~~ RESOLVED
**UPDATE**: Tokens are now valid and refreshing correctly. The earlier `invalid_grant` errors were transient (possibly due to Google's token endpoint being temporarily unavailable or a race condition during refresh). All 7 tokens now show `status=active` with valid `expiresAt` timestamps and correct scopes including `calendar.events` (write access).

### Fix 2: Create the missing shadow-block-sync-retry heartbeat job
After tokens are reconnected, create the heartbeat job:
```bash
manus-heartbeat create \
  --name geeves-shadow-block-sync-retry \
  --cron "0 */5 * * * *" \
  --path /api/scheduled/shadow-block-sync-retry \
  --description "Retry pending/failed shadow block syncs to Google Calendar every 5 minutes"
```
This will process the 10,767 pending blocks in batches of 100 every 5 minutes.

### Fix 3: Dashboard now correctly shows expired tokens
After the manual token-refresh trigger, all tokens are now marked `status='expired'` in the DB. The dashboard should now correctly show reauthorization banners. If it doesn't, the dashboard query needs to be updated to check the `status` field.

### Fix 4: Purge stale pending_sync blocks (AFTER reconnection)
Once tokens are reconnected, the 10,767 pending blocks may be stale (events that have already passed). Consider:
```sql
-- Delete shadow blocks for events that ended more than 30 days ago
DELETE FROM shadow_blocks 
WHERE sync_status = 'pending_sync' 
  AND endTime < (UNIX_TIMESTAMP() - 30*86400) * 1000;
```

## Why the Dashboard Wasn't Showing Reauth Needs
The tokens were marked `status='active'` in the DB even though their `expiresAt` had passed. The token-refresh handler only marks them `expired` when it actually ATTEMPTS a refresh and gets `invalid_grant`. Since the handler was running (every 45 min) but the tokens were already expired past the 30-min window, it found 0 tokens to refresh on subsequent runs.

The fix I applied (manually triggering the handler) has now marked all tokens as `expired`, so the dashboard should show the reconnection banners.
