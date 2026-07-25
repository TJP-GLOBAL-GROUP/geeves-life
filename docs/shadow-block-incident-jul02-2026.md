# Shadow Block Incident — Jul 02 2026

## Summary
22,009 shadow blocks existed for StartOut vertical. 14,014 were orphaned (targeting Bohemian Lodges iCal read-only feeds). Deleted. 28,593 total blocks remain (was 42,607).

## Root Cause
StartOut had visibility rules pointing to 5 destination verticals. Bohemian Lodges had 5 iCal calendars with `shadowBlocking=1` (read-only feeds — should have been 0). This gave 12 shadow blocks per StartOut event instead of 7.

Expected per-event count after fix: 7 (Bohemian Lodges non-iCal + Home & Family 3 + Personal 2 + Bakery 1 + Market 1).

## Fixes Applied
1. Set `shadowBlocking=false` on all 6 Bohemian Lodges iCal calendars (UPDATE calendars)
2. Deleted 14,014 shadow blocks targeting those calendars (DELETE shadow_blocks)
3. New per-event distribution peaks at 6-7 blocks (was 9-12)

## Safeguards to Implement
- Write-cap: >100 writes in a single batch → notify owner + abort
- Rate limiter: >50 writes to single calendar per hour → pause + notify
- Circuit breaker: >500 new rows in 10 min → halt all propagation
- Idempotency lock: in-memory Set<eventId> to prevent concurrent onEventUpserted
- iCal calendar default: shadowBlocking=false on creation
- Audit log: every batch write logged to audit_log table

## eventPropagation.ts Structure (for safeguard implementation)
- Lines 65-237: onEventUpserted — main entry point
- Lines 104-112: buildPropagationTargets call — this is where target count is known
- Lines 114-115: deleteExistingBlockers — runs before re-write
- Lines 132-198: per-target loop — writes DB rows
- Lines 200-226: batch insert to shadow_blocks table
- Lines 307-450: buildPropagationTargets — returns PropagationTarget[]

## Safeguard Implementation Plan
Add to top of eventPropagation.ts:
```ts
const PROPAGATION_WRITE_CAP = 100; // max shadow blocks per single onEventUpserted call
const propagationLock = new Set<string>(); // idempotency lock
const calendarWriteCounter = new Map<string, { count: number; resetAt: number }>(); // per-calendar hourly counter
let totalWritesLast10Min = 0;
let writesWindowStart = Date.now();
```

In onEventUpserted, after buildPropagationTargets:
- If targets.length > PROPAGATION_WRITE_CAP → notifyOwner + return (abort)
- Check propagationLock — if eventId in lock, skip (concurrent call)
- Add eventId to lock, remove in finally

In batch write loop:
- Increment calendarWriteCounter for each targetCalendarId
- If counter > 50/hour → notifyOwner + break
- Increment totalWritesLast10Min
- If totalWritesLast10Min > 500 → notifyOwner + throw (circuit breaker)
