# Proactive Bug Audit — June 27, 2026

**Scope:** Full codebase scan against all 8 documented patterns in `docs/patterns/ENGINEERING_LESSONS.md`, plus forward-looking scan of all planned features in `docs/GLOBAL_DESIGN.md` §26–28, `docs/PHASE_1.md`, and `todo.md` design items.

**Method:** Static analysis of server routers, db.ts, drizzle/schema.ts, client pages, and design documentation. No runtime testing performed in this pass.

**Result:** 14 live issues confirmed in the current codebase, 8 prospective violations flagged in planned features before they are built.

---

## Summary Table

| Severity | Count | Patterns Hit |
|---|---|---|
| 🔴 Critical (data loss / orphan rows on user action) | 3 | P-01, P-03 |
| 🟠 High (silent failure / wrong data displayed) | 5 | P-01, P-03, P-06 |
| 🟡 Medium (missing UX path / incomplete lifecycle) | 6 | P-01, P-02, P-07 |
| 🔵 Prospective (planned features with pre-identified violations) | 8 | P-01, P-02, P-03, P-08 |

---

## 🔴 Critical Issues

### C-01 — `deleteProperty` leaves 6 orphaned tables (P-01)

**File:** `server/db.ts:1392`

`deleteProperty(id)` executes a single `DELETE FROM properties WHERE id = ?`. It does not touch any of the six tables that reference `propertyId`:

| Orphaned Table | Rows Left Behind |
|---|---|
| `property_platforms` | iCal feed configs, email scrape credentials |
| `property_prep_rules` | Prep day block rules |
| `property_bookings` | All booking history |
| `email_scrape_jobs` | Scrape job history |
| `property_email_tokens` | Gmail OAuth tokens for the property's notification email |
| `devices` | Smart home device associations |

**Impact:** Deleting a property leaves hundreds of orphaned rows that will never be cleaned up. The `property_bookings` orphans will continue to appear in the Gantt and upcoming lists for any query that does not filter by active property. The `property_email_tokens` orphans hold live OAuth credentials.

**Fix required:** `deleteProperty` must cascade-delete all six dependent tables, or the schema must add `ON DELETE CASCADE` foreign key constraints. Given the current Drizzle/MySQL setup, application-level cascade in `db.ts` is the safer path.

---

### C-02 — `deleteHouseholdMember` does not cascade (P-01)

**File:** `server/db.ts:739`, `server/routers/household.ts:494`

`deleteHouseholdMember(id)` sets `status = 'removed'` on the `household_members` row. It does not touch:

- `vertical_member_access` — member retains vertical access rows
- `oauth_tokens` — member's Google tokens remain active and will continue syncing their calendars
- `shadow_blocks` — blocks propagated from the member's calendars remain
- `booking_requests` — pending requests remain in `pending` state
- `vertical_owners` — member remains listed as a vertical owner
- `constellation_members` — member remains in constellation lists

**Impact:** A removed member's Google Calendar continues to sync (their OAuth token is still valid). Their shadow blocks continue to appear on other members' calendars. Their pending booking requests remain open. This is the exact cascade failure described in `docs/GLOBAL_DESIGN.md` §26c and §26h, and it is confirmed as a live gap in the current implementation.

**Fix required:** The `household.remove` procedure must call the full cascade sequence defined in §26c before marking the member as removed.

---

### C-03 — Email date parsing creates local midnight, not UTC midnight (P-03)

**File:** `server/services/bookingEmailScraper.ts:118`, `:127`, `:202`, `:211`

When parsing check-in and check-out dates from booking confirmation emails, the scraper does:

```ts
const d = new Date(checkInMatch[1].replace(/\//g, "-"));
result.checkIn = d.getTime();
```

`new Date("2026-07-03")` (a date-only ISO string) is parsed as **UTC midnight** by the V8 engine. However, `new Date("21 June 2026")` (a natural-language date string, which the regex also matches) is parsed as **local midnight** in the server's timezone. The server runs in UTC on Cloud Run, so this is currently safe — but if the server timezone ever changes, or if the date string format shifts, check-in/check-out dates will be off by one day.

