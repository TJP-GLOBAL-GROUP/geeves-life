# Property Manager Test Sheet Review Notes

Source: `/home/ubuntu/upload/Test_Sheet__Property_Manager_Role_—_Bohemian_Lodge.pdf`
Reviewed pages: 1-5 of 11

## Context captured from the test sheet

- Test sheet title: **Property Manager Role — Bohemian Lodges**
- Prepared for: **Eniola**
- Date: **July 2, 2026**
- Vertical under test: **Bohemian Lodges** with explicit vertical ID shown in the PDF
- Properties in scope: **Morabeza** and **Sunset Studio**
- Test account role: **member** with property-manager-style scoping to Bohemian Lodges only

## Pre-test setup checklist captured

### S1
Invite the test user via **Constellation Members → Invite** with role `member`.
Expected result: invitation email sent and test user appears as invited.

### S2
After acceptance, open the test user's member card and open the **Permissions** tab.
Expected result: permissions tab visible.

### S3
Under **Vertical Access**, add a rule for **Bohemian Lodges** with:
- Access Level = `read_only`
- Calendar Access = `blind` (busy only)
- Allowed Calendars = `Morabeza` + `Sunset Studio` only
- Can Request Meetings = `ON`
- Financial = `hidden`
- Guest PII = `hidden`
Expected result: rule saved and allowed calendar IDs contain the two specified calendars.

### S4
Ensure no vertical access rules exist for any other vertical.
Expected result: no other vertical rows.

### S5
Open the test user's member card → **More → Resources** tab.
Expected result: **ResourcesWidget renders** and is not a stub.

### S6
Add a resource with:
- Title = `Apartment Cleaning Form`
- URL = pasted Google Form URL
- Type = `Form`
- Vertical = `Bohemian Lodges`
Expected result: resource appears in list with a purple Form badge.

### S7
Confirm the resource is saved and visible.
Expected result: cleaning form link visible with correct title and type.

## Test cases captured from pages 1-5

### TC-01 — Account Creation and Login
Objective: verify invited test user can create an account and land on the correct dashboard.

Expected checks:
1. Invitation link opens accept page.
2. Clicking **Accept Invitation** and completing Manus OAuth redirects to Geeves.Life dashboard.
3. Sidebar shows only permitted navigation items: **Calendar** and **Dashboard**; specifically no Properties admin, no Financials, no Constellation Members, no new Verticals.
4. Greeting bar shows the test user's display name correctly.

Important note from the sheet:
- If any admin-only sidebar items appear, log the item name and capture a screenshot.

### TC-02 — Calendar Visibility: Busy-Only Masking
Objective: verify the test user sees only busy blocks on the owner calendar.

Expected checks:
1. Calendar view loads.
2. Events on Bohemian Lodges calendars show as grey **Busy** blocks with no title.
3. Clicking a busy block shows only `Busy` label, with no title, description, attendees, or location.
4. No events from other household calendars (Personal, Business, etc.) are visible.
5. Busy blocks render correctly in both **Week** and **Month** views.

Critical note from the sheet:
- If any event title or description is visible on a block belonging to the owner's personal or business calendar, that is a **data leak** and must be flagged immediately.

### TC-03 — Property Scope: Only Morabeza and Sunset Studio Visible
Objective: verify the Properties view, if accessible for the member role, shows only the two allowed properties.

Expected checks:
1. Check if a **Properties** link appears in the sidebar. The sheet notes this may or may not appear depending on role permissions.
2. If visible, navigating to Properties should show only **Morabeza** and **Sunset Studio**.
3. No other properties should appear.
4. No revenue figures, commission amounts, or payout totals should be shown.
5. No guest names or booking reference numbers should be visible.

Important note from the sheet:
- If the Properties page is not accessible to the `member` role, mark TC-03 as **N/A** and treat that as correct gating.

