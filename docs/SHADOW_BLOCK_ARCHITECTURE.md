# Shadow Block Architecture — Source/Target Model

**Last updated:** July 06, 2026  
**Bug fixes covered:** P-09 through P-16, P-52 through P-54  
**Status:** Production — all fixes deployed, propagation retry queue active, sync status tracking live

---

## Overview

Shadow blocks are the mechanism by which Geeves shows "Busy" time across calendars in different life verticals. When you have a meeting on your personal Gmail calendar, a "Busy" block appears on your work calendar so colleagues can see you are unavailable — without seeing the event details.

This document defines the **source/target model** introduced in P-15 and the rules governing which calendars generate and receive shadow blocks.

---

## The Two-Axis Model

Every calendar in Geeves has two independent shadow block flags:

| Flag | Column | Default | Meaning |
|---|---|---|---|
| **Shadow Source** | `shadowSource` (boolean) | `true` | This calendar **generates** Busy blocks on other calendars when events are created on it |
| **Shadow Target** | `shadowBlocking` (boolean) | `true` | This calendar **receives** Busy blocks from other calendars |

These flags are independent. A calendar can be:

| shadowSource | shadowBlocking | Behaviour | Example |
|---|---|---|---|
| `true` | `true` | **Personal** — generates and receives blocks | `tarik.perkins@startout.org` |
| `false` | `false` | **Isolated** — neither generates nor receives blocks | `Team StartOut`, `Family` (shared) |
| `true` | `false` | **Broadcast-only** — generates blocks but doesn't receive them | Rare; use for one-way notification calendars |
| `false` | `true` | **Receive-only** — receives blocks but doesn't generate them | Rare; use for read-only monitoring calendars |

---

## StartOut Vertical — Canonical Example

The StartOut vertical contains two sub-calendars that must operate independently:

```
StartOut Vertical
├── tarik.perkins@startout.org  shadowSource=true  shadowBlocking=true  (Personal work)
└── Team StartOut               shadowSource=false shadowBlocking=false (Shared team)
```

**What this means in practice:**

- When Tarik creates a meeting on `tarik.perkins@startout.org`, Busy blocks appear on his other calendars (Bakery, Market, Personal Gmail). ✅
- When someone creates an event on `Team StartOut`, **no Busy blocks are generated anywhere**. ✅
- `Team StartOut` never receives Busy blocks from any other calendar. ✅
- Tarik can create a meeting with Jake at 3:30 PM on `Team StartOut` without any interference from Geeves. ✅

---

## Propagation Engine Rules (Priority Order)

The propagation engine in `server/services/eventPropagation.ts` applies these rules in order:

1. **shadowSource guard** — if the source calendar has `shadowSource=false`, skip entirely. No blocks are generated.
2. **isShadowBlock guard** — if the event itself is a shadow block (written by a previous propagation), skip to prevent infinite loops.
3. **cancelled guard** — if the event is cancelled, delegate to `onEventDeleted`.
4. **Rule A — Same-vertical siblings** — propagate to all calendars in the same vertical, subject to `shadowBlocking` check on each target.
5. **Rule B — Cross-vertical visibility rules** — propagate to verticals with `visibilityLevel = "busy_only"` or `"full"` in `vertical_visibility` table.
6. **Rule C — Default-busy fallback** — if no visibility rules exist for the source vertical, propagate "Busy" to all other verticals (subject to `shadowBlocking` on each target).
7. **Self-loop prevention** — a calendar never targets itself (`c.id !== srcCal.id` in Rule A).

---

## Bug History

| ID | Title | Root Cause | Fix | Status |
|---|---|---|---|---|
| P-09 | Gmail read scope missing | `gmail.readonly` not in `GOOGLE_SCOPES` | Added scope to `providers.ts`; "Needs Reconnect" badge in Settings | ✅ Fixed |
| P-10 | MySQL boolean mismatch | `=== false` fails against MySQL `0` integer | All `shadowBlocking` guards changed to falsy checks (`!val`, `!!val`) | ✅ Fixed |
| P-11 | Token disambiguation | `accountEmail` used as key on non-unique field | All remove/update operations now accept `tokenId` (UUID) | ✅ Fixed |
| P-12 | Rule 1 missing guard | Same-vertical loop had no `shadowBlocking` check | `if (!(tgt as any).shadowBlocking) continue` added to Rule 1 | ✅ Fixed |
| P-13 | Team StartOut pollution | Rules 1–4 all wrote to opted-out calendar | 2,104 erroneous events deleted; calendar confirmed clean | ✅ Fixed |
| P-14 | Family calendar as source | `shadowSource` concept did not exist; Family generated blocks | Introduced `shadowSource` column; Family set to `shadowSource=false` | ✅ Fixed |
| P-15 | StartOut sub-calendar isolation | No `shadowSource` guard; Team StartOut generated 1,504 blocks on personal calendar | `shadowSource` guard added to propagation engine; 70,447 erroneous rows deleted; backfill from Jan 1 2025 triggered; 18 stress tests added | ✅ Fixed |