**Fix required:** Normalise all parsed date strings to `YYYY-MM-DD` format before calling `new Date()`, and append `T00:00:00Z` explicitly to force UTC midnight interpretation regardless of server timezone.

---

## 🟠 High Issues

### H-01 — Properties upcoming widget uses `toLocaleDateString` on iCal UTC timestamps (P-03)

**File:** `client/src/pages/Properties.tsx:869`, `:880`

```tsx
const cinDate = new Date(b.checkIn);   // b.checkIn is UTC midnight from iCal
cinDate.toLocaleDateString([], { month: "short", day: "numeric" })  // ← local timezone
```

The `dayLabel()` function at line 806 also uses `d.getTime()` comparison against `new Date()` (local midnight), which will produce wrong "Today"/"Tomorrow" labels for UTC midnight timestamps in EDT.

**Impact:** Check-in and check-out dates in the Properties upcoming widget will display one day early for users in UTC−N timezones (EDT = UTC−4). This is the same class of bug fixed in commits `a46131f` and `bbaad43` for other components, but it was not applied to this widget.

**Fix required:** Apply `utcMidnightToDateStr()` helper to `cinDate` and `coutDate` before display. Update `dayLabel()` to compare UTC date strings instead of local timestamps.

---

### H-02 — `FamilyView` `isToday`/`isTomorrow` helpers use local timezone (P-03)

**File:** `client/src/pages/FamilyView.tsx:63–76`

```ts
function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();  // ← local timezone
}
```

`startTime` on calendar events is stored as UTC milliseconds. `d.getDate()` returns the day in the local timezone. For events that start at or near midnight UTC (e.g., an all-day event at `2026-07-03T00:00:00Z`), this will return `"Jul 2"` in EDT.

**Impact:** All-day events and events near midnight UTC will show the wrong "Today"/"Tomorrow" label in the FamilyView (child/elder interface). This is the primary interface for household members who are not the admin.

**Fix required:** Compare UTC date strings: `d.toISOString().slice(0,10) === new Date().toISOString().slice(0,10)`.

---

### H-03 — Vertical `delete` is soft-delete only with no cascade to linked calendars (P-01)

**File:** `server/routers/verticals.ts:117–124`

`verticals.delete` sets `isActive = false` on the vertical. It does not:

- Unlink calendars assigned to this vertical (`calendars.verticalId` remains set)
- Remove `vertical_member_access` rows for this vertical
- Remove `vertical_visibility` rules referencing this vertical
- Remove `vertical_owners` rows for this vertical

**Impact:** Calendars linked to a deactivated vertical continue to propagate shadow blocks, because `eventPropagation.ts` routes by `verticalId` without checking `isActive`. Events from a "deleted" vertical will still appear in cross-vertical views.

**Fix required:** On vertical soft-delete, null out `calendars.verticalId` for all linked calendars, and soft-delete all `vertical_member_access`, `vertical_visibility`, and `vertical_owners` rows.

---

### H-04 — Booking request approval creates an event but does not write to Google Calendar (P-01 / P-04)

**File:** `server/routers/bookingRequests.ts:116–185`

When a booking request is approved, the procedure creates a local `events` row. It does not call `createGoogleEvent` or trigger propagation via `onEventUpserted`. The approved event exists in the Geeves DB but is invisible in Google Calendar and generates no shadow blocks.

**Impact:** Approved booking requests create a "ghost" event — visible in the Geeves calendar UI but absent from Google Calendar and from all other verticals' shadow block views. The approver's vertical has no awareness of the booking.

**Fix required:** After creating the event row, call `onEventUpserted(createdEventId, householdId)` to trigger propagation, and call `createGoogleEvent` on the target calendar (best-effort, non-fatal).

---

### H-05 — `security.ts` data export uses `ctx.user.memberId` which may be null (P-06)

**File:** `server/routers/security.ts:126–127`

