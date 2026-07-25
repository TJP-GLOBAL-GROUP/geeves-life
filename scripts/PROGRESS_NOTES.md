# Progress Notes - Jul 8, 2026

## Completed This Session

### 1. Design Docs & AI Memory Updated
- Inserted 5 project_knowledge DB rows for recent features
- Updated PHASE_1.md with checkpoint history and completed features
- Added P-17 pattern (MySQL ONLY_FULL_GROUP_BY) to ENGINEERING_LESSONS.md

### 2. Notification Flood Silenced
- Added 6h cooldowns to: circuit breaker, rate limit, cancellation pending, date mismatch
- Added 24h cooldown to integration health check
- Created notification_settings table + router + Settings UI tab
- Wired DB settings into runtime notification logic

### 3. Duplicate Booking Fix
- Enhanced merge logic in getCompositeBookings (same-platform, same-dates merge)
- Added dedup in getPropertyBookingsForHousehold

### 4. Expense Categorisation Fix (CRITICAL)
- Root cause: MySQL ONLY_FULL_GROUP_BY incompatibility
- Rewrote JOIN structure to eliminate GROUP BY on non-aggregated columns
- 1,121 pending orders now returning correctly

### 5. Amazon Import
- All 804 unique orders from CSV already in DB (829 total with Gmail imports)
- Created 19 bank accounts for Amazon payment methods
- Created Amazon Gift Card / Points Balance account
- Created 175 expenses for 2025-2026 Amazon orders (uncategorized, pending_review)
- View Order button already functional (URL builder in getVendorOrderUrl)

### 6. Property Photos & Map (Section 38)
- PropertyPhotosTab component added
- PropertyMapTab with geocoding auto-load added
- uploadPropertyPhoto procedure handles base64 → S3

## Still To Do
- [ ] Visa 9761/7766 card replacement mapping (low priority - both accounts exist separately)
- [ ] Remaining Section 30 items (require Amazon order data file - DONE now)
- [ ] Square Sync Failed / QBO Sync notifications (different project)
- [ ] Shadow block sync (requires Google account reconnection)

## Key DB Info
- HOUSEHOLD_ID: V8lk3KJatvxBTWURf4uo9
- USER_ID: 1
- AMAZON_VENDOR_ACCOUNT_ID: 1xodoVrwoqtTF1GfMUyQc
- Home vertical: tjpfam-vert-home
- Default CoA: vL-5dc1S8gevFdICnT4tU
- bank_accounts has NO householdId column (uses userId)
- vendor_orders uses platform_vo, status_vo, currency_vo (suffixed columns)
- expenses uses verticalId_exp, chartOfAccountId_exp (suffixed columns)
- vendor_order_items uses `name` not `productName`