---

## Onboarding UX — Calendar Connect Flow

When connecting a new calendar, the user is shown a **Shadow Blocking** configuration step (Step 3 of 4 in `ConnectCalendarDialog.tsx`) that explains:

**Calendar Type options:**

| Option | shadowSource | shadowBlocking | When to use |
|---|---|---|---|
| **Personal** | ✅ On | ✅ On | Your own calendar — events generate Busy blocks on your other calendars, and you receive Busy blocks from them |
| **Shared / Team** | ❌ Off | ❌ Off | A calendar shared with others — events should not generate Busy blocks, and the calendar should not receive them |
| **Custom** | User-defined | User-defined | Advanced: configure source and target independently |

Each option shows a popover with a plain-English example and a confirmation step before connecting.

---

## Settings UX — Calendar Row

In **Settings → Calendars**, each calendar row shows a shield icon indicating its current mode:

| Icon | Colour | Meaning |
|---|---|---|
| Shield (filled) | Green | Personal — generates and receives Busy blocks |
| Shield (half) | Amber | Partial — one direction only |
| Shield (off) | Grey | Isolated — no shadow blocking in either direction |

Clicking the shield opens a popover with independent On/Off toggles for "Generates Busy blocks" and "Receives Busy blocks", plus a plain-English summary.

---

## Stress Test Suite

File: `server/startout-shadow-block.test.ts`

| Test | Scenario | Result |
|---|---|---|
| T-01 | Personal calendar event propagates to cross-vertical targets | ✅ Pass |
| T-02 | Team StartOut event generates zero shadow blocks | ✅ Pass |
| T-03 | Opted-out target calendar never receives shadow blocks | ✅ Pass |
| T-04 | Self-loop prevention | ✅ Pass |
| T-05 | Delete propagation removes all shadow blocks | ✅ Pass |
| T-06 | shadowSource toggle stops/resumes propagation | ✅ Pass |
| T-07 | shadowBlocking toggle removes target from propagation | ✅ Pass |
| T-08 | Idempotency — no duplicate shadow blocks on re-propagation | ✅ Pass |
| T-09 | Multi-vertical isolation | ✅ Pass |
| T-10 | Event creation on opted-out calendar succeeds and persists | ✅ Pass |
| T-11 | calendar.update correctly persists shadowSource field | ✅ Pass |

---

## Dead Code Warning

`server/db.ts` contains a deprecated `propagateShadowBlocks()` function. It has been patched with a `shadowBlocking` guard and marked `@deprecated`. **Do not call this function.** Use `onEventUpserted()` from `server/services/eventPropagation.ts` instead.

---

## Propagation Retry Queue (Jul 02 2026)

When `onEventUpserted` is blocked by the circuit breaker or per-calendar rate limiter, the event is automatically enqueued in the `propagation_queue` table for later retry. This prevents stale shadow blocks when event updates (e.g. reschedules) arrive during high-load periods.

| Component | Location | Purpose |
|---|---|---|
| `propagation_queue` table | `drizzle/schema.ts` | Stores pending retries with reason, attempts, backoff schedule |
| `enqueuePropagationRetry()` | `server/services/eventPropagation.ts` | Enqueues on circuit breaker or rate limit block (deduplicates by eventId) |
| `propagationRetryHandler` | `server/scheduledHandlers/propagationRetry.ts` | Drains queue every 2 min, retries with `skipRateLimit: true` |
| Endpoint | `POST /api/scheduled/propagation-retry` | Heartbeat cron target (2-min interval) |

**Backoff schedule:** 1min → 4min → 9min → 16min → 25min (exponential). Max 5 attempts before marking as `failed`.

---