### TC-04 — Resources Widget: Cleaning Form Link Visible
Objective: verify the test user can see the Apartment Cleaning Form resource and open the Google Form.

Expected checks:
1. Dashboard loads.
2. Resources widget is present.
3. Resource list contains **Apartment Cleaning Form** with correct title/type.
4. External link opens the Google Form in a new tab.
5. The form renders and is accessible.
6. No other resources from unrelated members or verticals are visible.

Important note from the sheet:
- The Resources widget on the dashboard uses the same `trpc.resources.list` query scoped to the logged-in member.
- If the widget is missing, verify whether it has been added to the `Home.tsx` dashboard layout.

### TC-05 — Meeting Request: Request Time on Owner Calendar
Objective: verify the test user can request time on the owner's calendar and that the request appears in the owner's review queue.

Expected checks captured from visible portion:
1. Navigate to Calendar.
2. Find an empty future time slot.
3. Clicking the slot should open **Request Time** dialog, not **Create Event**.
4. Fill in title/text; Meeting Request preselected; vertical = Bohemian Lodges; confirm dates/times.
5. Submit request and receive success toast: `Request submitted`.
6. Log in as owner (Tarik) and verify the pending request appears.

## Design assumptions implied by the test sheet

The test sheet suggests the intended product behavior includes:
- Role-aware sidebar navigation
- True vertical-scoped member access
- Blind calendar visibility mode with strong privacy masking
- Property-level visibility restrictions layered on top of vertical access
- Scoped resources widget behavior
- Request-time flow on calendars for members with request permission

## Immediate review implication

My prior independent test results should be re-evaluated against these intended behaviors before classifying issues as real bugs, especially for:
- member-role sidebar visibility
- calendar masking/privacy behavior
- properties page gating vs visibility
- resources widget presence/scoping
- meeting request flow behavior
- VRBO/iCal expectations that may be operational rather than product bugs

## Open items still to review

- Remaining pages 6-11 of the PDF
- Full design docs across the project
- Prior independent test report, to distinguish true product bugs from test-script mismatches or operational/account-state issues


## Additional findings from pages 6-10

### TC-05 continued — Meeting Request approval flow
Additional expected checks captured:
7. Owner clicks **Approve** in Calendar → Booking Requests.
   - Expected result: request status changes to `approved`; event appears on the Bohemian Lodges calendar.
8. Test user logs back in and checks Calendar.
   - Expected result: approved event appears as a **busy block** on the calendar.

Important design note from the sheet:
- The **Request Time** button should only appear for roles `member`, `caregiver`, `child`, and `elder`.
- If the test user instead sees a **Create Event** button, the likely design issue is that `isRequestOnly` is not being set correctly from `myMemberRole` / `getMyHousehold`.

### TC-06 — Attempt to Request Time on a Blocked Slot (Negative Test)
Objective: the system must reject a meeting request that overlaps an existing busy block.

Expected checks:
1. Navigate to Calendar and identify a busy block.
2. Click the busy block's time slot and attempt to submit a request for the same time.
3. On submit, show error toast equivalent to: `That time slot is not available — there is already an event in that window`.
4. Owner's booking request queue remains unchanged.

### TC-07 — No PII or Financial Data Exposure (Cross-Check)
This is identified by the sheet as the **most critical test**.

Expected checks:
1. Navigate every visible page/section available to the restricted user.
2. In Calendar, click every visible event.
   - No guest names, email addresses, phone numbers, or booking confirmation numbers may be visible.
3. In Properties, if accessible, inspect all booking rows.
   - No guest names, total revenue, commission, or net payout figures may be visible.
4. On Dashboard, inspect all widgets.
   - No financial summary figures and no other members' personal details may be visible.
5. Open DevTools → Network and inspect raw `/api/trpc` responses.
   - No `guestName`, `totalPrice`, `commissionAmount`, `netAmount`, or similar sensitive raw values should be returned.

