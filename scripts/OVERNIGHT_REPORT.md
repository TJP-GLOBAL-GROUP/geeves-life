# Geeves.Life — Overnight Work Report (Jul 7-8, 2026)

## COMPLETED THIS SESSION

### 1. Property Widget Pictures & Map Auto-Load (Section 38)
- **Property photo upload**: Server-side S3 upload via base64 data URI (uploadPropertyPhoto procedure)
- **Property photos tab**: Grid display in PropertyDetail panel with upload, delete, and reorder
- **Property map tab**: PropertyMapTab component with auto-geocoding from property address
- **MapView integration**: Automatically centers map on property address using Google Geocoding API

### 2. Notification Flood Fix (Section 38)
- **Shadow Block Circuit Breaker**: 6h cooldown (was sending on every trigger)
- **Shadow Block Rate Limit**: 6h cooldown per calendar
- **Cancellation Pending**: Batched into single notification per poll cycle, 6h cooldown
- **Booking Date Mismatch**: Batched, 6h cooldown
- **Integration Health Check**: 24h cooldown
- **NOT in this codebase**: Square Sync Failed, QBO Sync Cron Job Failed (different Manus project)

### 3. Notification Settings Panel
- **DB table**: notification_settings with key, cooldownHours, enabled, householdId
- **Server router**: notificationSettings.getAll / notificationSettings.update procedures
- **UI**: Notifications tab added to Settings page with per-alert cooldown slider and enable/disable toggle
- **Wired to runtime**: eventPropagation.ts, iCalAggregator.ts, and db.ts all read from DB settings

### 4. Duplicate Bookings Fix
- **Root cause**: getCompositeBookings merge logic not aggressive enough for same-platform bookings
- **Fix**: Enhanced merge to use 80% overlap threshold for same-platform entries + dedup in getPropertyBookingsForHousehold

### 5. Expense Categorisation Tool Fix (Critical Bug)
- **Root cause**: MySQL ONLY_FULL_GROUP_BY strict mode incompatibility — queries used GROUP BY vo.id but referenced non-aggregated columns from subquery aliases
- **Fix**: Rewrote all JOIN structures in getOrders, getStats, and count queries to use pre-aggregated subqueries (eFirst pattern) eliminating the need for GROUP BY on the main query
- **Result**: 1,121 pending orders (Walmart + Amazon + Home Depot + Wayfair) now visible again

---

## STILL OUTSTANDING (From Overnight To-Do List)

### Section 30: Amazon Order Import (Requires Data Files)
- [ ] Create 7 new bank accounts for Amazon payment methods + Amazon Gift Card/Points Balance
- [ ] Map Visa 9761 and Visa 7766 to same account (card replacement)
- [ ] Import all 1,444 Amazon items (2006-2026) into vendor purchase history table
- [ ] Import 409 items (2025-2026) as uncategorized expenses with auto-linked bank accounts
- [ ] Enable "View Order" button with Amazon order URL pattern
- [ ] Leave "Not Available" payment method expenses with blank bank account
- [ ] Create "Amazon Gift Card / Points Balance" account for gift card payments

**Status**: These require the Amazon order CSV/data file to be provided. The schema and import infrastructure is ready.

### Section 28: Shadow Block Sync (Partially Resolved)
- [x] Root cause identified: all 7 Google OAuth refresh tokens were revoked (invalid_grant)
- [x] 2,427 shadow blocks reset from sync_failed → pending_sync
- **Remaining**: User needs to reconnect Google accounts for shadow blocks to actually sync

### Priority 3 Features (Not Started — Future Phase)
- [ ] Walmart API integration (real-time product search)
- [ ] Amazon ASIN scraping (browser-restricted)
- [ ] Asana integration (task sync)
- [ ] Google Keep integration (notes sync)
- [ ] WhatsApp direct integration
- [ ] Device control (smart home stub)

### Chrome Extension (Section 24)
- [ ] Extension installed but banner still shows "Install the extension" (bridge communication issue)

---

## TECHNICAL NOTES

### MySQL ONLY_FULL_GROUP_BY Fix Pattern
The production TiDB/MySQL instance now enforces `ONLY_FULL_GROUP_BY`. Any query using GROUP BY must include ALL non-aggregated columns in the GROUP BY clause, or restructure to avoid GROUP BY entirely.

**Before (broken)**:
```sql
SELECT vo.*, sg.splitCount FROM vendor_orders vo
LEFT JOIN (subquery) sg ON ...
GROUP BY vo.id  -- sg.splitCount not in GROUP BY → error
```

**After (fixed)**:
```sql
SELECT vo.*, COALESCE(sg.splitCount, 0) FROM vendor_orders vo
LEFT JOIN (pre-aggregated subquery) eFirst ON ...
LEFT JOIN expenses e ON e.id = eFirst.firstExpId  -- single row per order
LEFT JOIN (pre-aggregated subquery) sg ON ...
-- No GROUP BY needed since all JOINs produce at most 1 row per vo.id
```
