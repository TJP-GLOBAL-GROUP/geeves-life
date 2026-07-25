# Property Manager Role Test Script — Bohemian Lodges (v2.0)

**Prepared for:** Eniola (QA Tester)
**Date:** July 7, 2026
**Version:** 2.0 (Updated with bug fix confirmations + 10 new human tester protocol tests)
**Environment:** https://geeves.life
**Test Account:** splinter0035@gmail.com (restricted member, Bohemian Lodges scope)

---

## Pre-Test Setup (Admin Side — Supah-T)

Before Eniola begins testing, the admin must confirm:

| # | Setup Step | Expected State | Confirmed |
|---|-----------|---------------|-----------|
| S1 | Test user (splinter0035@gmail.com) exists as member in TJ Perkins Global household | Member visible in Constellation Members | |
| S2 | Vertical access rule for Bohemian Lodges: accessLevel=read_only, calendarAccess=blind, canRequestMeetings=ON | Rule saved in vertical_member_access | |
| S3 | Allowed calendars: Morabeza + Sunset Studio only | allowedCalendarIds contains exactly 2 calendar IDs | |
| S4 | No vertical access rules for other verticals (Personal, Maxfield Bakery, etc.) | No other rows in vertical_member_access for this member | |
| S5 | Resource "Apartment Cleaning Form" assigned to test user with vertical=Bohemian Lodges | Resource visible in admin Resources view | |
| S6 | At least one future event exists on the Bohemian Lodges calendar (for busy-block testing) | Event visible in admin calendar view | |

---

## Part 1: Bug Fix Confirmations (From Previous Test Failures)

These tests specifically verify that bugs identified in the July 4, 2026 test run have been fixed.

### BFC-01: Sidebar Navigation Filtering (was TC01-3 FAIL)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Log in as test user (splinter0035@gmail.com) | Dashboard loads | | |
| 2 | Inspect the sidebar navigation items | **Only** Calendar and Dashboard are visible. NO Properties, Financials, Constellation Members, or Verticals links | | |
| 3 | Resize to mobile width and check the bottom navigation bar | Same restriction applies — only permitted items shown | | |

**Previous failure:** Sidebar showed all nav items including admin-only ones. **Fix applied:** Changed `bottomNavItems.map` to `resolvedBottomNavItems.map` in DashboardLayout.tsx.

---

### BFC-02: Calendar Data Leakage Prevention (was TC07-2 FAIL)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar | Calendar view loads | | |
| 2 | Look at all visible events | Events on Bohemian Lodges calendars show as **grey "Busy" blocks** with NO title | | |
| 3 | Click any busy block | Detail shows ONLY "Busy" label. No title, description, attendees, location, or organizer | | |
| 4 | Check that NO events from Personal, Maxfield Bakery, Home & Family, or StartOut calendars are visible | Only Bohemian Lodges busy blocks appear | | |
| 5 | Open DevTools → Network → filter for `/api/trpc` | Inspect the `calendar.events.list` response. Verify no `title`, `description`, `location`, or `attendees` fields contain real data for busy-only events | | |

**Previous failure:** Full event details were returned to restricted members. **Fix applied:** `applyVerticalMemberAccessOverrides` now filters calendar access by vertical rules.

---

### BFC-03: Properties Page Access Control (was TC07-3 FAIL)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Check if Properties link appears in sidebar | Should NOT appear (member role without properties access) | | |
| 2 | If Properties IS accessible, verify only Morabeza and Sunset Studio are shown | No other properties visible | | |
| 3 | If Properties IS accessible, verify NO revenue, commission, or payout figures are shown | Financial data hidden | | |
| 4 | If Properties IS accessible, verify NO guest names or booking reference numbers are shown | Guest PII hidden | | |

**Previous failure:** Properties page showed all data without access checks. **Fix applied:** Added allowedCalendarIds guard to properties router.

---

### BFC-04: Resource Controls Visibility (was TC09-2/TC09-3 FAIL)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Dashboard | Dashboard loads with widgets | | |
| 2 | Locate the Resources widget | Widget is present | | |
| 3 | Verify **"+ Add Resource"** button is NOT visible | No add button for non-admin members | | |
| 4 | Verify NO edit (pencil) or delete (trash) icons appear on resources | Read-only view only | | |
| 5 | Verify "Apartment Cleaning Form" resource IS visible and clickable | Link opens Google Form in new tab | | |

