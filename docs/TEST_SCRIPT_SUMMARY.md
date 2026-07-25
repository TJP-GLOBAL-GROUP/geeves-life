# Test Script Summary — For Independent Execution

## Two Test Scripts Exist:

### 1. morning-test-script-2026-06-25.md (Owner-focused, 8 tests)
1. iCal Sync heartbeat verification (SuperAdmin → Sync Status)
2. Gantt Financial Summary Row (Properties widget)
3. Stale Data Banner dismiss fix
4. MonthView +N Overflow Chip
5. Settings Property Booking Calendars section
6. Landing Page Logo on mobile
7. VRBO Inactive Listing audit
8. SuperAdmin Sync Status full matrix

### 2. eniola-testing-guide.md (EA/Member-focused, 5 sections)
1. Outbound iCal Setup (3 properties × 3 platforms)
2. Sunday & Holiday Prep Rule Verification (17 test cases across 3 properties)
3. Email Scraping Status Check
4. New Member Flow (Invite Cary, accept, verify access)
5. Member Permissions Verification (owner side)

## What I Can Test Independently (Backend/API):

From the morning test script:
- ✅ iCal sync status (query DB for lastPolledAt timestamps)
- ✅ Gantt financial data (query property_bookings for financial fields)
- ✅ Property booking calendars (query calendars where provider=ical)
- ✅ VRBO inactive listing (query property_platforms for isActive)
- ✅ Sync status matrix (query all property_platforms with poll status)

From the eniola testing guide:
- ✅ Outbound ICS URLs accessible (HTTP GET)
- ✅ Prep rule verification (query outbound ICS content for BLOCKED events)
- ✅ Email scraping status (query property_bookings for guest/financial data)
- ✅ Member permissions (query household_members, vertical_member_access)
- ❌ Cannot test: UI rendering, mobile layout, click interactions, OAuth flows

## Additional Backend Tests I Should Run:
- All vitest tests (pnpm test)
- TypeScript compilation (0 errors confirmed)
- tRPC procedure smoke tests (household.removeMember, leaveHousehold, properties.getDeleteImpact)
- Schema integrity (all new tables exist with correct columns)
- Data migration verification (vendor_orders count, vendor_order_items count)
- Notification table exists and is queryable
- Expenses split columns exist
- Audit log enhanced columns work
