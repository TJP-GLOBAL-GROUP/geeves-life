# Overnight Work Report — Jul 8, 2026

## COMPLETED TASKS

### 1. Expense Categorization Migration (Section 31) ✅
- **Chart of Accounts**: Seeded 112 accounts across 6 verticals (Home & Family, Maxfield Bakery, Maxfield Market, Personal, StartOut, Bohemian Lodges)
- **Walmart Migration**: All 185 walmart_orders linked to existing vendor_orders; 6 expenses migrated from categorizations
- **Categorization Tool Rewired**: Now reads from vendor_orders/vendor_order_items, writes to expenses table, uses chart_of_accounts for category selection (COA dropdown by vertical)
- **Amazon Import**: 701 new orders + 1,439 items imported from CSV into vendor_orders/vendor_order_items
- **Legacy Tables Dropped**: walmart_orders and walmart_order_categorizations removed from DB and code
- **TypeScript**: Compiles clean (0 errors)

### 2. Cancellation Pending Notification Fix (Section 34) ✅
- **Root Cause**: Airbnb ages out old bookings from iCal feed. Our poller detects the UID is gone and sends "Cancellation pending confirmation" email.
- **Fix**: Added check in icalAggregator.ts — if booking.checkOut < now (past booking), skip notification and auto-dismiss. Only notify for FUTURE bookings disappearing.
- **Cleanup**: 72 past pending cancellations auto-dismissed. 2 future ones remain (legitimate).

### 3. Shadow Block Propagation (Section 33) ✅
- **Status Before**: ~11% complete, cron stopped 36hrs ago
- **Root Cause**: Cron not registered as Manus heartbeat; batch size too small (50); Google writes per event causing timeouts
- **Fix**: Batch size increased 50→200; wrote direct SQL backfill script
- **Result**: 89,065 new shadow blocks created (109,206 total). Propagation now at ~88%.
- **Remaining**: 2,440 events skipped (no valid target calendars). Need to re-register as Manus heartbeat.

### 4. Penthouse Dirty Data Audit (Section 35) ✅
- **Root Cause**: Booking.com platform on Penthouse had Morabeza's iCal URL; VRBO platform had Sunset Studio's iCal URL
- **Fix**: Deactivated misassigned platforms. Booking.com: 11 duplicates deleted, 23 reassigned to Morabeza. VRBO: 1 duplicate deleted, 64 reassigned to Sunset Studio.
- **Result**: Penthouse now shows 0 confirmed 2026 bookings, $0 revenue.

### 5. Upcoming Bookings Spinner Fix (Section 37) ✅
- **Root Cause**: Sync button calls node-ical's `fromURL()` which has NO built-in timeout. If iCal URL is unreachable, it hangs indefinitely.
- **Fix**: Added 30-second timeout via Promise.race in fetchAndParseICal
- **Note**: The listBookings query itself works correctly (returns 8 bookings for Artiste's Boutique). The issue was only the Sync button hanging.

## IN PROGRESS / FINDINGS

### 6. Morabeza Booking Investigation (Section 32)
- **Booking Found**: id=k7TTr_Zupf5jshHrupuWG on property nJnk4hr3AxZJZ-RkwhRJy (Morabeza)
- **Details**: checkIn Jul 9 00:00 EDT, checkOut Jul 12 00:00 EDT, bookingStatus=confirmed, totalPrice=null, platformId=BzdKyVJoq_hRS4uaILpqb (Direct Booking)
- **Visibility Issue**: The booking IS in the DB and IS confirmed. It should appear in the upcoming bookings list. The issue may be that the user was looking at the wrong property (Artiste's Boutique) in the screenshot, OR the production deployment hasn't been updated.
- **Dashboard Widget**: Uses trpc.properties.getPropertyDashboard which calls getCompositeBookings. Need to verify this includes the Tarik booking.
- **iCal Blocking**: Need to verify generateOutboundICS includes this booking in the outbound feed.
- **CRUD**: The booking was created via "Add Booking" button (direct booking). Need to verify edit/delete/notes work.

### 7. Property Carousel Reorder (Section 36)
- **Architecture**: WidgetGrid component handles drag-to-reorder for dashboard widgets. Property carousel within the Properties widget uses a separate pagination mechanism (< > arrows).
- **Reorder Mechanism**: property_member_order table stores per-user property sort order. updatePropertyOrder procedure exists. But the UI may not expose the drag handle for reordering properties within the widget.
- **Status**: Need to verify if the reorder UI is actually rendered and if the mutation fires correctly.

### 8. Property Widget Pictures & Map (Section 38)
- **Pictures**: Need to check if property schema has an images/photos field and if the widget renders them.
- **Map**: Property has address field. Need to verify if MapView component is used in property detail/widget.
- **Status**: Not yet investigated in detail.

## KEY DATABASE IDs
- Morabeza property: nJnk4hr3AxZJZ-RkwhRJy
- Tarik's Morabeza booking: k7TTr_Zupf5jshHrupuWG
- Morabeza direct platform: BzdKyVJoq_hRS4uaILpqb
- Artiste's Boutique: ZI2Zy7OuLGYF-vmWOAII-
- Sunset Studio: Ln-_SMF7Nrt1uXsQcdP9C
- Penthouse: (first property in list)
- Owner member: manus-tarik-member-001 (userId=1)
- Owner household: V8lk3KJatvxBTWURf4uo9

## REMAINING WORK
1. Verify Morabeza booking shows in dashboard Gantt (getPropertyDashboard query)
2. Verify outbound ICS includes the Tarik booking
3. Test CRUD on bookings (edit, delete, notes)
4. Fix property carousel reorder UI
5. Implement property pictures in widget
6. Implement map auto-load from address
7. Verify categorization tool works end-to-end with both Walmart and Amazon data
8. Save checkpoint and publish
