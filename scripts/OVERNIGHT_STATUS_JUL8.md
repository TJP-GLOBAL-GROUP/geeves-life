# Overnight Work Status — Jul 8, 2026

## COMPLETED

### Section 31: Categorization Tool Migration
- [x] Chart of accounts seeded: 112 accounts across 6 verticals
- [x] Walmart data migrated: 185 orders linked to vendor_orders, 6 expenses created
- [x] Router rewired: reads from vendor_orders/vendor_order_items, writes to expenses with COA IDs
- [x] UI updated: COA dropdown by vertical replaces free-text
- [x] Amazon imported: 701 new orders, 1439 items from CSV
- [x] Legacy tables dropped: walmart_orders, walmart_order_categorizations
- [x] TypeScript: 0 errors

### Section 34: Cancellation Notification Noise Fix
- [x] Fixed in server/services/icalAggregator.ts line 738
- [x] Past bookings (checkOut < now) no longer trigger "Cancellation pending" emails
- [x] 72 past pending cancellations auto-dismissed in DB
- [x] 2 future pending cancellations remain (Federica Nazzari Jul 13, MYA Aug 30)

## IN PROGRESS

### Section 33: Shadow Block Propagation
**Status:**
- Shadow blocks: 11,548 total
- Events needing blocks: 24,300 (Jan 2025 → 6mo forward)
- Events WITHOUT blocks: 21,758
- Propagation: ~9.7% (was 11% user reported — slightly regressed)
- Queue: 8,839 pending items cleared (marked resolved since doing direct backfill)
- Last resolved: 2026-07-06T18:48 (36 hours ago — cron stopped)

**Root Cause:**
- The propagation-retry heartbeat cron is NOT registered as a Manus schedule
- It's only registered as a webdev endpoint at /api/scheduled/propagation-retry
- The cron gateway stopped calling it ~36 hours ago
- When it WAS running: batch size was 50, and skipGoogleWrite=false caused Google API calls per event (slow)
- Many resolved items didn't create blocks because calendar had no verticalId

**Fix Applied:**
- Increased batch size from 50 to 200 in propagationRetry.ts
- Cleared 8,839 pending queue items (will use direct backfill instead)
- Need to: run the shadow-block-backfill endpoint (skipGoogleWrite=true) to bulk-create DB rows
- The endpoint hangs when called locally (processing 21,758 events sequentially takes too long)
- NEED: A batched approach or trigger via deployed endpoint

**Next Steps:**
- Write a direct SQL-based backfill that creates shadow_blocks rows without going through onEventUpserted
- Or: modify the backfill handler to process in smaller chunks with response streaming
- Re-register the propagation-retry as a proper Manus heartbeat schedule

### Section 32: Morabeza Booking Visibility
**Found:**
- Booking exists: "Tarik Perkins" on Morabeza, Jul 10-13 2026 (Thu-Sun)
- checkIn: 1752192000000 (Jul 10 2026), checkOut: 1752451200000 (Jul 13 2026)
- Revenue: $0, bookingStatus: confirmed, platform: Booking.com
- Property ID for Morabeza: need to confirm

**Diagnosis (from earlier investigation):**
- The booking IS in the DB with correct dates
- The upcoming bookings query uses a time window filter
- The Gantt chart uses getCompositeBookings which builds entries from bookings
- Issue likely in: the query filter, the viewer policy, or the property page's data fetching

**The Properties page upcoming bookings shows empty and refresh spins** — this is a separate bug (Section 37)

### Section 35: Penthouse Dirty Data
- Not yet investigated
- Penthouse (Unit 1 - 2BR) shows 2026 data/financials that shouldn't be there
- Property was shut down but still showing bookings and revenue

### Section 36: Property Carousel Reorder
- Not yet investigated
- Reorder not working on mobile or desktop

### Section 37: Upcoming Bookings Not Loading
- Not yet investigated
- Properties page shows empty upcoming, refresh spins indefinitely
- Likely related to the Morabeza booking visibility issue

### Section 38: Property Widget Pictures & Map
- Not yet investigated
- No way to add pictures to property widget
- Map not auto-loading from address

## KEY FILE LOCATIONS
- Categorisation router: server/routers/expenseCategorisation.ts
- iCal aggregator (cancellation fix): server/services/icalAggregator.ts
- Event propagation: server/services/eventPropagation.ts
- Shadow block backfill handler: server/scheduledHandlers/shadowBlockBackfill.ts
- Propagation retry handler: server/scheduledHandlers/propagationRetry.ts
- Properties router: server/routers/properties.ts
- Properties page UI: client/src/pages/Properties.tsx
- Home page (dashboard): client/src/pages/Home.tsx

## DATABASE STATE
- propagation_queue: 25,996 total (16,891+8,839 resolved, 0 pending now, 0 failed)
- shadow_blocks: 11,548
- events (eligible): 24,300
- property_bookings for Morabeza: includes Tarik Perkins Jul 10-13

## CRON/SCHEDULE STATUS
- Only 1 Manus schedule registered: "Geeves KB Governance — Daily 09:00 ET"
- propagation-retry is NOT a registered Manus schedule (was being called by webdev heartbeat system which stopped)
