# Overnight Work Status — Jul 8, 2026 (Final)

## COMPLETED

### Section 31: Categorization Migration
- [x] Chart of accounts seeded (112 accounts across 6 verticals)
- [x] Walmart data migrated to vendor_orders/vendor_order_items (185 orders linked)
- [x] Categorization expenses migrated (6 expenses created)
- [x] Router rewired: reads from vendor_orders, writes to expenses, uses chart_of_accounts
- [x] UI updated: COA dropdown by vertical replaces free-text
- [x] Amazon data imported (701 orders, 1439 items from CSV)
- [x] Legacy tables dropped (walmart_orders, walmart_order_categorizations)
- [x] TypeScript compiles clean (0 errors)

### Section 34: Cancellation Notification Noise
- [x] Found code in icalAggregator.ts line 738
- [x] Added check: if booking.checkOut < now, skip notification (past booking aged out)
- [x] Auto-dismissed 72 pending cancellations for past bookings (2 future remain)

### Section 35: Penthouse Dirty Data
- [x] Root cause: Booking.com platform had Morabeza iCal URL, VRBO had Sunset Studio iCal
- [x] Deactivated misassigned platforms on Penthouse
- [x] Booking.com: 11 duplicates deleted, 23 reassigned to Morabeza
- [x] VRBO: 1 duplicate deleted, 64 reassigned to Sunset Studio
- [x] Penthouse now shows 0 confirmed 2026 bookings, $0 revenue

### Section 33: Shadow Block Propagation
- [x] Direct SQL backfill completed: 89,065 new shadow blocks created
- [x] Total shadow blocks now: 109,206
- [x] Propagation batch size increased 50→200
- [x] Cleared 8,839 stale queue items
- [ ] Still need to verify blocks appear on user's calendar (user needs to check)
- [ ] Need to register propagation-retry as proper Manus heartbeat schedule

### Section 37: Upcoming Bookings Fix
- [x] Root cause: Sync button calls iCal fetch (node-ical fromURL) with no timeout
- [x] Fix: Added 30s timeout to fetchAndParseICal using AbortController
- [x] Verified: listBookings query returns correct data (8 bookings for Artiste's Boutique)
- [x] Tarik's Morabeza booking IS in DB and IS returned by composite query
- [ ] Needs publish to take effect on production

### Booking CRUD Enhancement
- [x] Added checkIn, checkOut, notes fields to updateBookingFinancials procedure
- [x] Regenerates outbound ICS when dates change
- [x] Fixed outbound ICS to only include confirmed bookings (was including cancelled)
- CRUD status:
  - CREATE: ✅ createManualBooking (with guest details, notes, financials)
  - READ: ✅ listBookings, getPropertyDashboard, getCompositeBookings
  - UPDATE: ✅ updateBookingFinancials (now includes dates + notes)
  - DELETE: ✅ cancelManualBooking (soft cancel)

## IN PROGRESS / REMAINING

### Section 32: Morabeza Booking Investigation
- Tarik's booking (Jul 9-12) IS in the database, IS confirmed, IS returned by queries
- Dashboard widget was showing Penthouse (first in carousel) not Morabeza
- The booking WILL appear when user navigates to Morabeza in the carousel
- iCal outbound: generateOutboundICS includes the booking (creates BUSY event)
- Issue is likely that outbound ICS wasn't regenerated after the booking was created
- FIX NEEDED: Call generateOutboundICS for Morabeza after confirming booking exists

### Section 36: Property Carousel Reorder
- BUG CONFIRMED: Backend has getPropertyOrder/updatePropertyOrder procedures
- Frontend NEVER calls them — properties display in DB order
- getMyHousehold returns { household, member, isAdmin, subscription }
- member.id is available as householdQuery.data?.member?.id
- FIX NEEDED: Wire property order into PropertiesWidget:
  1. Fetch order via trpc.properties.getPropertyOrder.useQuery({ memberId })
  2. Sort propertiesList by saved order
  3. Add reorder UI (arrows or drag in the carousel header)
  4. Call updatePropertyOrder on save

### Section 38: Property Widget Pictures & Map
- Not yet investigated
- Need to check design document for specs
- Need to check if property has an image field in schema
- Need to check if map component is wired to property address

## KEY TECHNICAL DETAILS

### Database Connection
- DATABASE_URL env var for mysql2/promise connections
- Tables use camelCase column names (e.g., propertyId, checkIn, checkOut, bookingStatus)
- property_bookings: id, propertyId, platformId, checkIn, checkOut, guestName, bookingStatus, bookingType, etc.

### Property IDs
- Morabeza: nJnk4hr3AxZJZ-RkwhRJy
- Penthouse: property ID 1 (first in list)
- Artiste's Boutique: has 8 upcoming bookings in DB

### Router Structure
- server/routers/properties.ts: All property/booking procedures
- server/services/icalAggregator.ts: iCal polling, outbound ICS generation
- server/scheduledHandlers/: Cron jobs (shadowBlockBackfill, propagationRetry, icalPoll)

### PropertiesWidget (Home.tsx line 1888)
- Uses trpc.properties.list.useQuery({ householdId })
- Carousel with left/right arrows and swipe gestures
- Does NOT use getPropertyOrder — just iterates in DB order
- householdId from householdQuery.data?.household?.id
- memberId available from householdQuery.data?.member?.id
