# Eniola Test Results Analysis — Bohemian Lodges Property Manager Role

**Date:** July 7, 2026  
**Test Date:** July 4, 2026  
**Results:** 33 PASS / 10 FAIL / 13 N/A (56 steps)

---

## Summary of Failures

| # | Test Step | Expected | What Happened | Root Cause Category |
|---|-----------|----------|---------------|---------------------|
| S3 | Set vertical access rule: read_only, blind calendar, allowed calendars, can request, financial hidden, guest PII hidden | Rule saved with allowedCalendarIds | FAIL | **UI/Permission Config Gap** — the permission configuration UI doesn't support all the granular fields specified |
| TC01-3 | Sidebar shows only Calendar + Dashboard | No Properties, Financials, Constellation, Verticals | FAIL | **Sidebar Filtering Bug** — confirmed in TRUE_BUGS_ANALYSIS (resolvedBottomNavItems computed but not used) |
| TC03-1 | Properties link in sidebar | Link may/may not appear | FAIL | **Same sidebar filtering bug** — restricted member sees nav items they shouldn't |
| TC05-8 | After approval, test user sees busy block for approved event | Approved event appears as busy block | FAIL | **Shadow block propagation gap** — approved booking may not propagate to restricted member's view, OR sync timing issue |
| TC07-2 | Click every visible event — no PII | No guest names, emails, phone numbers | FAIL | **calendar.list leaks data** — confirmed in TRUE_BUGS_ANALYSIS (no vertical filtering on event detail) |
| TC07-3 | Properties page — no guest names, revenue, commission | Guest PII hidden | FAIL | **properties.getById has no access check** — confirmed in TRUE_BUGS_ANALYSIS |
| TC09-2 | No "+ Add Resource" button visible | Add button hidden for non-admins | FAIL | **resources.create allows self-creation** — confirmed in TRUE_BUGS_ANALYSIS (isSelf bypass) + frontend doesn't hide the button |
| TC09-3 | No edit/delete icons on resources | Controls hidden for non-admins | FAIL | **Frontend doesn't conditionally render edit/delete based on role** |
| TC10-2 | Log out via sidebar user menu | Redirected to landing page | FAIL | **Logout UX issue** — possibly the logout button doesn't exist or doesn't work in the sidebar for restricted members |
| TC10-3 | Log back in via "Sign In" | Dashboard loads with restricted view | FAIL | **Dependent on TC10-2** — if logout failed, re-login can't be tested |

---

## Cross-Reference with My Independent Test Findings

| My Finding | Eniola's Confirmation | Status |
|------------|----------------------|--------|
| Sidebar renders unfiltered bottomNavItems | TC01-3 FAIL, TC03-1 FAIL | **CONFIRMED** |
| resources.create allows self-creation (isSelf bypass) | TC09-2 FAIL, TC09-3 FAIL | **CONFIRMED** |
| calendar.list leaks all calendars to restricted members | TC07-2 FAIL | **CONFIRMED** |
| properties.getById has no access check | TC07-3 FAIL | **CONFIRMED** |
| Booking approval missing Google Calendar write | TC05-8 FAIL (approved event not visible) | **LIKELY CONFIRMED** |

---

## New Findings from Eniola (Not in My Analysis)

| Finding | Category | Priority |
|---------|----------|----------|
| S3: Permission config UI doesn't support full granularity (blind calendar, allowed calendars, financial hidden, guest PII hidden) | **Feature Gap** | P1 — the permission model exists in schema but the UI to configure it is incomplete |
| TC10-2/TC10-3: Logout doesn't work from sidebar | **UX Bug** | P2 — may be a missing logout button or broken mutation for restricted members |
| TC10-5 (N/A note): "Not showing busy blocks, just showing the busy state incorrectly" | **UX Bug** | P1 — busy-only masking renders but the visual presentation is confusing/incorrect |

---

## Classification: True Bugs vs. Feature Gaps vs. Design Decisions Needed

### True Bugs (Code is wrong — must fix)

1. **Sidebar filtering** — `resolvedBottomNavItems` computed but never rendered. Fix: use it in the JSX.
2. **Resource add/edit/delete visibility** — Frontend shows controls to non-admins. Fix: conditionally render based on `user.role` or `memberAccess.accessLevel`.
3. **calendar.list data leakage** — Returns full event details to restricted members. Fix: filter by `allowedCalendarIds` and mask fields based on `calendarAccess` level.
4. **properties.getById no access check** — Returns property without verifying membership. Fix: add `allowedCalendarIds` check.
5. **Logout for restricted members** — Sidebar logout button missing or broken. Fix: verify logout mutation is accessible regardless of role.

### Feature Gaps (Design exists but UI not built)

6. **Permission configuration UI (S3)** — The schema supports `calendarAccess`, `allowedCalendarIds`, `financialAccess`, `guestPiiAccess` but the member permissions UI doesn't expose all these fields.
7. **Busy-only masking visual quality (TC10-5)** — The masking works but the visual presentation needs design refinement.

### Design Decisions Needed

8. **Approved booking visibility for restricted members** — When owner approves a booking request from a restricted member, should the event appear on the member's calendar view? If so, as a busy block or with full details (since they created it)?

---

## Recommended Fix Priority

| Priority | Items | Effort |
|----------|-------|--------|
| P0 | Sidebar filtering (#1) | 5 min — swap variable name in JSX |
| P0 | calendar.list access filtering (#3) | 30 min — add vertical/calendar scope filter |
| P0 | properties.getById access check (#4) | 15 min — add allowedCalendarIds guard |
| P1 | Resource controls visibility (#2) | 15 min — conditional render based on role |
| P1 | Permission config UI (#6) | 2-3 hrs — extend the member permissions form |
| P1 | Busy masking visual quality (#7) | 1 hr — design refinement |
| P2 | Logout for restricted members (#5) | 15 min — verify sidebar logout rendering |
| Design | Approved booking visibility (#8) | Decision needed from product owner |
