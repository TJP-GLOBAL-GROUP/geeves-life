# Section 19: Eniola Test Result Fixes — Progress Notes

## Completed
1. **Sidebar filtering** — Changed `bottomNavItems.map` to `resolvedBottomNavItems.map` at line 497 of DashboardLayout.tsx
2. **Calendar.list data leakage** — Applied `applyVerticalMemberAccessOverrides` in `calendar.list` procedure so restricted members only see calendars they have access to (full or busy_only)

## Remaining
3. **properties.getById access check** — Need to add allowedCalendarIds guard. The property has a calendarId (via ensurePropertyCalendar). If the member's visible calendar set doesn't include the property's calendar, deny access.
   - File: `server/routers/properties.ts`
   - Look for `getById` or `get` procedure

4. **Resource controls visibility** — Hide add/edit/delete buttons for non-admin members in the Resources UI
   - File: `client/src/pages/Resources.tsx` or wherever resources are rendered
   - Check: `server/routers/resources.ts` line 58 has `isSelf` bypass for create

5. **Logout for restricted members** — TC10-2/TC10-3 failed. Check if the logout mutation or the auth flow has issues for non-admin users.
   - File: `server/routers.ts` or `server/_core/auth.ts`

6. **Approved meeting request visibility** — When a booking request is approved, the requester should see FULL event details (not busy block). Need to check if approved requests create events on the requester's calendar or if there's a special case in events.list.
   - Decision: "The user should see all the information for a meeting request that they submit once it is approved and confirmed by the owner of the calendar."

7. **Permission config UI** — Build full UI to configure calendarAccess, allowedCalendarIds, financialAccess, guestPiiAccess per member per vertical
   - File: `client/src/pages/VerticalAccessMatrix.tsx` likely

8. **Busy-block visual refinement** — TC10-5 note about busy blocks not showing correctly

## Key Data
- Test user (Eniola's restricted account): member ID `XuDU3F9nzWD9-xuL-FqJC`, userId 32940006, email splinter0035@gmail.com
- Has `blind` calendarAccess on Bohemian Lodges, Maxfield Bakery, Home & Family, Maxfield Market
- Has `full` accessLevel on Personal (but still `blind` calendarAccess)
- The `applyVerticalMemberAccessOverrides` function at line 65 of calendar.ts handles the override logic:
  - `none` → remove from both sets
  - `blind` → move to busyOnly
  - `availability_only` → stays in fullAccess but strips guest PII
  - `default_vertical` / `read_write` → no override