## Admin Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/internal/shadow-block-backfill` | `x-cron-secret` header | Re-propagates all events with 0 SBs in a date window. Uses `skipRateLimit + skipGoogleWrite`. Sequential processing. |
| `POST /api/internal/repropagate-event` | `x-cron-secret` header | Force re-propagate a single event by `eventId`. Deletes stale SBs and re-creates with current times. |
| `POST /api/internal/reset-circuit-breaker` | `x-cron-secret` header | Resets the in-memory circuit breaker counter. |

---

## Property Manager Filtering (P-52)

When a member has `allowedCalendarIds` set in `vertical_member_access`, the properties router filters results to only show properties whose `calendarId` is in the allowed list. This applies to:
- `properties.list` — filters the property list
- `properties.getUpcomingEvents` — filters upcoming check-ins
- `properties.getRevenueSummary` — filters revenue data

Members with an empty `allowedCalendarIds` array see all properties in their assigned verticals.

---

## Meeting Request Flow (P-54)

| Component | Purpose |
|---|---|
| `canRequestMeetings` check in `bookingRequests.create` | Enforces that only members with `canRequestMeetings=true` in their vertical access can submit requests |
| `accessControl.getMyAccessibleVerticals` | Returns only verticals the caller can request time on (filters BookingRequestDialog dropdown) |
| `BookingRequestDialog` in CalendarView | Uses filtered vertical list instead of full `verticals.list` |

---

## Sync Status Lifecycle (P-16 — Jul 06 2026)

Shadow blocks now track whether they have been successfully written to the target Google Calendar. A shadow block that only exists in the database is **not** a functional shadow block — the user cannot see it on their Google Calendar.

### Status Enum

| Status | Meaning | Next Transition |
|---|---|---|
| `pending_sync` | DB row created; Google write not yet attempted or not yet confirmed | → `synced` (on success) or → `sync_failed` (on error) |
| `synced` | Google Calendar event created successfully; `externalEventId` populated | Terminal (unless event is updated/deleted) |
| `sync_failed` | Google write attempted but failed (token expired, API error, rate limit, NULL accountEmail) | → `pending_sync` (on retry) → `synced` (on success) |

### Tracking Columns

| Column | Type | Purpose |
|---|---|---|
| `syncStatus` | enum(`pending_sync`, `synced`, `sync_failed`) | Current sync state |
| `syncAttempts` | int (default 0) | Number of Google write attempts |
| `lastSyncError` | text (nullable) | Last error message from failed write |
| `lastSyncAttemptAt` | bigint (nullable) | Unix ms timestamp of last attempt |
| `externalEventId` | varchar (nullable) | Google Calendar event ID once synced |

### Retry Job

| Component | Location | Purpose |
|---|---|---|
| `shadowBlockSyncRetry.ts` | `server/scheduledHandlers/` | Processes `pending_sync` and `sync_failed` blocks |
| Batch size | 50 blocks per run | Prevents Google API rate limit exhaustion |
| Interval | Every 2 minutes | Via heartbeat cron |
| Endpoint | `POST /api/scheduled/shadow-block-sync-retry` | Heartbeat target |

**Retry logic:**
1. Fetch up to 50 blocks with `syncStatus IN ('pending_sync', 'sync_failed')` ordered by `lastSyncAttemptAt ASC` (oldest first)
2. For each block, resolve the target calendar’s OAuth token via `accountEmail`
3. If token is valid, attempt Google Calendar event insert/update
4. On success: set `syncStatus = 'synced'`, populate `externalEventId`
5. On failure: set `syncStatus = 'sync_failed'`, increment `syncAttempts`, record error in `lastSyncError`

### P-16 Guard: NULL accountEmail

Calendars with `accountEmail = NULL` are skipped in all 3 propagation target paths (Rule A same-vertical, Rule B cross-vertical, Rule C default-busy). This prevents the sync retry job from endlessly failing on calendars that have no OAuth token to write with.

### Dashboard Health Indicator

The Home dashboard shows a sync health banner:

| Colour | Condition | Message |
|---|---|---|
| Green | All blocks synced (0 pending, 0 failed) | "All shadow blocks synced" |
| Amber | Some pending but 0 failed | "{N} blocks pending sync" |
| Red | Any failed blocks | "{N} blocks failed to sync — check token status" |

Query: `dashboard.shadowBlockSyncHealth` in `server/routers.ts`.

### Cardinal Rule

> A shadow block that only exists in the database is not a shadow block. It is a database row. The user’s calendar is the source of truth for whether time is actually blocked.
