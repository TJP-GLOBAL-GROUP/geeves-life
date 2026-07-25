# Engineering Lessons — Geeves.Life

**Last updated:** 2026-07-01  
**Status:** Living document — updated after every significant bug fix  
**Maintained by:** Every engineer working on this codebase  
**Purpose:** Institutional memory. Every pattern here was discovered the hard way. Before closing any bug fix, assess the root cause against each pattern in this document and ask: *does this fix reveal a new pattern, or is it another instance of one we already know?*

---

## How to Use This Document

When you fix a bug, do the following before marking the ticket closed:

1. Read through the 16 patterns below.
2. Ask: **which pattern(s) does this bug belong to?**
3. If it matches an existing pattern, add it to that pattern's "Known Instances" table.
4. If it does not match any pattern, consider whether a new pattern should be added.
5. If a new pattern is warranted, add it at the bottom of this document following the same structure.

This is not bureaucracy. It is the difference between fixing the same class of bug once versus fixing it ten times.

---

## Pattern Index

| # | Pattern Name | One-Line Summary | Times Hit |
|---|---|---|---|
| P-01 | Incomplete CRUD | New entities are built with Create + Read but without Update, Delete, Archive, or cascade cleanup | 6+ |
| P-02 | Sequential Process Failure Handling | Multi-step flows assume success at every step; no recovery path for mid-sequence failures | 3+ |
| P-03 | UTC / Timezone Boundary Shift | Timestamps stored as UTC midnight are displayed using local timezone methods, shifting dates by ±1 day | 5+ |
| P-04 | Propagation Without Guard | Write operations trigger propagation; propagation itself triggers more writes, creating infinite loops or duplicates | 4+ |
| P-05 | Component Lifecycle vs. Browser Navigation | State held in a React component is lost when the browser navigates away; logic that must survive navigation is placed inside the component instead of at the page level | 2+ |
| P-06 | Implicit Data Ownership Assumption | A resource is created under one owner/household; later code assumes a different owner, causing silent data isolation failures | 3+ |
| P-07 | Missing Loading / Error / Empty State | A UI component renders correctly when data is present but crashes, shows stale content, or loops when data is loading, absent, or errored | 4+ |
| P-08 | External API Contract Surprise | An external API returns data in an undocumented or unexpected format; the code assumes a format that is never validated | 3+ |
| P-09 | Scope/Permission Dependency Not Verified | A feature is marked complete based on service code existing; the required OAuth scope was never added to the initiate handler and was never granted on any live token | 1 |
| P-10 | MySQL TINYINT(1) Boolean Strict-Equality Mismatch | MySQL stores `boolean` columns as `TINYINT(1)`; the mysql2 driver returns JS `number` (0 or 1), not `boolean`. Strict equality (`=== false`, `=== true`) silently fails, causing guards to be bypassed or logic to be skipped | 4 |
| P-11 | Token Disambiguation by Non-Unique Field | Multiple OAuth tokens can exist for the same `accountEmail` (reconnects, duplicate connects). Procedures that identify a token by `accountEmail` alone silently operate on the wrong row — revoking the wrong token, updating the wrong purposes, or enriching with the wrong credentials | 3 |
| P-12 | Guard Applied to Some Code Paths But Not All | A safety guard (e.g. `shadowBlocking`, permission check, rate limit) is added to the cross-vertical propagation paths but the same-vertical sibling path is overlooked. The guard is present and correct where it was originally written, but the feature has multiple entry points and only some are protected | 1 |
| P-13 | External Write Bugs Require Batched Remediation | A bug causes mass erroneous writes to an external API; the cleanup script uses serial deletes (one HTTP call per record), taking 30–60+ minutes for thousands of records instead of using the API's batch endpoint for 50x throughput | 1 |
| P-14 | Shared Credential Blast Radius | One OAuth account is assigned to multiple platforms; a single token failure silently blocks all of them | 1 |
| P-15 | Trust-First Scope Consent | OAuth scopes are requested without explaining to the user what is accessed, why, or what is lost if denied — eroding trust and triggering unexpected security alerts | 2 |
| P-16 | Best-Effort External Write Treated as Success | An external API write (Google Calendar, Stripe, etc.) fails silently; the system marks the operation as "complete" because the local DB write succeeded, leaving the external system permanently out of sync | 1 |
| P-17 | MySQL ONLY_FULL_GROUP_BY Silent Query Failure | A query with GROUP BY + LEFT JOIN to a multi-row table fails silently in MySQL strict mode; the tRPC procedure catches the error and returns empty results, making the UI show 0 items | 1 |

---

## P-01 — Incomplete CRUD

### Description

When a new entity (member, event, property, booking, rule, resource) is introduced into the system, the initial implementation covers Create and Read — the happy path. Update, Delete, Archive, and cascade cleanup are deferred as "we'll add that later." They are then discovered missing weeks later when a user tries to remove something, or when orphaned rows cause data integrity problems.

This is not laziness. It is a scoping failure — the full lifecycle of the entity is not contemplated at design time.

### Root Cause

The developer thinks about the entity from the perspective of "what do I need to build this feature?" rather than "what is the full lifecycle of this object in the system?" The result is a half-built entity that accumulates orphaned rows, dead UI states, and missing admin controls.

### Known Instances

| Commit | Entity | What Was Missing | Impact |
|---|---|---|---|
| `a700843` | Shadow blocks (events) | Delete path: deleting an event on a target calendar triggered new propagation instead of cleanup | Infinite propagation loop, 107+ duplicate rows in DB |
| `7e95357` | Shadow blocks | Deduplication: no UNIQUE constraint on `(sourceEventId, targetCalendarId)` | Race condition created hundreds of duplicate shadow block rows |
| `fbd6eb3` | Calendars | Delete button missing from CalendarRow in Settings UI | Users could not remove calendars they no longer needed |
| `ccdc50a` | Cross-vertical rules | List + Delete procedures missing; only Create existed | Rules could be created but never removed |
| `1a98020` | Cross-vertical rules | Full CRUD wired: `listAllVisibility`, `deleteVisibility` added | Resolved the above gap |
| `f392f70` | Recurring events | Delete scope (this / following / all) and edit scope missing | Users could not manage recurring event series |
| `d6fd4b3` | Member CRUD (general) | `household.removeMember`, `household.leaveHousehold` procedures not yet built | Members can be invited but cannot be removed; orphaned rows accumulate across `vertical_member_access`, `constellation_members`, `calendar` access, `shadow_blocks` |
| *(live)* | Property delete | `deleteProperty` in `server/db.ts:1392` only deletes the `properties` row — 6 dependent tables (`property_platforms`, `property_prep_rules`, `property_bookings`, `email_scrape_jobs`, `property_email_tokens`, `devices`) are left as orphans | See audit C-01 in `docs/PROACTIVE_AUDIT_2026_06_27.md` |
| *(live)* | `deleteHouseholdMember` | Sets `status='removed'` only — does not cascade to `vertical_member_access`, `oauth_tokens`, `shadow_blocks`, `booking_requests`, `vertical_owners`, `constellation_members` | See audit C-02 |
| *(live)* | Vertical soft-delete | `verticals.delete` sets `isActive=false` only — linked calendars retain `verticalId`, shadow block propagation continues from a "deleted" vertical | See audit H-03 |
| *(live)* | Booking request approval | Creates local event row but does not call `onEventUpserted` or `createGoogleEvent` — approved event is invisible in Google Calendar and generates no shadow blocks | See audit H-04 |
| `C-01 Jul 1 2026` | Property delete | `deleteProperty` only deleted the `properties` row — 6 dependent tables left as orphans | Added full cascade in `server/db.ts:deleteProperty` |
| `C-02 Jul 1 2026` | `deleteHouseholdMember` | Sets `status='removed'` only — did not cascade to `vertical_member_access`, `oauth_tokens`, `shadow_blocks`, `booking_requests`, `vertical_owners`, `constellation_members` | Added cascade cleanup in `server/db.ts:deleteHouseholdMember` |
| `H-03 Jul 1 2026` | Vertical soft-delete | `verticals.delete` set `isActive=false` only — linked calendars retained `verticalId`, shadow block propagation continued from a deleted vertical | Added `deleteVerticalCascade` in `server/db.ts`; router updated to call it |

