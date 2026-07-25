# Overnight Work Progress — Jul 8, 2026

## COMPLETED

### Section 31: Categorization Tool Migration
- [x] Chart of accounts seeded (112 accounts across 6 verticals)
- [x] Walmart data migrated to vendor_orders + vendor_order_items (185 orders linked)
- [x] 6 categorizations migrated to expenses table
- [x] Router rewired: reads from vendor_orders/vendor_order_items, writes to expenses, uses COA
- [x] UI updated: COA dropdown by vertical replaces free-text
- [x] Amazon data imported (701 new orders, 1439 items from CSV)
- [x] Legacy tables dropped (walmart_orders, walmart_order_categorizations)
- [x] Zero TypeScript errors

### Section 33: Shadow Block Propagation
- [x] Was at 11% (11,548 blocks), cron had stopped 36hrs ago
- [x] Root cause: cron not registered as Manus heartbeat, batch size too small (50)
- [x] Increased batch size to 200, wrote direct SQL backfill script
- [x] Backfill COMPLETE: 89,065 new blocks for user's household (109,206 total across all)
- [x] 20,253 events processed, 2,440 skipped (no target calendars)
- [ ] Still need: verify blocks appearing on Google Calendar (sync_status still 'pending')
- [ ] Still need: register propagation-retry as Manus heartbeat schedule

### Section 34: Cancellation Notification Noise
- [x] Found code in icalAggregator.ts line ~738
- [x] Added check: if booking.checkOut < now, skip notification (silently keep record)
- [x] Auto-dismissed 72 past-booking pending cancellations (2 future remain correctly)

### Section 35: Penthouse Dirty Data
- [x] Root cause: Booking.com platform had Morabeza's iCal, VRBO had Sunset Studio's iCal
- [x] Deactivated misassigned platforms
- [x] Booking.com: 11 duplicates deleted, 23 reassigned to Morabeza
- [x] VRBO: 1 duplicate deleted, 64 reassigned to Sunset Studio
- [x] Penthouse now shows 0 confirmed 2026 bookings, $0 revenue

## IN PROGRESS / REMAINING

### Section 36: Property Carousel Reorder
- The WidgetGrid component (client/src/components/WidgetGrid.tsx) handles WIDGET reorder (calendar, properties, shopping, etc.)
- It uses pointer events with long-press on touch and immediate drag on desktop
- The "Customise" button triggers edit mode, then drag-to-reorder works
- The PROPERTY carousel within the Properties widget (PropertiesWidget in Home.tsx) is just a left/right navigation (arrows + swipe)
- There IS a `propertyMemberOrder` table and `updatePropertyOrder` procedure in the router
- BUT the frontend NEVER calls getPropertyOrder or updatePropertyOrder!
- The Properties page also has NO reorder UI
- FIX NEEDED: Wire up the propertyMemberOrder to the PropertiesWidget carousel AND add reorder UI to Properties page

### Section 37: Upcoming Bookings Not Loading
- Properties page uses `trpc.properties.listBookings` or `getPropertyBookings`
- The Artiste's Boutique shows 0 upcoming, 51 cancelled
- Need to check: is the query filtering correctly? Is it a time window issue?
- The Morabeza booking (Tarik Perkins, Jul 10-13) was found in DB but not showing
- Key procedures: getPropertyBookings (line ~575), getUpcomingEvents (line ~714)
- Possible issue: the booking was on Penthouse before cleanup, now on correct property

### Section 32: Morabeza Booking Visibility
- Booking EXISTS in DB: Tarik Perkins, Jul 10-13, $0 revenue, propertyId = nJnk4hr3AxZJZ-RkwhRJy (Morabeza)
- Wait — actually the booking was found with checkIn=Jul 10 on the PENTHOUSE (id=YiyTtDDIqXx88hD9ZWCo7)
- Status: cancelled (bookingStatus='cancelled')
- This might be why it's not showing — it was cancelled!
- Need to re-check if there's a separate booking on Morabeza for this weekend (Jul 10-13)

### Section 38: Property Widget Pictures & Map
- Schema has `propertyPhotos` table with propertyId, url, caption, sortOrder
- Need to check if upload UI exists
- Map component exists at client/src/components/Map.tsx
- Need to check if property detail view uses it with address geocoding

## KEY FILE LOCATIONS
- WidgetGrid: client/src/components/WidgetGrid.tsx (458 lines)
- PropertiesWidget: client/src/pages/Home.tsx (around line 1887)
- Properties page: client/src/pages/Properties.tsx
- Property router: server/routers/properties.ts
- Property DB helpers: server/db.ts (getProperties at line 1500)
- Schema: drizzle/schema.ts (propertyMemberOrder at line ~1742, propertyPhotos at line ~1720)
- iCal aggregator: server/services/icalAggregator.ts
- Shadow backfill handler: server/scheduledHandlers/shadowBlockBackfill.ts
- Propagation retry: server/scheduledHandlers/propagationRetry.ts

## PROPERTY IDs
- Penthouse: YiyTtDDIqXx88hD9ZWCo7
- Morabeza: nJnk4hr3AxZJZ-RkwhRJy
- Sunset Studio: Ln-_SMF7Nrt1uXsQcdP9C
- The Artiste's Boutique: ZI2Zy7OuLGYF-vmWOAII-
- Apartment #1: 8W4U2WJg6d4rDN9v7I8-Z
- Apartment #2: RsUUOvqGAX3TgASRzDbGJ