**Previous failure:** Add/edit/delete controls were visible to non-admins. **Fix applied:** ResourcesWidget now conditionally renders controls based on `isAdmin` prop.

---

### BFC-05: Logout Functionality (was TC10-2/TC10-3 FAIL)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Click the user avatar/menu in the sidebar footer | Dropdown menu appears | | |
| 2 | Click **"Sign out"** | User is logged out and redirected to the landing page | | |
| 3 | Verify the landing page shows "Sign In" button | Not stuck on dashboard with stale state | | |
| 4 | Click "Sign In" and log back in | Dashboard reloads with same restricted permissions | | |
| 5 | Verify Resources widget still shows "Apartment Cleaning Form" | Data persists across sessions | | |

**Previous failure:** Logout didn't work or didn't redirect properly for restricted members. **Fix applied:** Logout mutation and redirect behavior verified for all roles.

---

### BFC-06: Busy Block Visual Presentation (was TC10-5 note)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar → Week view | Calendar renders | | |
| 2 | Identify busy blocks | Blocks are clearly styled as "Busy" with grey/muted color | | |
| 3 | Verify busy blocks span the correct time range | Start and end times match the underlying event duration | | |
| 4 | Switch to Month view | Busy blocks render as compact bars with "Busy" text | | |
| 5 | Switch to Day view | Busy blocks render correctly in single-day timeline | | |

**Previous note:** Busy blocks were "showing the busy state incorrectly." **Fix applied:** Visual refinement of busy-block rendering.

---

## Part 2: New Human Tester Protocol Tests (10 Additional Tests)

These tests follow the updated testing protocol that emphasizes interactive UI behavior, state transitions, and edge cases that cannot be caught by automated code review alone.

---

### HTP-01: Input Field Focus Retention — Meeting Request Form

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar and click an empty time slot | "Request Time" dialog opens (NOT "Create Event") | | |
| 2 | Click into the **Title** field | Cursor appears, field has focus | | |
| 3 | Type a full sentence: "Cleaning coordination meeting for Morabeza" | Text appears smoothly, character by character, WITHOUT losing focus | | |
| 4 | Tab to the **Description** field | Focus moves to description textarea | | |
| 5 | Type a multi-line description | Text appears without interruption or focus loss | | |
| 6 | Submit the request | Success toast appears | | |

---

### HTP-02: State Transition — Meeting Request Lifecycle

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Submit a meeting request (from HTP-01) | Toast: "Request submitted" | | |
| 2 | Check if the request appears in your pending requests list | Request visible with "Pending" status | | |
| 3 | **Admin action:** Log in as Supah-T and approve the request | Request status changes to "approved" | | |
| 4 | Log back in as test user | Dashboard loads | | |
| 5 | Navigate to Calendar | Calendar view loads | | |
| 6 | Verify the approved meeting appears with FULL details (title, time, description) | **NOT** shown as a busy block — requester sees their own meeting details | | |
| 7 | Click the approved event | Full event detail dialog shows title, description, time, and location | | |

---

### HTP-03: Cross-Timezone Date Display Accuracy

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar → Week view | Calendar renders with correct timezone | | |
| 2 | Check the greeting bar at the top | Shows correct local time for your timezone | | |
| 3 | If a busy block exists that spans midnight UTC | Block renders on the correct LOCAL date (not shifted by timezone offset) | | |
| 4 | Switch between Day/Week/Month views | Event dates remain consistent across all views (no date shifting) | | |
| 5 | Check any all-day events | All-day events span exactly one day in your local timezone | | |

---

### HTP-04: Permission Boundary Enforcement — Direct URL Access

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | While logged in as test user, manually navigate to `/settings` in the URL bar | Either redirected away OR settings page shows only permitted sections | | |
| 2 | Manually navigate to `/verticals` | Either redirected or access denied — no vertical management visible | | |
| 3 | Manually navigate to `/financials` | Either redirected or access denied — no financial data visible | | |
| 4 | Manually navigate to `/household` (Constellation Members) | Either redirected or access denied — no member management visible | | |
| 5 | Open DevTools Console and attempt: `fetch('/api/trpc/household.members.update', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({json:{memberId:'XuDU3F9nzWD9-xuL-FqJC',role:'household_admin'}})})` | Server returns 403 FORBIDDEN | | |

---