### Prevention Checklist

Before shipping any new entity, verify all of the following are implemented or explicitly deferred with a tracked todo item:

- [ ] **Create** — the happy-path write path
- [ ] **Read (list)** — paginated or filtered list view
- [ ] **Read (single)** — detail view or lookup by ID
- [ ] **Update** — edit form or inline edit
- [ ] **Delete (soft)** — deactivated/archived state, not immediately destroyed
- [ ] **Delete (hard)** — permanent removal with confirmation phrase
- [ ] **Cascade cleanup** — what other tables reference this entity's ID? Are those rows cleaned up or orphaned?
- [ ] **Ownership guard** — does every mutation assert that the caller owns this resource?
- [ ] **Admin override** — can a `system_admin` manage this entity across households?

> **Rule:** If you cannot answer all nine questions above at design time, the entity is not ready to be built. Write the answers into the design doc first.

---

## P-02 — Sequential Process Failure Handling

### Description

A multi-step flow is designed assuming every step succeeds. When a step fails mid-sequence — due to a network error, an external service rejection, a user abandoning the flow, or a browser navigation — the system is left in an ambiguous intermediate state with no recovery path.

The user sees a spinner that never resolves, a modal that reopens incorrectly, or a process that must be restarted from scratch with no indication of what was already completed.

### Root Cause

The developer designs the happy path first and defers error handling. For flows involving full-page redirects (OAuth, payment gateways, external verification), the problem is compounded because React component state is destroyed on navigation — any recovery logic placed inside the component never runs.

### Known Instances

| Commit | Flow | Failure Mode | Fix Applied |
|---|---|---|---|
| `e4b3d63` | OAuth reconnect sequence (N accounts) | Sequence advancement logic was inside `ReconnectSequenceModal`. When OAuth redirected away, the modal was unmounted. On return, the modal re-mounted with stale state (amber, stuck). | Moved all URL param detection and state advancement to `useReconnectSequenceResume` hook at the **page level**. Modal only reads state; it never advances it. |
| `001baaca` | OAuth reconnect sequence (dismiss) | Dismissing a 2-account sequence mid-way left sessionStorage intact. On next page load, the stale sequence auto-restored, reopening the modal unexpectedly. | `clearSequence()` called on dismiss. Auto-restore only fires when the current account status is `in_progress` (mid-redirect). |
| `85065af` | Shopping agent session lifecycle | Sessions auto-advanced to "shopping in progress" without credential validation. No cancel path existed for non-terminal states. | Explicit lifecycle states added: `pending_credentials → ready → shopping → awaiting_review`. Cancel wired to all active states. |
| `f92f2a7` | Shopping agent cancel | Cancel button only available on `ready` and `awaiting_review` states. Sessions stuck in `shopping` or `pending_credentials` could not be cancelled. | Cancel button added to all non-terminal states. |
| `DB-03 Jul 1 2026` | Email scrape jobs | 14 jobs stuck in `running` state since Jun 30 — server restart after a mid-scrape deploy left jobs with no `completedAt`. No recovery path existed. | Reset stuck jobs to `failed`; added pre-scrape stale-job sweep in `emailScrapeHandler` that marks any job `running` for > 15 min as `failed` before starting a new run. |
| `P-36 Jul 1 2026` | OAuth token cleanup on feature removal | P-35 removed `autoSyncPersonalCalendars` from the login callback, but the stale revoked token rows it had written for `eniola@tjperkinsfam.com` persisted in the DB. The integrations page showed a duplicate amber “Needs Attention” warning for an account that was already active. Root cause: feature removal cleaned the code path but not the DB artefacts it had created. | (1) Deleted stale rows manually (DB-06); (2) Added deduplication guard in `getAllOAuthTokens` — suppresses revoked/expired rows when an active row exists for the same email; (3) Added cleanup in `upsertOAuthToken` — deletes orphan revoked/expired rows before insert and any extra stale rows after update. |

### Prevention Checklist

Before shipping any multi-step flow:

- [ ] **Map every state explicitly** — draw the state machine. Every node must have at least one exit path.
- [ ] **Define the failure state for each step** — what does the user see if step N fails?
- [ ] **Persist sequence state outside the component** — use `sessionStorage` (survives redirects), `localStorage` (survives tab close), or the database (survives device change). Never rely on React `useState` for state that must survive navigation.
- [ ] **Idempotent resume** — if the user returns to the flow after abandonment, can they resume without duplicating work?
- [ ] **Explicit cancel path** — every in-progress state must have a way to abort cleanly.
- [ ] **Timeout / expiry** — what happens if the user never completes the flow? Does the partial state clean itself up?

> **Rule:** If a flow involves a full-page redirect (OAuth, payment, external link), the advancement logic **must** live at the page level, not inside the modal or dialog. See `docs/patterns/OAUTH_REDIRECT_SEQUENCE.md` for the canonical implementation.

---

## P-03 — UTC / Timezone Boundary Shift

### Description

iCal feeds and many external APIs store dates as UTC midnight timestamps. When these are displayed using JavaScript's local-timezone methods (`toLocaleDateString`, `new Date(ts).getDate()`, `toLocaleDateString`), the date shifts by one day for users in negative UTC offsets (e.g., EDT = UTC−4: midnight UTC = 8 PM EDT the previous day).

This produces the most confusing class of bug in the system: a booking that shows as "Jul 2" in the UI when the iCal says "Jul 3", or a checkout that shows as "Jun 29" when it should be "Jun 28". The data is correct; the display is wrong.

A related variant: iCal checkout dates are stored as the **exclusive** end (midnight of the day after checkout). Code that adds `+1` to compute a display end date double-counts the exclusive offset, pushing the date one extra day forward.

### Root Cause

JavaScript's `Date` object is timezone-aware at the display layer but timezone-naive at the storage layer. `new Date("2026-07-03")` (a date-only string) is parsed as UTC midnight, but `date.getDate()` returns the day in the local timezone. The mismatch is invisible in development when the developer's machine is in UTC or a positive offset, but breaks in production for users in UTC−N zones.

### Known Instances