```ts
dbConn.select().from(notes).where(eq(notes.memberId, ctx.user.memberId ?? ""))
```

`ctx.user.memberId` is populated from the `users` table, which is not updated when a user joins a household. The safe pattern (used everywhere else) is `getHouseholdMemberByUserId(ctx.user.id)`. Using `ctx.user.memberId ?? ""` means the data export query silently returns zero rows if `memberId` is null, and the delete operation at line 207–208 silently deletes nothing.

**Impact:** A user who joined via invite (the normal flow) will get an empty data export and their data will not be deleted on account closure. This is a GDPR/CCPA compliance risk.

**Fix required:** Replace `ctx.user.memberId` with `(await db.getHouseholdMemberByUserId(ctx.user.id))?.id` in all security.ts queries.

---

## 🟡 Medium Issues

### M-01 — Booking request admin review has no dedicated page (P-01 / P-07)

**File:** `client/src/pages/CalendarView.tsx:2026`

The only UI for admins to review and respond to booking requests is a panel inside `CalendarView`. There is no dedicated `/booking-requests` page, no sidebar nav entry, and no notification badge for pending requests. An admin who is not actively looking at the calendar has no way to know a request is waiting.

**Impact:** Booking requests can sit unreviewed indefinitely. The member who submitted the request has no visibility into whether it was seen.

**Fix required:** Add a notification badge to the sidebar for pending booking requests (count > 0). Consider a dedicated `/booking-requests` page for admins. Wire `notifyOwner()` when a new request is submitted.

---

### M-02 — `household.remove` has no `leaveHousehold` counterpart for members (P-01)

**File:** `server/routers/household.ts`

`household.members.remove` exists (admin-initiated). `household.leaveHousehold` (member-initiated) does not exist. A member who wants to leave the household has no self-service path. The only option is to ask an admin to remove them, which is both a UX failure and a privacy concern.

**Impact:** Members cannot leave a household voluntarily. This is a P0 gap per `docs/GLOBAL_DESIGN.md` §26h.

---

### M-03 — In-app notification system is designed but not in schema (P-01 prospective)

**File:** `docs/GLOBAL_DESIGN.md §27c`

The `notifications` table is fully designed (id, householdId, memberId, type, title, body, isRead, actionUrl, createdAt, readAt) but does not exist in `drizzle/schema.ts`. Multiple planned features (member join, member leave, new booking, bug report update) depend on this table. Building any of those features without the table first will result in silent notification failures.

**Impact:** When the first notification-dependent feature is built, it will either crash (if it tries to insert into a non-existent table) or silently drop notifications (if it falls back to `notifyOwner()` only).

**Fix required:** Add the `notifications` table to `drizzle/schema.ts` and run `pnpm db:push` before building any feature from the §27b trigger matrix.

---

### M-04 — `deleteProperty` in the UI has no cascade warning (P-07)

**File:** `client/src/pages/Properties.tsx`

The delete button for a property shows a confirmation dialog, but the dialog does not warn the user that deleting a property will remove all associated bookings, platforms, prep rules, and email tokens. Given that `deleteProperty` currently does not cascade (C-01 above), the user believes they are deleting only the property record.

**Fix required:** After C-01 is fixed, update the confirmation dialog to list what will be deleted: "This will permanently delete [Property Name] and all [N] bookings, [N] platforms, and associated data."

---

### M-05 — `bookingRequests.respond` approval does not notify the requestor (P-02)

**File:** `server/routers/bookingRequests.ts:116`

When an admin approves or declines a booking request, no notification is sent to the member who submitted it. The member must manually check the FamilyView to see if their request was actioned.

**Impact:** Members have no feedback loop for booking requests. This breaks the sequential flow: submit → (wait) → notified of decision. Without the notification step, the flow is incomplete.

**Fix required:** After `updateBookingRequest`, call `notifyOwner()` (or the future in-app notification system) targeting the `requestorMemberId`.

---

### M-06 — `FamilyView` booking request list has no empty state message (P-07)

