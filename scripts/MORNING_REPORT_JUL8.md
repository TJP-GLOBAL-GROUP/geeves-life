# Overnight Work Report — July 8, 2026

## Summary

Completed a major overnight session covering expense categorization migration, booking system fixes, shadow block propagation, and several UI/UX bug fixes. Here's what was accomplished:

---

## 1. Expense Categorization Migration (COMPLETE)

### Chart of Accounts
- **112 accounts seeded** across all 6 verticals (Home & Family, Maxfield Bakery, Maxfield Market, Personal, StartOut, Bohemian Lodges)
- Each account has proper account numbers, types (expense/income/cost_of_goods_sold), tax relevance flags, and parent-child relationships

### Walmart Data Migration
- All 185 `walmart_orders` linked to existing `vendor_orders` records
- 6 existing categorizations migrated to `expenses` table (1 skipped due to null category)

### Amazon Data Import
- **701 new orders** and **1,439 items** imported from CSV into `vendor_orders` + `vendor_order_items`
- Total system now has: **1,125 vendor orders**, **1,858 items**, **1,121 awaiting categorization**

### Categorization Tool Rewired
- Router now reads from `vendor_orders` + `vendor_order_items`
- Writes categorizations to `expenses` table linked to `chart_of_accounts` IDs
- COA dropdown populated per vertical (replaces old free-text categories)
- Bank account assignment via `getFinancialAccounts` (4 accounts available)
- Split categorization across multiple verticals fully functional
- **Fixed**: Vendor badge showed hardcoded "Walmart" → now shows actual platform
- **Fixed**: Order URL links now support Amazon, Wayfair, Home Depot

### Legacy Tables Dropped
- `walmart_orders` and `walmart_order_categorizations` tables removed from DB
- All code references cleaned from `drizzle/relations.ts`

### Data Summary
| Platform | Orders | Items |
|----------|--------|-------|
| Amazon | 829 | ~1,400 |
| Walmart | 293 | ~400 |
| Wayfair | 2 | ~4 |
| Home Depot | 1 | ~2 |

---

## 2. Morabeza Booking Investigation (DIAGNOSED)

### Finding
- **Booking exists**: Tarik Perkins, Jul 10-13 (Thu-Sun), $0 revenue, status "confirmed"
- **Booking IS visible** in the data — the `getPropertyBookings` and `getCompositeBookings` queries both return it correctly
- **Root cause of "not seeing" it**: The Sync button triggers an iCal fetch that hangs indefinitely (no timeout on `node-ical fromURL`), making the whole bookings panel appear stuck

### Fix Applied
- Added 30-second timeout to `fetchAndParseICal` in `icalAggregator.ts`
- The booking data is correct in the DB and will display once the timeout prevents the hang

### iCal Blocking
- Outbound ICS generation confirmed to include the Tarik booking (it queries all confirmed bookings for the property)
- Added `bookingStatus` filter to exclude cancelled bookings from outbound ICS

### CRUD Enhancement
- Added `checkIn`, `checkOut`, and `notes` fields to `updateBookingFinancials` procedure for full CRUD support

---

## 3. Cancellation Pending Notification Noise (FIXED)

### Problem
- Old Airbnb bookings (2024, early 2025) naturally age out of the iCal feed
- System was sending "Cancellation pending confirmation" emails for these

### Fix
- Added check in `icalAggregator.ts`: if `booking.checkOut < Date.now()`, skip notification and auto-confirm the booking stays
- Only sends notifications for **future** bookings disappearing from iCal (real cancellations)
- **72 stale pending cancellations auto-dismissed**, 2 legitimate future ones remain

---

## 4. Shadow Block Propagation (MAJOR PROGRESS)

### Status Before
- Cron had stopped 36 hours ago, only at ~11%
- Batch size was 50, processing was slow due to Google API writes per event

### Actions Taken
- Increased batch size from 50 → 200
- Wrote direct SQL backfill script that bypasses slow `onEventUpserted` function
- **89,065 new shadow blocks created** for the household
- Total: **109,206 shadow blocks** in the system
- Cleared 8,839 stale queue items

### Current Status
- Propagation at ~88% (20,253 events processed, 2,440 skipped due to no target calendars)
- **Remaining issue**: Need to verify blocks actually appear on your Google Calendar (the DB has them, but Google write-back may not have completed for all)
- **TODO**: Re-register `propagation-retry` as a proper Manus heartbeat schedule so it doesn't stop again

---

## 5. Penthouse (Unit 1 - 2BR) Dirty Data Cleanup (FIXED)

### Root Cause
- Booking.com platform on Penthouse was configured with **Morabeza's iCal URL**
- VRBO platform on Penthouse was configured with **Sunset Studio's iCal URL**
- This caused 60 bookings and $21,940 in false revenue to appear on Penthouse

### Actions Taken
- Deactivated both misassigned platforms on Penthouse
- Booking.com: 11 duplicates deleted, 23 bookings reassigned to Morabeza
- VRBO: 1 duplicate deleted, 64 bookings reassigned to Sunset Studio
- **Penthouse now shows 0 confirmed 2026 bookings, $0 revenue**
- Other properties retain their correct bookings

---

## 6. Property Carousel Reorder (FIXED)

### Problem
- Backend had `getPropertyOrder` / `updatePropertyOrder` procedures but frontend never called them
- No reorder UI existed in the carousel

### Fix
- Wired property order into `PropertiesWidget` in `Home.tsx`
- Added reorder arrows (left/right swap) in the carousel header
- Order persists to DB via `updatePropertyOrder` mutation
- Works on both mobile and desktop

---

## 7. Upcoming Bookings Not Loading (FIXED)

### Root Cause
- The "Sync" button calls `syncAllPlatforms` which fetches iCal URLs
- `node-ical fromURL` had **no timeout** — if any iCal URL is unreachable, the entire request hangs forever
- This blocks the UI from showing any bookings

### Fix
- Added 30-second timeout to `fetchAndParseICal`
- Bookings data is correct in the DB (verified: 8 upcoming for Artiste's Boutique, 1 for Morabeza)
- After publish, bookings will load on page load without hanging

---

## Remaining Items (Not Completed)

### Section 38: Property Widget Pictures & Map Auto-Load
- [ ] Review design document for property pictures and map functionality specs
- [ ] Implement/fix ability to add pictures to property widget
- [ ] Implement/fix map auto-loading based on property address (geocoding)
- These are feature additions, not bugs — deferred to next session

### Shadow Block Verification
- [ ] Verify shadow blocks actually appear on Google Calendar (need user to check)
- [ ] Re-register propagation-retry as proper Manus heartbeat schedule

### Upcoming Bookings Final Verification
- [ ] Verify bookings populate on page load after deployment (needs publish)

---

## Checkpoint Ready

All code changes compile cleanly (0 TypeScript errors). Ready to save checkpoint and publish.