Critical interpretation:
- This test explicitly distinguishes **UI masking** from **API-level security**.
- If the UI hides data but `/api/trpc` still returns it, the system still fails.

### TC-08 — Vertical Scope Enforcement (Negative Test)
Objective: verify the test user cannot access or request time on verticals without an access rule.

Expected checks:
1. Navigate to Calendar and open the **Request Time** dialog on a free slot.
2. Inspect the **Whose calendar?** dropdown.
   - Only **Bohemian Lodges** should appear.
   - No Personal, Business, or other verticals should appear.
3. Attempt direct API call to `trpc.bookingRequests.create` using a non-Bohemian-Lodges `targetVerticalId` via DevTools or Postman.
   - Expected result: server returns **403 FORBIDDEN** with a denial message.

### TC-09 — Resource Widget: Non-Admin Cannot Add/Edit Resources
Objective: restricted member can read assigned resources only.

Expected checks:
1. Navigate to Dashboard → Resources widget.
2. Confirm **+ Add Resource** button is not visible.
3. Confirm no edit (pencil) or delete (trash) icons are visible on resources.
4. Attempt direct call to `trpc.resources.create` via DevTools.
   - Expected result: **403 FORBIDDEN**.

### TC-10 — Session Persistence and Re-login
Objective: permissions survive refresh and re-login.

Expected checks:
1. Hard refresh while logged in.
   - Dashboard reloads with same permissions.
2. Logout via sidebar menu.
   - Redirected to Geeves.Life landing page.
3. Log back in via **Sign In**.
   - Dashboard reloads with same restricted view.
4. Resources widget still shows **Apartment Cleaning Form**.
5. Calendar still shows only busy blocks with no data leakage.

## Recommended additional tests in the sheet

### A. Multi-device concurrency
- Same user logged in on two browsers.
- Submit a meeting request on one and verify near-real-time calendar state on the other.
- Rationale: validates restricted-role realtime broadcast behavior, not just admin flows.

### B. Invitation link expiry
- Re-send invite and then attempt to use the original first invite link.
- Expected design: invitation tokens are single-use; old token must fail cleanly without duplicate account/member creation.

### C. Role escalation attempt
- Authenticated restricted member attempts `trpc.household.members.update` with role `household_admin`.
- Expected design: server rejects with **FORBIDDEN**.

### D. Calendar filter persistence across views
- Switch between Day, Week, Month, Gantt.
- Allowed-calendars filter must persist consistently in all views.

### E. Declined meeting request UX
- Submit request, owner declines with response note, test user logs back in.
- Expected design: declined status and note visible in test user's request history.

## Known limitations documented in the sheet

1. **Google Calendar webhook registration fails with 403** for a specific calendar.
   - Marked as **pre-existing**, caused by expired OAuth token.
   - Impact note: busy blocks for that calendar may not update in real time; manual refresh may still work.

2. **Shadow block write-back to Google Calendar requires reconnected OAuth tokens**.
   - Marked as **pre-existing**.
   - Impact note: approved meeting requests will appear in Geeves.Life but may not propagate to the owner's Google Calendar until tokens are reconnected.

3. **`canRequestMeetings` defaults to true when no vertical access rule exists**.
   - Marked in the sheet as **by design / known limitation at time of testing**.
   - This is highly relevant when interpreting failures in request-time flows.

## Relevance to bug triage

These pages materially change how the earlier independent test results should be interpreted:

- Expired OAuth tokens and Google write-back failures are explicitly documented as **pre-existing operational limitations**, not newly discovered application bugs.
- Vertical-scope enforcement, role-gated navigation, and API-level restricted data exposure are core product guarantees and should be prioritized as real bugs if violated.
- The browser-based test pass must include both UI checks and network-response checks, not just visible rendering.

Source: `/home/ubuntu/upload/Test_Sheet__Property_Manager_Role_—_Bohemian_Lodge.pdf`, pages 6-10.