**File:** `client/src/pages/FamilyView.tsx:145`

```tsx
if (isLoading) return <Skeleton className="h-16 w-full rounded-lg" />;
```

There is a loading state but no empty state. When `requests.length === 0`, the component renders nothing — no message, no CTA to submit a request.

**Fix required:** Add an empty state: "No booking requests yet. Tap + to request time on a shared calendar."

---

## 🔵 Prospective Violations (Planned Features)

These are features in the design backlog that, if built without modification, will introduce a known pattern violation.

| ID | Feature | Pattern Risk | Pre-emptive Rule |
|---|---|---|---|
| PV-01 | Bug Reporting System (`bug_reports` table) | P-01: `bug_reports` has Create, Read, Update (status), but no Delete or Archive path for reporters | Define Delete/Archive before building. Reporters should be able to retract a report. Admins should be able to close/archive resolved reports. |
| PV-02 | Notification System (§27) | P-01: `notifications` table has no Delete or mark-all-read procedure in the design | Add `notifications.delete`, `notifications.markAllRead`, and `notifications.clearAll` to the design before building. |
| PV-03 | Direct Booking Request Form (guest-facing) | P-02: Guest submits a request → admin reviews → guest is notified. No failure path if the email notification fails. | Email delivery failure must not block the request from being stored. Use best-effort email + in-app fallback. |
| PV-04 | Account Deletion Grace Period (§26d) | P-02: 30-day grace period requires a scheduled hard-delete job. If the job fails mid-cascade, the account is in a partially-deleted state with no recovery path. | The hard-delete job must be idempotent: re-running it on a partially-deleted account must complete cleanly without errors. |
| PV-05 | Booking Notifications (new/modified/cancelled) | P-03: The notification content will include check-in/check-out dates. These must use UTC date helpers, not `toLocaleDateString`. | All date formatting in notification email templates must use `getUTCDate()`/`getUTCMonth()`/`getUTCFullYear()` or the `utcMidnightToDateStr()` helper. |
| PV-06 | Asana / Google Keep Integration (Phase 2) | P-08: Both APIs have undocumented pagination, rate limits, and field-presence variations. Tasks may have null `due_date`, `assignee`, or `project`. | Write contract tests for the raw API response shape before building the sync logic. Never assume a field is present. |
| PV-07 | Instacart IDP Integration (Phase 2) | P-08: Instacart Developer Platform is a new API with limited public documentation. Cart handoff format, product ID matching, and affiliate link structure are all unvalidated. | Log and validate the raw API response before building the cart URL generation logic. |
| PV-08 | `household.closeHousehold` (§26e) | P-01: The design defines the cascade (all members soft-deactivated, iCal feeds deactivated, webhooks deleted) but does not define what happens to `property_bookings` for future dates. | Define the `property_bookings` handling explicitly: future bookings should be flagged as "household closing" and the iCal feed should return 410 Gone, not silently drop events. |

---

## Recommended Action Order

The following order is recommended based on severity and dependency:

1. **C-02** — Fix `deleteHouseholdMember` cascade (data integrity, GDPR risk)
2. **H-05** — Fix `security.ts` memberId null risk (GDPR/CCPA compliance)
3. **C-01** — Fix `deleteProperty` cascade (data integrity)
4. **M-03** — Add `notifications` table to schema (unblocks 5 planned features)
5. **H-04** — Fix booking request approval → Google Calendar propagation (UX correctness)
6. **M-02** — Add `household.leaveHousehold` procedure (P0 gap per design doc)
7. **H-01 / H-02** — Fix UTC date display in Properties widget and FamilyView (correctness)
8. **H-03** — Fix vertical soft-delete cascade (data integrity)
9. **C-03** — Fix email date parsing to explicit UTC midnight (server-timezone safety)
10. **M-01 / M-05 / M-06** — Booking request notification and UX gaps (completeness)

---

*Generated: June 27, 2026 | Source: Full codebase scan against `docs/patterns/ENGINEERING_LESSONS.md` P-01 through P-08*
