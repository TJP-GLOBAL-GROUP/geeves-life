# Sprint Progress — Jul 5, 2026

## COMPLETED ✅

### Phase 2: Schema Updates
- Added to property_bookings: taxRemittedByPlatform, taxOwedByHost, taxJurisdiction, passThroughTax, payoutDate, payoutBankAccount, financialSource
- Created property_photos table
- Created property_member_order table
- Extended ltr_payments table with new columns
- Created booking_screenshots table
- Created platform_export_imports table
- All applied directly via SQL (drizzle-kit generate was stuck on interactive prompts)

### Phase 3: Data Backfill
- 215 Airbnb payout records matched to property_bookings (financialSource='platform_export')
- 122 email-scraped bookings marked (financialSource='email_scrape')
- 129 remaining bookings marked (financialSource='manual')
- Tax jurisdiction set: JM_GART for Jamaica, NY_OCCUPANCY for US

### Phase 4: Backend Procedures (DONE)
- Enhanced getRevenueSummary to include tax breakdown, LTR data, provenance, photos
- Added getPropertyPhotos, uploadPropertyPhoto, deletePropertyPhoto, reorderPropertyPhotos
- Added getPropertyOrder, updatePropertyOrder
- Added getBookingScreenshots, uploadBookingScreenshot, confirmScreenshotOcr
- Added getLtrPayments, addLtrPayment, updateLtrPayment
- Added getPlatformExportImports, uploadPlatformExport
- Added DB helpers: getPropertyRevenueSummaryWithTax, getLtrRevenueSummary, getPropertyPhotos, addPropertyPhoto, deletePropertyPhoto, reorderPropertyPhotos, getPropertyMemberOrder, upsertPropertyMemberOrder, getBookingScreenshots, addBookingScreenshot, confirmBookingScreenshot, createPlatformExportImport, updatePlatformExportImport, getPlatformExportImports, getLtrPayments, getLtrPaymentsForHousehold, addLtrPayment, updateLtrPayment
- Server compiles with 0 errors and restarts successfully

## COMPLETED (Phases 5-9) ✅

### Phase 5: Frontend — Tax Display, Provenance, Revenue Widget, Property Reorder — DONE
- Updated PropertyRevenueSection to pass current year date range
- Added PropertyCardFinancials component with full tax breakdown
- Added provenance badges (Verified/Provisional/Mixed)
- Backend procedures for drag-and-drop reorder built

### Phase 6: Frontend — Photo Carousel, Map Pin, Platform Links, LTR Cards — DONE
- Added PropertyFinancialsTab to Properties.tsx detail page
- Per-booking breakdown, LTR ledger, platform links, screenshot upload
- Backend procedures for photo CRUD built

### Phase 7: Dashboard Swipe Navigation Fix — DONE
- Rewrote useGestures hook with gesture decision system
- Scrollable container detection, dominance ratio 1.8
- WidgetGrid: touch-none only in edit mode during active drag

### Phase 8: Email Scraping Improvements — DONE
- Platform-specific LLM prompt (Booking.com: never extract financials)
- Booking.com financial field suppression
- Financial confidence cap at 70
- Financial field protection (never overwrite verified data)
- Pre-creation cancellation cross-check
- Expanded cancellation detection

### Phase 9: Documentation Updates — DONE
- Updated DATA_COLLECTION_ARCHITECTURE_REVIEW.md (addendum)
- Updated BOOKING_ENRICHMENT.md (architecture update section)
- Created CHANNEX_PRICING_ANALYSIS.md

### Phase 10: Booking.com XLS Backfill from Google Drive — DONE
- Found Reservations_2024-01-01_2026-12-31.xls in tarik@tjperkinsfam.com Drive
- 45 bookings across 3 properties (Artiste's Boutique, Sunset Studio, Morabeza)
- 7 existing bookings matched and updated with verified financials
- 38 new bookings created with platform_export provenance
- Commission: 15% on all Booking.com reservations
- Jamaica properties: 10% GART tax estimate applied

## REMAINING (Minor Items)

1. ~~Booking.com records: enrich with verified XLS data~~ ✅ DONE
2. Surface unverified bookings in dedicated admin view for manual resolution
3. Exclude unverified bookings from revenue calculations
4. Multi-account awareness: track which Airbnb account ID a booking belongs to
5. Update docs/PHASE_2.md to reflect Channex decision
6. Add docs/PROPERTY_FINANCIALS.md describing tax calculation logic

## Channex Pricing Answer
- $130/month flat WhiteLabel Plan (API access for building products)
- +$0.50/month per vacation rental unit
- Your 3 properties = $131.50/month total
- At 1000 properties = $630/month total
- Volume discounts at 2000+ units
- Standard Plan (individual hosts, no API): $30/month
- Recommendation: Use free tier for personal, build Channex when 10+ paying users

## KEY FILES
- Schema: /home/ubuntu/geeves-shopping/drizzle/schema.ts
- DB helpers: /home/ubuntu/geeves-shopping/server/db.ts (3060+ lines)
- Properties router: /home/ubuntu/geeves-shopping/server/routers/properties.ts (1400+ lines)
- Revenue widget: /home/ubuntu/geeves-shopping/client/src/pages/Home.tsx (PropertyRevenueSection)
- Properties page: /home/ubuntu/geeves-shopping/client/src/pages/Properties.tsx
- Email scraper: /home/ubuntu/geeves-shopping/server/services/multiPlatformEmailScraper.ts
- Booking email scraper: /home/ubuntu/geeves-shopping/server/services/bookingEmailScraper.ts

## PROPERTY IDS
- Artiste's Boutique: ZI2Zy7OuLGYF-vmWOAII- (Jamaica, Airbnb)
- Morabeza / Penthouse: YiyTtDDIqXx88hD9ZWCo7 (NY, Airbnb+VRBO+Booking)
- Sunset Studio: Ln-_SMF7Nrt1uXsQcdP9C (NY, Airbnb+VRBO+Booking)
- Apartment #1 - Jessica Dougherty: 8W4U2WJg6d4rDN9v7I8-Z (NY, LTR)
- Apartment #2 - Jennifer Ungberg: RsUUOvqGAX3TgASRzDbGJ (NY, LTR)