### HTP-05: Widget Interaction — Dashboard Load and Refresh

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Dashboard | All permitted widgets load (Calendar, Resources) | | |
| 2 | Check that NO financial widgets (spending analytics, revenue) are visible | Financial data hidden for restricted members | | |
| 3 | Check that NO other members' personal information is visible | Only your own data shown | | |
| 4 | Hard refresh the page (Ctrl+F5 / Cmd+Shift+R) | Dashboard reloads with same data, no flash of unauthorized content | | |
| 5 | Wait 30 seconds and check if any data changes unexpectedly | Stable state — no flickering or unauthorized data appearing | | |

---

### HTP-06: Real-Time Data Refresh After Mutations

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Open Calendar in one browser tab | Calendar visible | | |
| 2 | Submit a meeting request in that tab | Request submitted successfully | | |
| 3 | Check if the calendar view updates to show the pending request indicator | UI reflects the new request without manual refresh | | |
| 4 | Open a second browser tab to the same Calendar page | Both tabs show consistent state | | |
| 5 | If admin approves the request while you're watching, does the calendar update? | Event should appear within a few seconds (Socket.io real-time) | | |

---

### HTP-07: Error State Recovery — Network Interruption

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar | Calendar loads normally | | |
| 2 | Open DevTools → Network → check "Offline" | Network disconnected | | |
| 3 | Try to click a busy block | Error state shown gracefully (not a blank crash) | | |
| 4 | Try to submit a meeting request | Error toast or inline error message (not silent failure) | | |
| 5 | Uncheck "Offline" and retry the action | Action succeeds on retry without needing to reload the page | | |

---

### HTP-08: Empty State Rendering — No Data Scenarios

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Navigate to Calendar and go to a date far in the future (e.g., December 2027) | Calendar renders with no events | | |
| 2 | Verify the empty calendar shows a clean state | No broken layout, no "undefined" text, no loading spinner stuck | | |
| 3 | Check the Resources widget if no resources are assigned | Should show "No resources" or similar empty state message | | |
| 4 | Check any list/table views with no data | Empty state message or illustration, not a blank white space | | |

---

### HTP-09: Accessibility — Keyboard Navigation

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Press Tab repeatedly from the top of the page | Focus moves through interactive elements in logical order | | |
| 2 | Navigate to a busy block using keyboard only | Block receives visible focus ring | | |
| 3 | Press Enter on a focused busy block | Event detail dialog opens | | |
| 4 | Press Escape to close the dialog | Dialog closes, focus returns to the block | | |
| 5 | Navigate the sidebar using keyboard | All nav items are reachable via Tab/Arrow keys | | |
| 6 | Activate the "Sign out" button using keyboard only | Logout works via keyboard (Enter or Space) | | |

---

### HTP-10: Mobile Touch Interaction and Responsive Layout

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| 1 | Open Geeves.Life on a mobile device (or resize browser to 375px width) | Layout adapts to single-column mobile view | | |
| 2 | Tap the hamburger menu icon | Sidebar slides in as overlay | | |
| 3 | Tap a navigation item (e.g., Calendar) | Sidebar auto-closes, page navigates | | |
| 4 | In Calendar, tap a busy block | Event detail opens (not a misfire on adjacent elements) | | |
| 5 | Verify all text is readable without horizontal scrolling | No content overflows the viewport | | |
| 6 | Verify all buttons have adequate touch targets (at least 44x44px) | No tiny buttons that are hard to tap | | |
| 7 | Long-press on a busy block | No unexpected context menu or selection behavior | | |

---

## Reporting Instructions

### For each test case:
- Mark **Pass** if behavior matches expected result exactly
- Mark **Fail** with a description of what actually happened
- Mark **Partial** if some aspects pass but others don't
- Include screenshots for any failures (especially data leakage or permission violations)

### Priority escalation:
- **P0 (Immediate):** Any data leakage (guest names, financial data, event details visible to restricted user)
- **P0 (Immediate):** Any permission bypass (admin actions accessible to restricted user)
- **P1 (High):** Focus loss, state corruption, or data loss during normal interaction
- **P2 (Medium):** Visual/layout issues, empty state problems, accessibility gaps

### Submit results to: Supah-T before the 5:30 AM ET check-in call

---

## Test Environment Notes

- The webhook error `Failed to register webhook for calendar 08YEHqmboSnz_miBqTo6L: 403` is a **known pre-existing issue** caused by an expired OAuth token. It does not affect the test user's experience.
- Shadow block write-back to Google Calendar requires reconnected OAuth tokens — this is a known limitation.
- If the test user sees NO busy blocks at all, this may indicate a sync timing issue rather than a code bug. Try refreshing after 30 seconds.
