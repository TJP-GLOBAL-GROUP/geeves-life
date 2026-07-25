# Overnight Work Notes — Jul 8, 2026

## Section 31: Categorization Migration — STATUS: MOSTLY COMPLETE

### Completed:
- [x] Chart of accounts seeded: 112 accounts across 6 verticals
- [x] Walmart data migrated: all 185 walmart_orders linked to existing vendor_orders
- [x] 6 categorizations migrated to expenses table
- [x] Router rewired: reads from vendor_orders/vendor_order_items, writes to expenses, uses chart_of_accounts
- [x] UI updated: COA dropdown by vertical replaces free-text
- [x] Amazon data backfilled: 701 new orders + 1439 items from CSV (total 829 Amazon orders)
- [x] Legacy tables dropped: walmart_orders, walmart_order_categorizations
- [x] drizzle/relations.ts cleaned

### Remaining:
- [ ] Verify categorization tool works end-to-end (test via browser)
- [ ] Verify bank account assignment
- [ ] Verify COA dropdown populated correctly per vertical

## Section 32: Morabeza Booking Investigation

### Findings:
- Property ID: nJnk4hr3AxZJZ-RkwhRJy
- Booking found in DB: id=k7TTr_Zupf5jshHrupuWG
  - guestName: Tarik Perkins
  - checkIn: 1783569600000 = 2026-07-09T04:00:00Z (Jul 9 midnight EDT)
  - checkOut: 1783828800000 = 2026-07-12T04:00:00Z (Jul 12 midnight EDT)
  - bookingStatus: confirmed
  - bookingType: booking
  - platformId: BzdKyVJoq_hRS4uaILpqb (Direct Booking platform)
  - totalPrice: null (user set $0 revenue)
  - dataSource: ical_only
  - description: "Tarik and the boys"
  - guestCount: 3
  - icalUid: geeves-direct-k7TTr_Zupf5jshHrupuWG
  - Created: 2026-07-07T21:08:29.000Z

### Analysis:
- The booking IS in the database with correct data
- The query logic (listBookings) should return it: bookingStatus=confirmed, dates in range
- The upcoming filter should include it: bookingType=booking, checkIn <= cutoff, checkOut >= nowTs-1day
- The Gantt should show it via the upcoming array
- NO policy restrictions for household_admin
- HYPOTHESIS: Possible client-side caching issue, or the user needs to refresh the page
- Need to verify via browser that the booking actually renders

### Platforms on Morabeza:
1. Direct Booking (id: BzdKyVJoq_hRS4uaILpqb) — no iCal URL
2. Airbnb (id: eCyaTlnIhCUPtE57tQ26u) — has iCal feed, last polled Jul 5

### iCal Blocking Check:
- The booking has icalUid: geeves-direct-k7TTr_Zupf5jshHrupuWG
- Need to check: does generateOutboundICS include direct bookings?
- The outbound ICS should block dates on Airbnb/VRBO/Booking.com
- Need to verify the outbound ICS generation includes this booking

## Section 33: Shadow Block Propagation
- Need to check current progress (was at 11%)
- Need to identify bottleneck and safely increase throughput

## Section 34: Cancellation Pending Notification Noise

### Problem:
- User receiving "Cancellation pending confirmation" emails for OLD bookings
- These are past Airbnb bookings (2024-2025 dates) that naturally aged out of the iCal feed
- The iCal poller detects UID removal → triggers pending cancellation → sends notification
- This is correct behavior for FUTURE bookings but noise for PAST bookings

### Bookings triggering notifications (all past):
- Airbnb — Gayatri (2024-08-30 to 2024-08-31)
- Airbnb Reservation (2024-06-23 to 2024-06-26)
- Airbnb — Alyssa (2024-10-11 to 2024-10-14)
- Airbnb — Abby (2024-10-03 to 2024-10-06)
- Airbnb — Shangeeta (2024-10-14 to 2024-10-16)
- Airbnb — Richard (2024-09-07 to 2024-09-14)
- Airbnb — JENELLE (2025-06-20 to 2025-06-22)
- Airbnb — Dajana (2025-02-12 to 2025-02-22)
- Airbnb — Jorge Miguel Olivera Dominguez (2020-05-09 to 2020-05-13)
- Airbnb — Elaine (2024-09-26 to 2024-09-29)
- Airbnb — Ken Grieve (2026-04-14 to 2026-04-21)
- Airbnb — Tarik (2026-04-11 to 2026-04-14)
- Airbnb — Sherry (2024-10-17 to 2024-10-20)

### Fix:
- Find the code that sends "Cancellation pending confirmation" notification
- Add check: if booking.checkOut < now (past booking), skip notification
- Silently keep the booking record (which is already the behavior)
- Only notify for FUTURE bookings disappearing from iCal (real cancellations)
- Location: likely in icalAggregator.ts or the iCal poll handler
