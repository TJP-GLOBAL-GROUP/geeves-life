# Sprint Jul 5, 2026 — Property Financial Overhaul Context

## What We're Building

### Schema Changes — ALL DONE ✅
1. ✅ Added to property_bookings: taxRemittedByPlatform, taxOwedByHost, taxJurisdiction, passThroughTax, payoutDate, payoutBankAccount, financialSource
2. ✅ property_photos table created
3. ✅ property_member_order table created
4. ✅ ltr_payments table extended with new columns (tenantName, paymentType, currency, expectedAmount, dueDate, paymentMethod, bankTransactionId, source)
5. ✅ booking_screenshots table created
6. ✅ platform_export_imports table created

### Data Backfill — DONE ✅
- 215 Airbnb payout records matched to property_bookings (financialSource='platform_export')
- 122 email-scraped bookings marked (financialSource='email_scrape')
- 129 remaining bookings marked (financialSource='manual')
- 75 payout records unmatched (mostly 2024 bookings not in property_bookings yet)
- Tax jurisdiction set: JM_GART for Jamaica, NY_OCCUPANCY for US

### Revenue Widget Fix
- Currently: getRevenueSummary has fromTs/toTs params but frontend passes NO date range (shows all-time)
- Fix: Frontend should pass current year start (Jan 1 of current year) as fromTs
- Detail page: allow custom date range selection

### Tax Display Logic
- US Airbnb/VRBO: Total - Commission - TaxRemitted = Net (show all 4 lines, "Additional taxes owed: $0")
- Jamaica all platforms: Total - Commission = Net, then show "Taxes due: GART 10% + $1/night = $X"
- US Booking.com: Total - Commission = Net, then show "Taxes due: NY Occupancy Tax = $X"

### Dashboard Swipe Fix
- Problem: anchored widget areas prevent swipe navigation on mobile
- Solution: Only capture swipe in scrollable lists (vertical) and carousels (horizontal)
- All other areas pass swipe through to page navigation

### Photo Carousel
- 3 photos per property + 1 map pin image
- Map pin links to Google Maps on click
- Platform links on detail page (link to each listing on each platform)

### Email Scraping Improvements (DETAILED)

**Problem 1: Phantom bookings from confirmation emails later cancelled**
Fix: Before creating a new email-only booking, cross-check against cancellation emails
for the same confirmation number/dates. If a cancellation email exists, skip creation.
Also add a `bookingStatus` check — if we already have a cancelled booking with that
confirmation number, don't recreate it.

**Problem 2: Financial semantics differ by platform**
- Airbnb `totalPrice` from email = guest total (includes guest service fee + taxes)
  → Host net = totalPrice - guestServiceFee - platformCommission - taxRemitted
  → But email only shows host payout, not guest total. So email `totalPrice` is actually
    the HOST EARNINGS (gross before commission), not the guest-facing total.
- VRBO `totalPrice` from email = includes traveler service fee + taxes
  → Similar to Airbnb: the amount in the email is the host-facing gross
- Booking.com emails contain NO financial data at all
  → Never set financial fields from Booking.com emails

Fix: Add platform-specific financial interpretation in parseEmailWithLLM:
  - For booking_com: set confidence to 0 for all financial fields, never populate them
  - For airbnb/vrbo: mark financial fields as `financialSource='email_scrape'`
    and set `scrapeConfidence` to max 70 (never 100) for financial data
  - Add explicit LLM prompt guidance per platform about what `totalPrice` means

**Problem 3: Property misattribution (VRBO cross-property)**
Fix already implemented: VRBO_PROPERTY_NUMBER_MAP + resolvePropertyFromVrboSubject()
Additional: Add logging when a booking is skipped due to property mismatch

**Problem 4: Booking.com enrichment from verified data**
Fix: The backfill script already handles this. For ongoing enrichment:
  - Screenshot OCR upload (already built in Phase 4)
  - Platform export import (already built in Phase 4)
  - Never trust email-scraped financial data for Booking.com

**Problem 5: Cancellation emails not always detected**
Fix: Expand cancellation query to include modification emails (date changes)
that effectively cancel the original booking. Also search for "alteration"
and "modification" subjects.

**Implementation plan:**
1. Update LLM prompt to include platform-specific financial guidance
2. Add Booking.com financial field suppression
3. Add pre-creation cancellation cross-check
4. Add modification email detection
5. Mark all email-scraped financials as provisional (financialSource='email_scrape')
6. Never overwrite financialSource='platform_export' with email data

### Channex Pricing Answer
- $130/month is a FLAT platform fee regardless of property count
- $0.50/property is additional per unit
- So 3 properties = $130 + $1.50 = $131.50/month
- 1000 properties = $130 + $500 = $630/month
- Volume discounts available from 500+ hotels or 2000+ VR units

### Key Files
- Schema: /home/ubuntu/geeves-shopping/drizzle/schema.ts (line 1683 end)
- DB helpers: /home/ubuntu/geeves-shopping/server/db.ts
- Properties router: /home/ubuntu/geeves-shopping/server/routers/properties.ts
- Revenue widget: /home/ubuntu/geeves-shopping/client/src/pages/Home.tsx (line 797 PropertyRevenueSection)
- Properties page: /home/ubuntu/geeves-shopping/client/src/pages/Properties.tsx
- iCal aggregator: /home/ubuntu/geeves-shopping/server/services/icalAggregator.ts
- Email scraper: /home/ubuntu/geeves-shopping/server/services/multiPlatformEmailScraper.ts
- Booking email scraper: /home/ubuntu/geeves-shopping/server/services/bookingEmailScraper.ts