| Commit | Location | Symptom | Fix Applied |
|---|---|---|---|
| `a46131f` | `Home.tsx` — Properties upcoming list | Check-in dates showing one day early (Jul 3 → Jul 2); checkout dates one day late (Jun 28 → Jun 29) | Added `utcMidnightToDateStr()` and `formatUtcMidnightDate()` helpers that use `getUTCFullYear/Month/Date` exclusively |
| `a46131f` | `CalendarView.tsx` — day/2-day view | Checkout open-circle node never rendered; `isCheckoutVisible` always false | iCal `checkOut` is already exclusive-end UTC midnight; removed the extra `+1` when computing `evEnd` for property bookings |
| `bbaad43` | `PropertyBookingTimeline.tsx` — Gantt | Booking.com checkout Jul 3 / Airbnb check-in Jul 3 showing as Jul 2 | Added `utcMidnightToLocal()` helper; updated `getBookingRole`, `getEntryForDay`, `isFirstDayOfSpan` |
| `2a8fd55` | Gantt conflict/back-to-back detection | `conflictDays` and `backToBackDays` keyed by local-midnight timestamps; keys didn't match across timezones | Changed all date keys to UTC ISO date strings (`YYYY-MM-DD` from `toISOString().slice(0,10)`) |
| `f48b6a2` | Properties widget checkout filter | Checkout entries filtered out in EDT because `checkOut` midnight UTC = 8 PM EDT the day before | Changed to date-string comparison (`YYYY-MM-DD` in device timezone) instead of UTC timestamp comparison |
| `eca2cad` | Calendar date rendering | Calendar date off-by-one — `YYYY-MM-DD` string parsed as UTC midnight, displayed in local timezone | Parsed as local midnight explicitly |
| *(live)* | Properties upcoming widget | `cinDate.toLocaleDateString()` and `dayLabel()` use local timezone on iCal UTC midnight timestamps — check-in/out dates show one day early in EDT | See audit H-01 in `docs/PROACTIVE_AUDIT_2026_06_27.md` |
| *(live)* | FamilyView `isToday`/`isTomorrow` | `d.getDate() === now.getDate()` comparison uses local timezone on UTC timestamps — all-day events near midnight UTC show wrong day label | See audit H-02 |
| *(live)* | `bookingEmailScraper.ts` | Natural-language date strings ("21 June 2026") parsed as local midnight; ISO date strings ("2026-07-03") parsed as UTC midnight — inconsistent depending on email format | See audit C-03 |

### Prevention Checklist

- [ ] **Never use `toLocaleDateString`, `getDate()`, `getMonth()`, `getFullYear()` on iCal timestamps.** Always use `getUTCDate()`, `getUTCMonth()`, `getUTCFullYear()`.
- [ ] **Use the helpers.** `utcMidnightToDateStr(ts)` and `formatUtcMidnightDate(ts)` exist in `Home.tsx`. Extract them to a shared utility if used in more than two files.
- [ ] **Know whether an end date is inclusive or exclusive.** iCal `DTEND` for all-day events is exclusive (midnight of the day after). Do not add `+1` to it. Regular events use inclusive end times.
- [ ] **Use UTC ISO string keys for date maps.** Any `Map` or object keyed by date must use `date.toISOString().slice(0, 10)` (UTC), not `date.toLocaleDateString()` or a local timestamp.
- [ ] **Test in EDT (UTC−4).** Run the dev server with `TZ=America/New_York` to catch timezone boundary bugs before they reach production.

> **Rule:** The canonical date model is documented in `docs/AI_MEMORY.md` §11 (CRITICAL iCal date rule) and the template README (Datetime & Timezone section). Consult both before writing any date display code.

---

## P-04 — Propagation Without Guard

### Description

An event write triggers propagation to sibling calendars. The propagated "shadow block" is itself an event. If the propagation engine does not distinguish between original events and shadow blocks, it will propagate shadow blocks, creating more shadow blocks, which are then propagated again — an infinite loop. The same pattern applies to any system where a write triggers a side effect that itself triggers the same write path.

A related variant: deleting a shadow block on a target calendar triggers the webhook sync path, which calls `onEventDeleted`, which calls `deleteShadowBlocksForEvent`, which finds no source event and silently does nothing — but only if the guard is in place. Without the guard, it tries to re-propagate, creating new shadow blocks to replace the deleted ones.

### Root Cause

The propagation engine was designed to handle user-created events. Shadow blocks were added later as a separate concept, but the propagation engine was not updated to recognise them as a distinct type. The engine treated all events the same, including the ones it had just created.

### Known Instances

| Commit | Symptom | Fix Applied |
|---|---|---|
| `7e95357` | Duplicate shadow blocks from race conditions; deleting a shadow block triggered new propagation | Added `UNIQUE` constraint on `(sourceEventId, targetCalendarId)`; `INSERT ON DUPLICATE KEY UPDATE`; shadow-block guard in both incremental and full sync paths |
| `cc4212f` | Shadow blocks not written when Google Calendar API call failed | Separated concerns: DB write is mandatory; Google Calendar write is best-effort. Shadow block existence is determined by the DB, not by Google API success. |
| `a700843` | Full sync path did not call `onEventUpserted`/`onEventDeleted`; orphaned shadow blocks accumulated | Full-sync path wired to propagation engine; orphan cleanup added after full sync |
| `a79bd5f` | No default propagation when no vertical visibility rules existed | Default-busy fallback added: events always propagate as Busy to all other verticals when no explicit rule is set |
| *(Jun 27, 2026)* | Shadow block filter in `events.list` used `!fullAccessCalendarIds.has(sb.sourceCalendarId)` — for admin users whose access set contains ALL household calendars, this condition was always `true`, silently dropping every shadow block before it reached members who only had access to the target calendar | Fixed: replaced condition with `!dedupedEventIds.has(sb.sourceEventId)` — suppress shadow block only when the viewer already has the source event in their visible set |

### Sub-Pattern P-04c — Over-Broad Propagation Suppression Guard

A filter intended to prevent duplicate display of propagated events uses a **coarse access-set membership check** (`accessSet.has(sourceCalendarId)`) rather than a **precise event-presence check** (`dedupedEventIds.has(sourceEventId)`). For users with broad access (admins, owners), the access set contains every calendar in the household, so the guard fires on every shadow block and suppresses all of them — even for members who only have access to the target calendar and have no other way to see the event.

**Canonical fix:** Always suppress a shadow block based on whether the **specific event** is already in the viewer's resolved visible set, not on whether the **source calendar** is in their access set. These are not equivalent when the viewer's access set is broad.

**P-04c audit result (Jun 27, 2026):** Full scan of all `.has()` calls on access sets in `server/routers/calendar.ts`, `server/services/eventPropagation.ts`, and `server/services/calendarWebhook.ts` found **no other instances** of this specific pattern. The fixed filter on line 356 of `calendar.ts` is the only place where a shadow block suppression guard used a calendar-set check instead of an event-presence check. All other `.has()` calls on access sets are either constructing the sets (correct) or checking whether a calendar belongs to the viewer's visible set for rendering (correct — those are not suppression guards).

### Prevention Checklist

- [ ] **Every propagation path must check `isShadowBlock` before propagating.** If `event.isShadowBlock === true`, skip propagation entirely.
- [ ] **DB writes and external API writes must be separated.** The DB is the source of truth. External API writes (Google Calendar) are best-effort and must never gate DB writes.
- [ ] **Add a UNIQUE constraint on any junction table that could accumulate duplicates.** If a row represents a relationship between two entities, that relationship should be unique in the DB, not just in the application code.
- [ ] **Define the default behaviour explicitly.** What happens when no rule exists? The answer must be in code, not implied.
- [ ] **After any bulk operation (full sync, backfill), run orphan cleanup.** Orphaned rows from previous states must be removed, not just ignored.
- [ ] **P-04c guard:** When writing a filter to suppress duplicate display of a propagated event, always check `dedupedEventIds.has(sourceEventId)` — not `accessSet.has(sourceCalendarId)`. The access set is a calendar-level concept; the dedup set is an event-level concept. They are only equivalent when the viewer has access to exactly one calendar per vertical, which is never guaranteed for admins.

