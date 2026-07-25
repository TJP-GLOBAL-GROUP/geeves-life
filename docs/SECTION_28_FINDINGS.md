# Section 28: Shadow Block Sync & Account Health Investigation

## Date: Jul 7, 2026

## Bug 1: Shadow blocks marked "synced" but not appearing on Google Calendars

### Root Cause
ALL Google OAuth refresh tokens have been revoked (`invalid_grant`). This means:
- The 1,263 "synced" blocks WERE genuinely created on Google Calendars (the handler only marks synced after Google returns 200 + event ID)
- The events should still exist on the calendars — we just can't verify because we can't authenticate
- The tokens became invalid sometime between the last successful sync and now

### Affected Accounts (ALL expired)
- tarik.perkins@startout.org
- tarik@maxfieldbakery.com
- tarik@maxfieldmarket.com
- tarik@tjperkinsfam.com
- tarikp.us@gmail.com (2 tokens)
- tarikp@gmail.com (1 expired with refresh, 1 "active" but belongs to pending_22740479 member with no refresh token)
- eniola@tjperkinsfam.com

### Resolution
- All tokens correctly marked as "expired" in DB
- User must reconnect all accounts via Settings → Accounts → Reconnect All
- Once reconnected, the 15,052 pending_sync blocks will resume syncing

## Bug 2: Dashboard not showing disconnected/expired accounts

### Root Cause
The tokens were incorrectly still marked "active" in the DB even though their refresh tokens had been revoked. The `getAccessTokenForCalendar()` function marks tokens expired when refresh fails, but the sync handler was the only code path that triggered this — and it was being blocked by the circuit breaker.

### Fix Applied
1. Ran `check-all-tokens.mjs` script which attempted to refresh all tokens, confirmed all are `invalid_grant`, and marked them as "expired" in the DB
2. The existing `useExpiredAccountCount()` hook + expired account banner on the dashboard will now correctly show the warning

## Additional Fixes Applied

### Sync Handler Improvements
1. **Early exit when all tokens expired**: Handler now checks if ALL Google tokens are expired before processing blocks — avoids wasting cycles
2. **No-token case doesn't increment syncAttempts**: When a block can't sync because the token is expired, it stays as `pending_sync` with unchanged attempts (token expiry is not the block's fault)
3. **401/UNAUTHENTICATED errors don't increment attempts**: Same principle — keeps blocks retryable once tokens are reconnected
4. **Reset 2,427 blocks**: Blocks that were incorrectly marked `sync_failed` due to token issues were reset to `pending_sync` with 0 attempts

### syncHealth Procedure Enhancement
- Added `expiredTokens` and `allTokensExpired` fields to the response
- Added new `'blocked'` status when all tokens are expired and there are pending blocks
- UI shows red dot + "⏸" + "Sync Blocked" message with explanation

### Current DB State
- synced: 1,263
- pending_sync: 15,052 (will resume once tokens reconnected)
- sync_failed: 110 (genuine permanent failures)

## Action Required from User
1. Go to Settings → Accounts (or click "Fix Now" on the dashboard banner)
2. Click "Reconnect All" to re-authorize all Google accounts
3. Once reconnected, shadow block sync will automatically resume
