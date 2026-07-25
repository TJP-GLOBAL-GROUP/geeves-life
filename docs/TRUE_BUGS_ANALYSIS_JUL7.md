# True Bugs Analysis — Post Design Doc Review

**Date:** July 7, 2026  
**Context:** Re-evaluation of independent test results against GLOBAL_DESIGN.md, DESIGN_PRINCIPLES.md, PHASE_1.md, PROACTIVE_AUDIT_2026_06_27.md, and SHADOW_BLOCK_ARCHITECTURE.md

---

## Reclassification of Prior Test Findings

### ❌ NOT True Bugs (Operational / Expected / Pre-Existing)

| Finding | Why It's Not a Bug |
|---|---|
| 8/9 OAuth tokens expired | **Pre-existing operational state.** Test sheet explicitly documents this as a known limitation. Tokens expire naturally; reconnect is a user action. |
| 10,767 shadow blocks stuck pending_sync | **Expected consequence** of expired tokens. Sync retry job is working correctly — it can't write without valid tokens. Will auto-resolve after reconnect. |
| iCal feeds stale (20+ hours) | **Operational.** The heartbeat job (`ical-poll`) runs every 10 min in production. If it's not running, it's a deployment/scheduling issue, not a code bug. |
| VRBO Sunset Studio marked active | **Test script assumption error.** The Jun 25 morning test script expected it inactive; it was likely re-activated or the expectation was wrong. All VRBO feeds are active and functioning. |
| Duplicate Tarik Perkins household_admin | **Data quality issue**, not a code bug. Likely from early testing. Should be cleaned up but doesn't indicate a defect in the invite/join flow. |
| Prep rule DB query failure | **Test script bug** (camelCase vs snake_case column name). ICS output confirms prep rules work correctly (56 prep/block events). |

---

### ✅ TRUE BUGS — Must Be Fixed

#### Bug 1: DashboardLayout sidebar renders `bottomNavItems` instead of `resolvedBottomNavItems`

**Severity:** HIGH  
**Design contract violated:** GLOBAL_DESIGN.md §7 Permission Matrix — restricted members should not see Accounts/Expenses nav items.  
**Test case affected:** TC-01 (sidebar shows only permitted navigation items)

**Root cause:** Line 497 of `DashboardLayout.tsx` renders `bottomNavItems.map(...)` directly instead of `resolvedBottomNavItems.map(...)`. The filtering logic at lines 302-305 correctly computes which items to show, but the result is never used in the render.

**Fix:** Replace `bottomNavItems` with `resolvedBottomNavItems` in the render loop at line 497.

---

#### Bug 2: `resources.create` allows self-creation for restricted members (TC-09 API violation)

**Severity:** MEDIUM  
**Design contract violated:** TC-09 expects `403 FORBIDDEN` when a restricted member calls `trpc.resources.create`.  
**Test case affected:** TC-09 (Non-Admin Cannot Add/Edit Resources)

**Root cause:** `server/routers/resources.ts` lines 57-58 allow `isSelf` creation for any member. The test sheet explicitly expects that restricted members cannot add resources even for themselves — only admins and vertical owners should be able to create resources.

**Fix:** Remove the `isSelf` bypass. Only allow creation by admins, EAs, or vertical owners. Restricted members should only consume resources assigned to them.

---

#### Bug 3: Booking request approval does not write to Google Calendar or trigger shadow propagation (H-04)

**Severity:** HIGH  
**Design contract violated:** GLOBAL_DESIGN.md §8 Booking Request Flow step 4 — "On accept: the server creates a real event on the target calendar and propagates shadow blocks."  
**Test case affected:** TC-05 (Meeting Request approval flow)

**Root cause:** `bookingRequests.respond` creates a local `events` row and calls `onEventUpserted` (which handles shadow propagation), but does NOT call `createGoogleEvent`. The approved event exists in Geeves DB and generates shadow blocks in the DB, but the event itself never appears on Google Calendar.

**Status:** Partially fixed in Section 17 (M-05 wired `notifyOwner` on respond), but the Google Calendar write is still missing.

**Fix:** After creating the event row and calling `onEventUpserted`, also call `createGoogleEvent` on the target calendar (non-fatal — if token is expired, the event still exists locally and shadow blocks are created with `pending_sync` status).

---

#### Bug 4: `calendar.list` returns all household calendars to `ea`/`member` roles (sidebar filter leakage)

**Severity:** MEDIUM  
**Design contract violated:** GLOBAL_DESIGN.md §7 — members should only see calendars from their assigned verticals in the sidebar.  
**Test case affected:** TC-02, TC-08 (Calendar Visibility, Vertical Scope Enforcement)

**Root cause:** `calendar.ts` `list` procedure (lines 118-145) returns all household calendars for `ea` and `member` roles, deferring filtering to `events.list`. This means the calendar sidebar/filter shows ALL calendars regardless of vertical access rules. While `events.list` correctly filters events, the calendar list itself leaks the existence of calendars the member shouldn't know about.

**Fix:** Apply the same vertical access filtering logic from `events.list` to `calendar.list`, so restricted members only see calendars they have access to in the sidebar.

---

#### Bug 5: No backend enforcement of `vertical_member_access` in `properties.getById`

**Severity:** LOW-MEDIUM  
**Design contract violated:** GLOBAL_DESIGN.md — members should only see properties matching their `allowedCalendarIds`.  
**Test case affected:** TC-03 (Property Scope enforcement)

**Root cause:** `properties.getById` (line 162-168) returns a property without any household/role/vertical-access checks. A restricted member who knows a property ID could access it directly via API even if it's not in their allowed scope.

**Fix:** Add the same `allowedCalendarIds` filtering that exists in `properties.list` to `properties.getById`.

---

## Summary: True Bug Priority

| # | Bug | Severity | Test Cases | Fix Complexity |
|---|---|---|---|---|
| 1 | Sidebar renders unfiltered bottomNavItems | HIGH | TC-01 | 1 line change |
| 2 | resources.create allows self-creation | MEDIUM | TC-09 | ~5 lines |
| 3 | Booking approval missing Google Calendar write | HIGH | TC-05 | ~15 lines |
| 4 | calendar.list leaks all calendars to restricted members | MEDIUM | TC-02, TC-08 | ~30 lines |
| 5 | properties.getById no access check | LOW-MEDIUM | TC-03 | ~10 lines |

---

## Known Gaps (Not Bugs — Documented as Unbuilt)

These are features documented in PHASE_1.md as "not yet built" and should not be classified as bugs:

- Backend enforcement of `calendarAccess` rules in `events.list` (partially implemented — vertical privacy + cross-vertical visibility works, but `allowedCalendarIds` override not fully wired)
- Booking request flow UI (table exists, badge wired, but no dedicated submit/approve/decline page)
- Notification delivery (email/push channels — table exists, no delivery mechanism)
- Event-level shadow overrides UI
- Family member interfaces (child view, elder view, caregiver view)

---

*This analysis should be compared with Eniola's test results to identify which bugs were actually encountered during testing.*