---

## P-05 — Component Lifecycle vs. Browser Navigation

### Description

A React component holds state in `useState` or `useEffect`. The component is mounted, the user initiates a flow, and the browser navigates away (OAuth redirect, external link, back button). On return, the component re-mounts with no memory of the previous state. Any logic that was supposed to run "when the flow completes" never runs because the component was not mounted when the completion event occurred.

This pattern is a specific instance of P-02 (Sequential Process Failure Handling) but is distinct enough to warrant its own entry because the root cause is a misunderstanding of React's component lifecycle relative to browser navigation.

### Root Cause

Developers think of React components as persistent objects. They are not. A component is destroyed when it unmounts and rebuilt from scratch when it remounts. Any state that must survive a full-page navigation must be stored outside the component — in `sessionStorage`, `localStorage`, a URL parameter, or the database.

### Known Instances

| Commit | Component | What Was Lost | Fix Applied |
|---|---|---|---|
| `e4b3d63` | `ReconnectSequenceModal` | Sequence advancement logic in `useEffect` inside the modal. Modal unmounted on OAuth redirect. On return, modal remounted with stale `pending` state for all accounts. | Moved all URL param detection and state advancement to `useReconnectSequenceResume` hook at the **page level**. Sequence state persisted in `sessionStorage`. |
| `0d824ff` | `PropertyBookingTimeline` | `useMemo` for `upcoming` was placed after an `isLoading` early return, violating Rules of Hooks. Component crashed on re-render. | Moved `useMemo` before the early return (hooks must be called unconditionally). |
| `1d58e7e` | `PrepRulesEditor` | `setState` calls in the render body (not in `useEffect`). Caused hook order mismatch in production builds (React error #310). | Moved `setState` calls into `useEffect`. |
| `7daa157` | Member permissions page | Component returned "Access Restricted" immediately on first render because `myPerms` was `undefined` while the query was loading. | Added `myPermsLoading` guard so the component shows a loading state until the server responds. |

### Prevention Checklist

- [ ] **Never call `setState` in the render body.** All side effects must be in `useEffect`.
- [ ] **Never call hooks conditionally or after an early return.** All `useState`, `useMemo`, `useCallback`, and custom hooks must be called unconditionally at the top of the component.
- [ ] **Never place URL param detection inside a modal or dialog.** Modals are conditionally rendered; they may not be mounted when the URL param arrives. Place URL param detection in the page-level component that is always mounted.
- [ ] **Treat `undefined` query data as a loading state, not as a falsy value.** `if (!data) return <AccessDenied />` is wrong when `data` is `undefined` because the query hasn't resolved yet.
- [ ] **Any state that must survive a page reload or redirect must live outside React.** Use `sessionStorage` for tab-scoped state, `localStorage` for persistent state, URL params for shareable state, or the database for cross-device state.

---

## P-06 — Implicit Data Ownership Assumption

### Description

A resource (property, calendar, booking, vertical) is created and stored in the database under one `householdId`. Later code — a query, a mutation, a sync handler — assumes the resource belongs to a different household, or does not check household ownership at all. The result is either a silent data isolation failure (one household sees another's data) or a confusing "not found" error when the resource exists but is owned by a different household.

### Root Cause

The system has two Tarik households in the database (a legacy artifact of early development). Code written before the household isolation helpers existed often used `ctx.user.householdId` directly, which was sometimes `null` because the `users` table is not updated when a user joins a household — only `household_members` is. The safe pattern is always to look up the member record via `getHouseholdMemberByUserId(ctx.user.id)`.

### Known Instances

| Commit | Resource | Symptom | Fix Applied |
|---|---|---|---|
| `c357c4f` | Properties | All 5 properties stored under wrong household ID; Properties bookings tab showed empty | Migrated all properties to correct household ID |
| `b98e129` | Verticals | Verticals router trusted `ctx.user.householdId` which was `null`; create/update/delete all failed silently | All procedures changed to use `getHouseholdMemberByUserId(ctx.user.id)` live lookup |
| *(live)* | `security.ts` data export/delete | `ctx.user.memberId ?? ""` used in queries — `memberId` is null for users who joined via invite; data export returns zero rows and delete silently does nothing | See audit H-05 in `docs/PROACTIVE_AUDIT_2026_06_27.md` |
| `f72ee36` | Properties mutations | No household isolation check on `create`, `update`, `delete`, `addPlatform`, `deletePlatform`, `setBookingOverride` | Added `assertHouseholdOwnership` and `assertResourceBelongsToHousehold` helpers; all mutations now guarded |
| `cd41797` | Shadow block propagation | Duplicate calendar records had `verticalId=null`; propagation silently skipped them | Assigned correct `verticalId` to all duplicate records; backfilled 279 events |

### Prevention Checklist

- [ ] **Never use `ctx.user.householdId` directly in a procedure.** Always call `getHouseholdMemberByUserId(ctx.user.id)` and use the returned `householdId`.
- [ ] **Every mutation that touches a resource must call `assertResourceBelongsToHousehold`.** This is not optional for any resource that has a `householdId` column.
- [ ] **When creating a resource, always derive `householdId` from the authenticated member, not from user input.**
- [ ] **When debugging "not found" errors, check household ID first.** The resource likely exists under a different household.
- [ ] **Null `verticalId` or `householdId` on a record is a data integrity problem, not a normal state.** Add a NOT NULL constraint or a runtime assertion.

---

## P-07 — Missing Loading / Error / Empty State

### Description

A UI component is built and tested with data present. The loading state, error state, and empty state are either not implemented or implemented incorrectly — returning a premature "access denied" screen, crashing with a null reference, or showing stale data indefinitely.

These bugs are almost never caught in development because the developer always has data and a fast local server. They surface in production when queries are slow, data is absent, or an error occurs.

### Root Cause

The developer builds the happy path (data present, query succeeded) and does not explicitly design the other three states. React's query hooks return `{ data, isLoading, isError }` but the component only uses `data`.

### Known Instances

| Commit | Component | Failure Mode | Fix Applied |
|---|---|---|---|
| `7daa157` | Member permissions page | Returned "Access Restricted" immediately because `myPerms` was `undefined` (query loading) | Added `myPermsLoading` guard; shows neutral loading state until query resolves |
| `dffb7a0` | Landing page / `useDeviceLocation` | `useDeviceLocation` fired a protected mutation on unauthenticated users; global 401 redirect handler redirected public visitors to login | Added public-path guard in `useDeviceLocation`; 401 handler skips redirect on public paths |
| `f38c8a9` | Properties upcoming list | Past in-progress bookings appeared as "upcoming" because filter used `checkOut >= now` instead of `checkIn >= today midnight` | Fixed filter to use arrival date for upcoming list |
| `a040950` | Gantt block/unavailable spans | Label rendered on every day of a multi-day span instead of only the first day | Added `isFirstDayOfSpan` helper; label suppressed on continuation days |
| `cbc5937` | Calendar loading | Generic "Loading calendar..." text shown during all loading states | Replaced with three view-aware skeleton components that mirror the actual layout |

### Prevention Checklist

For every component that fetches data, explicitly handle all four states:

- [ ] **Loading state** — show a skeleton or spinner that matches the layout of the loaded state. Never show a blank screen.
- [ ] **Error state** — show a user-readable error message with a retry action. Never show a raw error object.
- [ ] **Empty state** — show a helpful message explaining why there is no data and what the user can do. Never show a blank list.
- [ ] **Loaded state** — the happy path.

Additional guards:

- [ ] **Never use `!data` as an access control check.** `!data` is true when the query is loading. Use `!isLoading && !data` for empty state, and `isLoading` for loading state.
- [ ] **Protect mutations from unauthenticated callers.** Hooks that call `protectedProcedure` mutations must check `isAuthenticated` before firing.
- [ ] **Filters must use the same timezone as the data.** A filter using `new Date()` (local time) against a UTC timestamp will produce wrong results at timezone boundaries.

---

## P-08 — External API Contract Surprise

### Description

An external API (Google Calendar, iCal, Gmail, node-ical) returns data in a format that differs from what the code assumes. The code was written based on documentation or intuition, not on observed API responses. The mismatch is silent — no error is thrown — but the data is wrong or missing.

### Root Cause

External APIs are not under our control. Their response formats change, their documentation is incomplete, and their behaviour differs between environments (development vs. production, personal accounts vs. Workspace accounts). Assumptions about response format must be validated against actual API responses, not documentation alone.

### Known Instances

| Commit | API | Assumption | Reality | Fix Applied |
|---|---|---|---|---|
| `a3a9454` | Google Calendar Webhooks | `result.expiration` is a date string; `new Date(result.expiration).getTime()` would return a valid timestamp | `result.expiration` is a Unix-millisecond string (e.g., `"1750000000000"`); `new Date("1750000000000")` returns `NaN` | Changed to `parseInt(result.expiration, 10)` |
| `d7fff24` | node-ical | `import * as nodeIcal from 'node-ical'` would expose `nodeIcal.async.fromURL` | `import *` resolved to `undefined` for the default export in this ESM/CJS interop context | Changed to default import: `import nodeIcal from 'node-ical'` |
| `13c84ff` | Google Calendar (personal Gmail) | `getAccessTokenForCalendar` could use service account impersonation for all Google accounts | Service account impersonation only works for Workspace domain accounts; personal Gmail (`@gmail.com`) requires OAuth refresh token only | Added routing: Workspace domains → service account; personal Gmail → OAuth token |
| `41c6cb6` | Google Calendar Events API | All-day event `end.date` is the last day of the event (inclusive) | `end.date` is the day **after** the last day (exclusive). `parseGoogleEvent` was off by one for all-day events. | Fixed `parseGoogleEvent` to treat `end.date` as exclusive; updated create/update to send exclusive end |

### Prevention Checklist

- [ ] **Log the raw API response before parsing it.** At least once, during initial integration, log the actual response object and compare it to the documentation.
- [ ] **Never assume a numeric field is a `number` type.** Many APIs return numbers as strings. Always `parseInt` or `parseFloat` explicitly.
- [ ] **Never assume ESM/CJS interop will resolve correctly.** Test the import in the actual runtime environment. `import * as` and `import default` behave differently depending on the module's export format.
- [ ] **Treat external API date formats as untrusted.** Validate whether dates are inclusive or exclusive, UTC or local, ISO 8601 or Unix timestamp, before writing display or comparison logic.
- [ ] **Write a contract test for every external API integration.** The test should assert the shape of the response, not just that the call succeeds. When the API changes, the test will catch it.

---

## Standing Process — Bug Fix Assessment

Every time a bug is fixed, the engineer must complete the following before closing the work:

**Step 1 — Classify the bug.** Which pattern(s) from this document does the root cause belong to? Write the pattern number (e.g., P-03) in the commit message or PR description.

**Step 2 — Add to the Known Instances table.** Add a row to the relevant pattern's table with the commit hash, symptom, and fix applied.

**Step 3 — Check the prevention checklist.** Were any checklist items violated? If so, note which ones. This is not blame — it is calibration.

**Step 4 — Consider whether a new pattern is warranted.** If the bug does not fit any existing pattern, and if you can imagine the same class of mistake happening again, add a new pattern at the bottom of this document.

**Step 5 — Update the knowledge base.** If the fix introduces a new architectural rule (like the UTC date helpers or the page-level hook rule), add it to `docs/AI_MEMORY.md` and seed it into the `project_knowledge` DB table so the knowledge review heartbeat picks it up.

---

## P-09 — Scope/Permission Dependency Not Verified

### Description

A feature that depends on an external OAuth scope or API permission is treated as "implemented" once the service code is written. The required scope is defined in a mapping table but is never added to the OAuth initiate handler, so no user ever grants it. The service fails at runtime with 403/401 errors, but these errors are only visible in a job log table that is not routinely checked. The feature appears to work from the UI (buttons exist, badges show "awaiting data") but has never succeeded end-to-end.

### Root Cause

The developer conflates "the code describes what the feature would do" with "the feature works." The scope is defined in one place (a purpose-to-scope map) but not propagated to the OAuth initiate handler. No integration test verifies the full path: consent → token → API call → data written to DB → UI renders real data.

### Known Instances

| Commit | Context | Symptom | Fix Applied |
|---|---|---|---|
| (pre-audit) | `gmail.readonly` for email scraping | `gmail.readonly` defined in `PURPOSE_SCOPES` (integrations.ts) but absent from `GOOGLE_SCOPES` (providers.ts) and from the legacy `googleAccountConnect.ts` initiate handler. All 7 scrape attempts returned 403. Zero enrichment fields populated across 65 booking rows. | Add `GMAIL_READ` to `GOOGLE_SCOPES`; update connect handler to use `buildScopesForPurposes`; re-consent affected accounts. (2026-06-28) |
| `P-34 Jul 1 2026` | `tarik@maxfieldmarket.com` — 7 platforms blocked | Account reconnected with identity-only scopes (no `gmail.readonly`). All 7 platforms using this account returned `needs_reauth` on every scrape run. Scope was never validated at connect time. | Added scope validation in `googleAccountConnect.ts` after token save; `notifyOwner()` fires on first `needs_reauth` transition; `integrationHealthCheck` heartbeat added to detect scope gaps proactively. |

### Prevention Checklist

- [ ] Every new external scope must be added to `GOOGLE_SCOPES` in `providers.ts` with a named key
- [ ] The connect-account OAuth initiate handler must use `buildScopesForPurposes` (not hardcoded scope arrays) so purpose → scope mapping is single-source-of-truth
- [ ] After deploying a scope addition, query `oauth_tokens` to verify at least one live token has the new scope
- [ ] Run the dependent service against a real token and verify data is written to the DB before marking the feature complete
- [ ] Check job tables (`email_scrape_jobs`, etc.) for 403/401 errors before reporting an integration feature as working
- [ ] The "Integration Feature Definition of Done" checklist (see below) must be completed before any integration feature is closed

---

## Integration Feature Definition of Done

This checklist applies to any feature that depends on an external OAuth scope, API key, or permission. It must be completed — with evidence — before the feature is marked done in `todo.md`.

```
[ ] Scope/permission added to the correct constant in providers.ts (or equivalent)
[ ] Scope included in the OAuth initiate handler for the correct flow (NOT login)
[ ] At least one live token in oauth_tokens has the scope granted (verified by DB query)
[ ] Service code makes a real API call against the live token (not mocked)
[ ] API call returns 200 (not 401/403) — verified in logs or job table
[ ] Data is written to the database (verified by SELECT, not by reading code)
[ ] UI renders the real data (not empty state, not placeholder)
[ ] Job/log table (if applicable) shows status = "success" for at least one run
```

---

## Pattern Template

---

## P-10 — MySQL TINYINT(1) Boolean Strict-Equality Mismatch

### Description

MySQL stores `boolean` columns as `TINYINT(1)`. The `mysql2` driver (used by Drizzle ORM in this project) returns these values as JavaScript `number` (0 or 1), **not** as JavaScript `boolean` (`false` or `true`). Code that uses strict equality (`=== false`, `=== true`, `!== false`, `!== true`) against these values will silently fail: `0 === false` evaluates to `false` in JavaScript, so the guard is never entered. This is one of the most silent bugs possible — no error is thrown, no type warning is emitted, and TypeScript does not catch it because Drizzle types the column as `boolean` (the inferred type does not reflect the runtime wire format).

### Root Cause

Drizzle ORM's TypeScript schema declares `boolean("col")` columns with type `boolean`, but the underlying mysql2 driver does not coerce the wire value. The gap between the declared type and the runtime value is invisible to TypeScript. Developers write guards using strict equality because that is idiomatic JavaScript for booleans, not knowing the value is actually a number at runtime.

### Hard Evidence

Confirmed via live test (`scripts/test-bool-coercion.mjs`, Jun 28 2026):

```
column: shadowBlocking (DB value: 0)
JS value: 0  |  typeof: number
=== false (strict): false   ← BUG: guard never fires
== false (loose):   true
!val (falsy):       true    ← CORRECT: use this
Boolean(val):       false

column: shadowBlocking (DB value: 1)
JS value: 1  |  typeof: number
=== true (strict):  false   ← BUG: guard never fires
== true (loose):    true
!!val2 (truthy):    true    ← CORRECT: use this
```

### Known Instances

| Commit | Context | Symptom | Fix Applied |
|---|---|---|---|
| `43cde07a` | `eventPropagation.ts` — 3× `shadowBlocking === false` guards | Team StartOut calendar received shadow blocks despite `shadowBlocking = 0` in DB | Changed all 3 to `!val` (falsy check) |
| `43cde07a` | `eventPropagation.ts` — `excludeMultiDayEvents === true` | Multi-day event exclusion rule never fires for members with `excludeMultiDayEvents = 1` | Changed to `!!val` (truthy check) |
| `43cde07a` | `notes.ts` — `isCompleted === true` / `isCompleted === false` | `completedAt` timestamp not set/cleared when toggling task completion | Changed to truthy/falsy checks |
| `C-03 Jul 1 2026` | `bookingEmailScraper.ts` — 6× `new Date(str.replace(...))` | Date strings like `"Jun 20, 2026"` parsed with local timezone methods shifted dates by ±1 day for EDT users | Added `parseBookingDate()` helper that always appends `T00:00:00Z` before constructing `new Date()` |

### Prevention Checklist

- [ ] **Never use `=== true` or `=== false` on a value that originates from a Drizzle ORM row.** Use `!!val` (truthy) or `!val` (falsy) instead.
- [ ] **Use `Boolean(val)` when you need an explicit boolean** for downstream logic or serialisation.
- [ ] **In code review:** flag any `=== true` / `=== false` comparison where the left-hand side is a property from a DB row or a function that returns a DB row. Require the reviewer to confirm the value is not a mysql2 integer.
- [ ] **When writing new guards on DB boolean columns**, write the guard as `if (!row.someFlag)` or `if (row.someFlag)` — never `if (row.someFlag === false)`.
- [ ] **After adding a new `boolean()` column to schema**, grep the codebase for any new strict-equality checks against that column name before shipping.

---

Use this template when adding a new pattern:

```markdown
## P-11 — Token Disambiguation by Non-Unique Field

### Description

OAuth tokens are stored in `oauth_tokens` with a composite key of `(memberId, provider, accountEmail)`. However, the same `accountEmail` can have **multiple rows** — this happens when a user connects the same Google account twice (e.g. once with `calendar_sync` purposes, then again with `email_scraping` purposes), or when a reconnect creates a new row instead of updating the existing one. Any procedure that resolves a token by `accountEmail` alone (`getOAuthTokenByEmail`) will silently operate on whichever row the DB returns first (ORDER BY is unspecified), which may not be the one the user intended.

### Root Cause

The system was designed assuming one token per `(member, provider, email)` tuple. That assumption was never enforced with a UNIQUE constraint, and the `upsertOAuthToken` function resolves by email-only, meaning a reconnect with different purposes creates a second row rather than updating the first. Once two rows exist for the same email, any email-keyed operation is a coin flip.

### Known Instances

| Date | Procedure | Symptom | Fix Applied |
|---|---|---|---|
| Jun 28, 2026 | `integrations.remove` | User deleted the wrong `tarik@tjperkinsfam.com` token — the one with `gmail.readonly` and all purposes was revoked; the stale orphan remained | Changed input to `tokenId: z.string().uuid()`; ownership verified by `memberId` check |
| Jun 28, 2026 | `integrations.updatePurposes` | Purposes update would silently target whichever duplicate row was returned first | Changed to prefer `tokenId`; `accountEmail` kept as optional fallback for backwards compat |
| Jun 28, 2026 | `calendar.removeGoogleAccount` (legacy) | Same email-only lookup; same risk | Added `tokenId` as preferred input with `accountEmail` fallback |

### Prevention Checklist

- [ ] Any procedure that modifies or deletes a specific token MUST accept `tokenId` (the row UUID), not `accountEmail`
- [ ] `accountEmail` is acceptable for **read-only** lookups (e.g. checking if an account is connected), but never for write operations
- [ ] When adding a new mutation that targets a token, ask: "could there be two tokens with this email?" If yes, use `tokenId`
- [ ] Consider adding a UNIQUE constraint on `(memberId, provider, accountEmail)` to prevent duplicate rows at the DB level — but first audit whether any reconnect flow intentionally creates a second row
- [ ] When the UI renders a list of connected accounts, each row must carry the token `id` and pass it to all mutations

---

## P-12 — Guard Applied to Some Code Paths But Not All

### Description

A safety guard (e.g. `shadowBlocking`, permission check, rate limit, scope check) is correctly implemented on the code paths that were in focus at the time of writing, but the same logic has multiple entry points and the guard is not applied uniformly. The feature appears to work correctly in the cases that were tested, but silently misbehaves on the overlooked path. This is distinct from P-10 (wrong comparison operator) — here the guard logic is correct; it is simply absent from one or more paths.

### Root Cause

The developer thinks of a feature as having one flow, but the implementation has branched into multiple paths (e.g. same-vertical vs cross-vertical, new vs update, webhook vs poll). The guard is added to the path that triggered the bug report, but the other paths are not audited for the same requirement.

### Known Instances

| Date | Location | Symptom | Fix Applied |
|---|---|---|---|
| Jun 28, 2026 | `eventPropagation.ts` Rule 1 (same-vertical siblings) | `Team StartOut` had `shadowBlocking=0` but still received shadow blocks from `tarik.perkins@startout.org` because the P-10 fix was applied to Rules 2 and 3 (cross-vertical paths) only. Rule 1 had no `shadowBlocking` guard at all. | Added `if (!(tgt as any).shadowBlocking) continue;` to the Rule 1 loop with a P-10 + P-12 comment |

### Prevention Checklist

- [ ] When adding a guard to a function, **search for all call sites and all branches** within that function. Ask: "are there other loops or paths in this function that process the same data without this guard?"
- [ ] When a function has multiple named rules or paths (Rule 1, Rule 2, Rule 3), treat each as a separate code path and verify the guard is applied to all of them
- [ ] After fixing a guard bug, run the post-diagnosis audit: search the entire file for the same pattern (`shadowBlocking`, `hasPermission`, etc.) and confirm every occurrence is correct
- [ ] Write a test that exercises the same-vertical path specifically, not just the cross-vertical path

---

## P-13 — External Write Bugs Require Batched Remediation

### Description

When a bug causes mass erroneous writes to an external API (e.g. Google Calendar), the remediation cost is proportional to the volume of bad data. If the bug ran for weeks, the volume can be thousands of records. A serial delete approach (one HTTP request per record) is rate-limited and can take 30–60+ minutes, blocking the user from seeing a clean state.

### Root Cause

The first instinct when cleaning up external API data is to write a simple loop: fetch all bad records, delete one by one. This works for small volumes but fails at scale. Most Google APIs support batch requests of up to 50 operations per HTTP call — a 50x throughput improvement that is routinely overlooked.

### Known Instances

| Date | Bug | Volume | Remediation |
|---|---|---|---|
| 2026-06-29 | P-12: `shadowBlocking` guard missing from Rule 1 — Geeves wrote blocked-time events to Team StartOut Google Calendar for all personal events since initial deployment | ~2,000+ events | Batch script ready at `scripts/cleanup-startout-batch.mjs` — requires reconnect of `tarik.perkins@startout.org` to get valid token |

### Prevention Checklist

Before writing any external API cleanup script:

- [ ] **Estimate volume first.** Query the DB or the external API to count affected records before writing the cleanup loop. If > 100 records, use batch API.
- [ ] **Google Calendar batch endpoint:** `POST https://www.googleapis.com/batch/calendar/v3` with `multipart/mixed` body, up to 50 sub-requests per call.
- [ ] **Rate limit:** Add a 200ms delay between batch calls to stay within Google's 100 requests/100s per-user quota.
- [ ] **Token validity:** Refresh the access token before starting and handle `invalid_grant` errors explicitly — long-running scripts will outlive a 1-hour access token.
- [ ] **Dry-run first:** Log what would be deleted before actually deleting. Confirm the count matches expectations.
- [ ] **Idempotent:** The script must be safe to re-run. Check that already-deleted records return 404 (not 500) and are skipped gracefully.

```js
// Correct pattern: batch delete 50 events per HTTP call
async function batchDelete(accessToken, calendarId, eventIds) {
  const boundary = "batch_" + Date.now();
  const parts = eventIds.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\n\r\nDELETE /calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${id} HTTP/1.1\r\n\r\n`
  );
  const body = parts.join("") + `--${boundary}--`;
  const res = await fetch("https://www.googleapis.com/batch/calendar/v3", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  return (text.match(/HTTP\/1\.1 204 No Content/g) || []).length;
}

// Process in batches of 50 with 200ms delay
for (let i = 0; i < eventIds.length; i += 50) {
  const batch = eventIds.slice(i, i + 50);
  await batchDelete(accessToken, calendarId, batch);
  if (i + 50 < eventIds.length) await new Promise(r => setTimeout(r, 200));
}
```

### Related Patterns

- **P-12:** Guard Applied to Some Code Paths But Not All (the upstream bug that caused this)
- **P-10:** MySQL Boolean Strict Equality (same class of guard-bypass bug)

---

---

## P-14 — Shared Credential Blast Radius

### Description

A single OAuth account (or API key) is used as the `notificationEmail` or credential for multiple independent integration platforms. When that account's token expires, is revoked, or lacks a required scope, every platform that depends on it fails simultaneously. The failure looks like a cascade but is actually a configuration problem: the resilience fix (e.g. `Promise.allSettled`) correctly isolates the individual failures, but the *outcome* is identical to a full cascade because the root cause is shared.

This pattern is distinct from P-09 (scope not granted) and P-02 (sequential failure handling). It is specifically about the blast radius of a shared credential across multiple independent consumers.

### Root Cause

The developer assigns one account to many platforms for convenience (one inbox to monitor, one reconnect to perform). The risk of a single point of failure is not evaluated at design time. The resilience fix (isolation) is applied at the wrong layer — it isolates the symptom (individual platform failures) but not the cause (shared credential).

### Known Instances

| Date | Context | Blast Radius | Fix Applied |
|---|---|---|---|
| Jul 1, 2026 | `tarik@maxfieldmarket.com` assigned as `notificationEmail` for 7 of 9 platforms | 7 platforms returned `needs_reauth` on every scrape run; 0 booking enrichment across Morabeza, Artiste's Boutique, and Sunset Studio Booking.com for weeks | P-34: scope validation at connect time; `notifyOwner()` on first `needs_reauth`; integration health heartbeat; `buildGmailQuery` made platform-specific so each platform only scans its own sender domain |

### Prevention Checklist

- [ ] **Audit shared credentials at design time.** Before assigning an account to multiple platforms, ask: "if this account's token fails, how many platforms are affected?"
- [ ] **Prefer per-platform accounts for high-volume integrations.** Each property/platform should ideally have its own notification email to limit blast radius.
- [ ] **When a single account must serve multiple platforms**, add a `notifyOwner()` alert on the first failure so the problem is visible immediately, not discovered weeks later.
- [ ] **Resilience fixes (try/catch, Promise.allSettled) are necessary but not sufficient.** After adding isolation, ask: "does the root cause still allow all isolated units to fail simultaneously?"
- [ ] **The integration health heartbeat (`/api/scheduled/integration-health`) is the early-warning system.** Verify it is registered and running after any new account is connected.

---

*This document is part of the Geeves.Life knowledge base. It is reviewed by the `knowledgeReview` heartbeat and should be registered in `server/scheduledHandlers/knowledgeReview.ts` under `DOCS_TO_REVIEW`.*

## P-15 — Trust-First Scope Consent

### Description

Integration features that require OAuth scopes (calendar read/write, Gmail read, Gmail send) silently request those scopes as part of the login or connect flow without explaining to the user what is being accessed, why it is needed, what the benefit is, or what will not work if they decline. This erodes user trust and can trigger unexpected Google security alerts for household members who did not initiate the request.

The root cause is treating scope acquisition as a technical step (add scope to URL → redirect → done) rather than a trust-building interaction. The user is handed a Google consent screen with no context, no plain-language explanation, and no ability to make an informed decision.

### Why It Matters for Geeves.Life

Geeves.Life is a household operating system. It manages calendars, emails, and personal data for multiple family members including children and elderly parents. Trust is the product. A household member who receives an unexpected Google security alert ("An app requested access to your Gmail") and cannot find an explanation in the app will disconnect their account and lose confidence in the platform. This is not a UX issue — it is a product-level risk.

### The Fix

Every OAuth scope request must be preceded by a `ScopeConsentModal` that:

1. **Names the permission in plain language** — not "gmail.readonly" but "Read your Gmail inbox"
2. **Explains why Geeves needs it** — one sentence, specific to the feature
3. **Shows a concrete benefit example** — "For example: when a Booking.com confirmation arrives, Geeves will automatically fill in your guest's name and check-in date"
4. **Shows what will not work if denied** — "Without this, booking details will remain incomplete and you will need to enter them manually"
5. **Offers a Do Not Show Again checkbox** — stored in `scope_consent_preferences` per user per scope key; dismissed scopes bypass the modal on future connects

The modal must appear **before** the `window.location.href = oauthUrl` redirect. It must not appear during the standard Manus login flow (identity-only scopes do not require consent).

### Scope Keys

| Scope Key | Plain Language Name | Feature |
|---|---|---|
| `google.calendar` | Read and write your Google Calendar | Calendar sync, shadow blocking, event creation |
| `google.gmail.readonly` | Read your Gmail inbox | Booking confirmation email scraping |
| `google.gmail.send` | Send emails from your Gmail account | Outbound guest notifications |

### Implementation

- `client/src/components/ScopeConsentModal.tsx` — the modal component
- `server/routers/integrations.ts` — `dismissScopeConsent` and `getScopeConsentPreferences` procedures
- `drizzle/schema.ts` — `scopeConsentPreferences` table
- `client/src/pages/Settings.tsx` — `withScopeConsent()` helper intercepts all three connect/reconnect handlers

### Known Instances

| Date | Context | Impact | Fix Applied |
|---|---|---|---|
| Jul 1, 2026 | `autoSyncPersonalCalendars` called on every login callback, triggering Google Calendar API with identity-only token | Eniola and other new constellation members received unexpected Google security alerts; 0 calendar sync for new members | Removed `autoSyncPersonalCalendars` from login flow; gated on explicit connect-account flow only |
| Jul 1, 2026 | No consent modal before any OAuth scope request | Users redirected to Google consent screen with no context | P-35: `ScopeConsentModal` built and wired into all connect/reconnect handlers |

### Prevention Checklist

- [ ] **Never call a Google API with a token that was not explicitly granted the required scope.** Check `token.scopes` before any API call. If the scope is absent, surface a reconnect prompt — do not silently fail.
- [ ] **The login flow must only request identity scopes** (`openid`, `email`, `profile`). Calendar and Gmail scopes are only requested from Settings → Integrations → Add Account.
- [ ] **Every new scope must have a `ScopeConsentModal` entry** in `SCOPE_CONTENT` before it can be used in any connect flow. Adding a scope without a consent entry is a build error.
- [ ] **Dismissed consent preferences are per-user per-scope.** Do not share dismissal state across household members.
- [ ] **Test the consent flow in an incognito window as a new member** before shipping any new integration.

---

## P-16 — Best-Effort External Write Treated as Success

### Description

A system operation involves two writes: one to the local database (source of truth) and one to an external API (Google Calendar, payment processor, notification service). The external write is wrapped in a try/catch that logs the error but does not propagate it. The operation is marked as "successful" because the DB write completed. The external system never receives the data, and there is no retry mechanism to reconcile the divergence.

This pattern is especially dangerous when the external write IS the user-visible outcome (e.g., a shadow block that should appear on a Google Calendar). The DB row is an implementation detail; the Google Calendar event is what the user actually sees and relies on.

### Root Cause

The original implementation separated concerns correctly (DB write should not be gated by external API availability) but failed to add a reconciliation layer. The "best-effort" pattern was codified as a design principle rather than recognized as a temporary workaround requiring a sync-back mechanism.

### Known Instances

| Commit | Bug | Fix |
|--------|-----|-----|
| `7fe31e5e` | 82,000+ shadow blocks existed in DB but never written to Google Calendar; flush operation processed 16,700 queue items with `skipGoogleWrite=true` marking them all as "resolved" | Added `sync_status` column to shadow_blocks; Google write failure now sets `sync_failed`; added sync retry heartbeat job; added dashboard health indicator |

### Prevention Checklist

- [ ] **Every external write MUST have a sync status field** on the corresponding DB row (`pending_sync` | `synced` | `sync_failed`)
- [ ] **A retry job MUST exist** for any external write that can fail — processing `pending_sync` and `sync_failed` rows on a schedule
- [ ] **The dashboard MUST surface sync health** — users must be able to see "X items pending sync to Google Calendar"
- [ ] **Pre-flight token validation** — before bulk operations, verify that OAuth tokens are valid for all target accounts
- [ ] **Never mark an operation as "resolved" or "complete"** if the user-visible outcome (external write) has not been confirmed
- [ ] **Separate "DB row created" from "fully propagated"** in all status reporting

### Cardinal Rule

> A shadow block that only exists in the database is not a shadow block. It is a database row. The user’s calendar is the source of truth for whether time is actually blocked.

---

*This document is part of the Geeves.Life knowledge base. It is reviewed by the `knowledgeReview` heartbeat and should be registered in `server/scheduledHandlers/knowledgeReview.ts` under `DOCS_TO_REVIEW`.*


---

## P-17 — MySQL ONLY_FULL_GROUP_BY Silent Query Failure

### Description

A SQL query uses `GROUP BY` on the main table's primary key while also selecting columns from a LEFT JOIN to a table that can have multiple rows per key (e.g., `expenses` joined to `vendor_orders`). MySQL's `ONLY_FULL_GROUP_BY` mode (enabled by default in MySQL 8+ and TiDB) rejects the query because the joined columns are not functionally dependent on the GROUP BY column. The tRPC procedure's try/catch swallows the SQL error and returns an empty array, making the UI display "0/0 (0%)" and "No orders with this status."

### Root Cause

MySQL strict mode requires that every column in SELECT is either:
1. In the GROUP BY clause, or
2. Wrapped in an aggregate function (MAX, COUNT, etc.)

When a LEFT JOIN introduces a one-to-many relationship, the joined columns violate this rule even if the developer "knows" there's at most one matching row.

### Symptoms

- UI shows 0 items when the database clearly has data
- No visible error in the browser console (tRPC returns `[]` not an error)
- Server logs may show the MySQL error but it's buried in verbose output
- The query worked in development (possibly with a different sql_mode) but fails in production

### Fix

Replace `GROUP BY` with pre-aggregated subqueries:

```sql
-- BAD: GROUP BY with LEFT JOIN to multi-row table
SELECT vo.*, COUNT(e.id) as expenseCount
FROM vendor_orders vo
LEFT JOIN expenses e ON e.vendorOrderId = vo.id
GROUP BY vo.id

-- GOOD: Pre-aggregate in subquery, no GROUP BY needed on outer query
SELECT vo.*, COALESCE(ec.cnt, 0) as expenseCount
FROM vendor_orders vo
LEFT JOIN (
  SELECT vendorOrderId, COUNT(*) as cnt
  FROM expenses
  GROUP BY vendorOrderId
) ec ON ec.vendorOrderId = vo.id
```

### Prevention Rule

**Never use GROUP BY on the outer query when LEFT JOINing to a table that can have multiple rows per key.** Always pre-aggregate in a subquery. This applies even if you "know" the join will produce at most one row — MySQL cannot verify functional dependency through a LEFT JOIN.

### Known Instances

| Date | Location | Impact |
|---|---|---|
| Jul 8, 2026 | `server/routers/expenseCategorisation.ts` getOrders + getStats | Expense Categorisation Tool showed 0/0 for all users; 1,121 pending orders invisible |

