# Shadow Block Time Mismatch Bug — Findings

## Symptom
- "Busy" block on tarik@maxfieldbakery.com shows 1:00–1:30 PM EDT
- Source event "Allison // Tarik 1:1" on StartOut calendar is actually 11:45 AM–12:15 PM EDT
- All 6 shadow blocks for this event have the WRONG time (+75 min offset)

## Root Cause
1. Event was originally at 1:00 PM when the backfill first processed it (first run before sandbox reset)
2. Event was rescheduled to 11:45 AM afterward
3. Webhook sync updated the event in the DB correctly
4. BUT the re-propagation (onEventUpserted) was blocked by the per-calendar rate limit
5. The stale shadow blocks from the first backfill remained with the old 1:00 PM time
6. The second backfill skipped this event because it already HAS shadow blocks (NOT EXISTS check)

## Fix Applied
- `skipRateLimit: true` option added to `onEventUpserted` — used by backfill handler
- This prevents future rate-limit-induced stale blocks during backfill

## Remaining Issue — Webhook-triggered re-propagation still subject to rate limit
- When a webhook sync updates an event, it calls `onEventUpserted(id, householdId)` WITHOUT skipRateLimit
- If the rate limit is tripped (from a burst), the re-propagation is skipped
- BUT `deleteExistingBlockers()` runs BEFORE the per-target loop, so old blocks ARE deleted
- This means the event ends up with NO shadow blocks (not stale ones)
- The stale blocks in this case came from the FIRST backfill run writing with old data

## Action Items
1. ✅ Revert PER_CALENDAR_HOURLY_CAP to 500 and CIRCUIT_BREAKER_10MIN_CAP to 500
2. ✅ Keep skipRateLimit option in onEventUpserted for backfill use
3. Need to re-propagate the specific stale event: 0ba2395e-22d5-4944-a6a4-f22a7911a34a
4. Consider: should webhook-triggered re-propagation also bypass rate limit? (risky — could cause runaway writes)

## Key IDs
- Source event: 0ba2395e-22d5-4944-a6a4-f22a7911a34a
- Source calendar (StartOut): S6TrhZoBJZdG5W-EiV5hL
- Bakery calendar: lXs6SUh32SgPjnNw3t1f9
- All target calendars: e8BL36lQOC8SL2kv-VZQf, el3GMTdh2GayCrhvTl3m0, lXs6SUh32SgPjnNw3t1f9, o98PLnYQFWEEobQuDOy5E, RGK7yIHFBwOYuEcz17OJX, wKDJOVvDcCvvAbKBBfi8u
