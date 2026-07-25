# Overnight Work Final Status — Jul 8, 2026 (6:50 AM)

## COMPLETED TASKS

### Section 31: Categorization Tool Migration ✅
- Chart of accounts seeded (112 accounts across 6 verticals)
- Walmart data migrated to vendor_orders + vendor_order_items (185 orders linked)
- 6 categorizations migrated to expenses table
- Router rewired: reads from vendor_orders/vendor_order_items, writes to expenses, uses COA
- UI updated: COA dropdown by vertical replaces free-text
- Amazon data imported (701 new orders, 1439 items from CSV)
- Legacy tables dropped (walmart_orders, walmart_order_categorizations)
- Zero TypeScript errors

### Section 33: Shadow Block Propagation ✅
- Was at 11% (11,548 blocks), cron had stopped 36hrs ago
- Increased batch size to 200, wrote direct SQL backfill script
- Backfill COMPLETE: 89,065 new blocks for user's household (109,206 total)
- 20,253 events processed, 2,440 skipped (no target calendars)
- Still pending: verify blocks appearing on Google Calendar (sync_status='pending')
- Still pending: register propagation-retry as Manus heartbeat schedule

### Section 34: Cancellation Notification Noise ✅
- Found code in icalAggregator.ts
- Added check: if booking.checkOut < now, skip notification (silently keep record)
- Auto-dismissed 72 past-booking pending cancellations (2 future remain correctly)

### Section 35: Penthouse Dirty Data ✅
- Root cause: Booking.com platform had Morabeza's iCal, VRBO had Sunset Studio's iCal
- Deactivated misassigned platforms
- Booking.com: 11 duplicates deleted, 23 reassigned to Morabeza
- VRBO: 1 duplicate deleted, 64 reassigned to Sunset Studio
- Penthouse now shows 0 confirmed 2026 bookings, $0 revenue

## IN PROGRESS / REMAINING

### Section 32: Morabeza Booking Visibility
- CONFIRMED: Tarik Perkins booking EXISTS on Morabeza (id: k7TTr_Zupf5jshHrupuWG)
- Check-in: Jul 9, Check-out: Jul 12, Status: confirmed, Type: booking
- The DB query returns 9 upcoming bookings for Morabeza correctly
- The Properties page filter (bookingType === "booking" && checkIn <= cutoff && checkOut >= nowTs - 86400000) should include it
- The issue is likely that the user's session on production wasn't seeing it because of the Penthouse misassignment (now fixed)
- OR the user was looking at a different property when they reported the issue
- NEED TO VERIFY: user should now see the booking after the Penthouse cleanup

### Section 36: Property Carousel Reorder
- The WidgetGrid (dashboard widget reorder) WORKS — it has drag-to-reorder with "Customise" button
- The PROPERTY carousel within PropertiesWidget is just left/right arrows + swipe
- There IS a propertyMemberOrder table and updatePropertyOrder procedure
- BUT the frontend NEVER calls getPropertyOrder or updatePropertyOrder!
- FIX NEEDED: Wire up propertyMemberOrder to the PropertiesWidget carousel AND add reorder UI to Properties page sidebar
- The Properties page sidebar list has no drag-to-reorder capability

### Section 37: Upcoming Bookings Not Loading
- The DB returns correct data (9 bookings for Morabeza)
- The listBookings procedure works correctly
- The frontend filter logic looks correct
- The user reported it spinning on "The Artiste's Boutique" (id: ZI2Zy7OuLGYF-vmWOAII-)
- Need to check: does Artiste's Boutique have any upcoming bookings?
- Also need to check: is the syncAllPlatforms mutation hanging? (that's what the Sync button triggers)
- The "refresh" spinning could be the sync mutation hanging on iCal fetch

### Section 38: Property Widget Pictures & Map
- Schema has propertyPhotos table (propertyId, url, caption, sortOrder)
- Map component exists at client/src/components/Map.tsx
- Need to check: is there a photo upload UI on the property detail page?
- Need to check: does the property detail view use the Map component with address?

## KEY FINDINGS

### Database Query Results
- Morabeza (nJnk4hr3AxZJZ-RkwhRJy) has 9 upcoming confirmed bookings
- Tarik's booking: Jul 9-12, $0 (null totalPrice), confirmed, bookingType='booking'
- The Artiste's Boutique (ZI2Zy7OuLGYF-vmWOAII-) - need to check its bookings

### Code Architecture
- listBookings: server/routers/properties.ts line 574
- getPropertyBookings: server/db.ts line 1935 (filters by confirmed status + date range)
- Frontend filter: Properties.tsx line 913 (bookingType === "booking" && checkIn <= cutoff && checkOut >= nowTs - 86400000)
- WidgetGrid: client/src/components/WidgetGrid.tsx (458 lines, handles dashboard widget reorder)
- PropertiesWidget: client/src/pages/Home.tsx (around line 1887)
- propertyMemberOrder: drizzle/schema.ts line ~1742
- updatePropertyOrder: server/routers/properties.ts line 1315

### Property IDs
- Penthouse: YiyTtDDIqXx88hD9ZWCo7
- Morabeza: nJnk4hr3AxZJZ-RkwhRJy
- Sunset Studio: Ln-_SMF7Nrt1uXsQcdP9C
- The Artiste's Boutique: ZI2Zy7OuLGYF-vmWOAII-
- Apartment #1: 8W4U2WJg6d4rDN9v7I8-Z
- Apartment #2: RsUUOvqGAX3TgASRzDbGJ
