# Geeves.Life — Data Collection Architecture Review

**Author:** Manus AI, in collaboration with Supah-T  
**Date:** July 5, 2026  
**Status:** Strategic decision document — requires product owner sign-off  
**Context:** Post-mortem of the 2024 tax reconciliation process (June–July 2026)

---

## Executive Summary

The tax reconciliation process for the 2024 fiscal year exposed fundamental limitations in the iCal + email scraping architecture that Geeves currently uses to collect property booking and financial data. Over approximately two weeks of intensive reconciliation work, we discovered that **email scraping produced phantom bookings, misattributed properties, and incomplete financial records** that required manual correction against authoritative platform exports. The iCal layer, while reliable for availability, provides **zero financial data** and cannot distinguish confirmed bookings from manual blocks on Booking.com.

This document presents an honest assessment of what works, what does not, and recommends a tiered path forward that balances immediate needs against long-term commercial viability.

---

## 1. What the Tax Reconciliation Process Actually Required

To produce a tax-ready P&L for three rental properties across four platforms, we needed the following data for each booking:

| Data Point | iCal Provides | Email Scraping Provides | Platform Export Provides |
|---|---|---|---|
| Check-in / check-out dates | Yes | Yes | Yes |
| Guest name | Partial (Airbnb only) | Yes (LLM-parsed) | Yes |
| Confirmation number | No | Sometimes | Yes |
| Gross booking amount | No | Sometimes (confidence varies) | Yes |
| Platform commission | No | Rarely | Yes |
| Net payout to host | No | Rarely | Yes |
| Cleaning fee breakdown | No | Sometimes | Yes |
| Tax collected/remitted | No | No | Yes |
| Cancellation status | Inferred (disappearance) | No | Yes |
| Payout date and bank account | No | No | Yes |
| Property attribution (correct listing) | Yes (per-feed) | Unreliable | Yes |

The critical finding is that **no combination of iCal and email scraping can reliably produce the financial data required for tax reporting**. The authoritative sources were always the platform exports: Airbnb CSV, VRBO payout reports, and Booking.com reservation XLS files.

---

## 2. Specific Failures Observed During Reconciliation

### 2a. Phantom Bookings from Email Scraping

The email scraper created booking records from confirmation emails that were subsequently cancelled. Airbnb sends a "Reservation confirmed" email at the moment of booking, but cancellation emails have a different format and sender address that the scraper did not reliably match back to the original booking. The result was **7 phantom bookings** in the Geeves database that never generated revenue — including one (Svetlana, $5,256 claimed net) that appeared to be a 3-month booking but was never paid out.

> "Email scraper created phantom bookings from confirmation emails that were later cancelled. Airbnb sends 'Reservation confirmed' emails even for bookings that are subsequently cancelled. The scraper has no way to detect cancellations since cancellation emails have different format."
>
> — Session State, July 4, 2026

### 2b. Property Misattribution

The VRBO reconciliation revealed that email-scraped bookings were assigned to the wrong property. The user operates **6 different VRBO listing IDs** across two accounts (current and deprecated), mapped to only 2 physical properties (Penthouse and Sunset Studio). The email scraper's ±2-day date matching and property name fuzzy matching could not reliably distinguish between listings on the same property when multiple VRBO accounts were in play. This resulted in a **$1,555 cross-property misattribution** that was only caught by comparing against the VRBO payout export.

### 2c. Booking.com Financial Data Completely Absent from Email

Booking.com commission invoice emails contain **no financial amounts whatsoever**. They simply notify the host that an invoice has been issued and direct them to log into the Extranet. The email scraper can extract guest names and dates from Booking.com confirmation emails, but the commission structure (15% of gross) must be calculated, not extracted. The actual invoice amounts are only available in the Booking.com Extranet Finance tab.

### 2d. Multi-Account Complexity

The user operates two Airbnb accounts (current: User ID 496561, deprecated: User ID 58451899) with overlapping listing names. The deprecated account has the same physical property listed under two different names ("4693 The Blue and Yellow Wooden House" and "Lovely Lakeside 2 Bedroom Flat"). Email scraping cannot distinguish which account a confirmation email belongs to when both accounts share the same notification inbox.

### 2e. The "totalPrice" Semantic Problem

Each platform defines "total price" differently:

| Platform | What "totalPrice" Means | What Host Actually Receives |
|---|---|---|
| Airbnb | Guest total (nightly + cleaning + pet + Airbnb service fee + taxes) | Gross minus Airbnb host fee |
| VRBO | Guest total (nightly + cleaning + VRBO traveler service fee + taxes) | Gross minus VRBO commission |
| Booking.com | Accommodation cost only (no guest service fee — Booking.com doesn't charge guests) | Gross minus 15% commission |

The email scraper's LLM parser has no way to know which semantic applies without platform-specific logic, and even then, the email body often does not contain all the components needed to derive the correct net payout.

---

## 3. What Actually Works in the Current Architecture

### 3a. iCal for Availability — Reliable

The iCal aggregator is genuinely reliable for its intended purpose: knowing when a property is booked versus available. It correctly handles:

- Multi-platform feed aggregation (one property, multiple platform feeds)
- Conflict detection (double-booking alerts)
- Outbound ICS generation for cross-platform blocking
- Prep rule enforcement (Sunday/holiday cleaning windows)
- Cancellation detection by feed removal (for iCal-only bookings)

The Booking.com limitation (all entries appear as "CLOSED - Not available") is correctly handled by treating every block as a confirmed booking and relying on email enrichment for guest details.

### 3b. Email Scraping for Guest Enrichment — Acceptable

When used as a **supplementary enrichment layer** rather than a source of truth, email scraping adds genuine value:

- Guest names for the Gantt timeline and booking cards
- Guest email/phone for communication
- Platform booking URLs for quick access to the platform extranet
- Confirmation numbers for cross-referencing

The LLM parser with confidence scoring (threshold: 60) and the regex fallback provide reasonable extraction quality for these non-financial fields.

### 3c. The Dual-Source Cancellation Flow — Well-Designed

The `dataSource` field (`ical_only | email_only | both`) and the pending cancellation mechanism are architecturally sound. When a booking has been confirmed by both iCal and email, removing it from the iCal feed alone does not auto-cancel — it enters a pending state that notifies the owner. This prevents false cancellations and is the right design for a multi-signal system.

---

## 4. The Fundamental Problem: Email Scraping as a Financial Source of Truth

The core architectural mistake was treating email scraping as a viable path to **financial data** for commercial purposes (tax reporting, revenue dashboards, P&L generation). The reasons this fails are structural, not implementation-quality issues:

**Reason 1: Confirmation emails are not settlement records.** A booking confirmation email represents intent, not outcome. The booking may be cancelled, modified, partially refunded, or subject to a resolution case. Only the platform's settlement/payout system knows the final financial outcome.

**Reason 2: Email formats are unstable and platform-specific.** Airbnb, VRBO, and Booking.com each have different email templates that change without notice. An LLM parser can adapt to format changes better than regex, but it still cannot extract data that is not present in the email body (e.g., Booking.com commission amounts).

**Reason 3: Multi-account and multi-listing scenarios create ambiguity.** When a host operates multiple accounts or multiple listings for the same property, email scraping cannot reliably attribute bookings to the correct entity without the platform's internal listing ID — which is not always present in the email.

**Reason 4: Financial reconciliation requires payout-level data.** Tax reporting requires knowing when money hit the bank account, not when a booking was confirmed. The payout date, payout amount, and destination bank account are only available from platform payout reports or bank statements.

**Reason 5: OAuth token maintenance is operationally fragile.** The email scraping pipeline depends on continuous Gmail OAuth token health. Token expiry, scope revocation, and reconnection flows create ongoing operational overhead that scales linearly with the number of connected accounts.

---

## 5. Recommended Architecture: Three-Tier Data Collection

Based on the reconciliation experience, the recommended architecture separates data collection into three tiers based on the reliability and authority of each source:

### Tier 1: Platform Exports (Source of Truth for Financials)

| Method | Platforms | Data Quality | Automation Level |
|---|---|---|---|
| CSV/XLS import (manual upload) | Airbnb, VRBO, Booking.com | Authoritative | Manual (quarterly) |
| Platform API (Channex) | All via channel manager | Authoritative | Fully automated |
| Bank statement import | All (via Plaid or CSV) | Authoritative | Semi-automated |

**Airbnb:** The Airbnb earnings CSV export is the single most reliable financial data source. It contains gross earnings, adjustments, service fees, tax withheld, and net payout per listing per month. Geeves should support direct CSV upload with an automated parser that maps listing names to Geeves properties.

**VRBO:** The VRBO Payout Summary Report and Deposit Report CSVs provide per-booking financial detail including traveler service fees, lodging taxes, and net payouts. Same approach: upload + automated parser.

**Booking.com:** The reservation XLS export from the Extranet contains all booking details including commission amounts. Additionally, the Channex channel manager API ($130/month + $0.50/property) provides real-time reservation data with full financials via webhook.

**Bank Statements:** For ultimate reconciliation, bank statement imports (via Plaid API or manual CSV) provide the cash-basis view that matches tax filings.

### Tier 2: iCal Feeds (Source of Truth for Availability)

The current iCal aggregator remains the correct approach for real-time availability management. No changes recommended. It should continue to:

- Poll platform feeds on a schedule (currently every 4 hours with stale detection)
- Maintain the outbound ICS for cross-platform blocking
- Detect conflicts and enforce prep rules
- Serve as the backbone of the Gantt timeline

### Tier 3: Email Scraping (Enrichment Layer Only)

Email scraping should be **explicitly demoted** from a financial data source to a guest enrichment layer. Its role is limited to:

- Populating guest name, email, phone, and guest count
- Extracting confirmation numbers for cross-referencing
- Providing platform booking URLs for quick extranet access
- Creating provisional booking records that are later reconciled against Tier 1 data

Financial fields extracted by the email scraper (`totalPrice`, `commissionAmount`, `netAmount`) should be marked as **provisional** in the UI with a clear indicator that they have not been reconciled against platform exports.

---

## 6. The Channex Decision

The Channex channel manager represents the most significant architectural decision for Phase 2. Based on the research conducted during the tax reconciliation process:

### Arguments For Channex

1. **Single API for all platforms** — replaces individual iCal feeds, email scraping, and manual exports with one authoritative real-time data source
2. **Real-time webhooks** — booking, modification, and cancellation events arrive instantly rather than being discovered on the next iCal poll or email scrape
3. **Full financial data** — reservation amounts, commission, net payout, and guest details are all available via the API
4. **Rate and availability management** — enables Geeves to push prices and availability to all platforms simultaneously (a genuine product feature, not just data collection)
5. **Cost-effective** — $130/month + $0.50/property is dramatically cheaper than building and maintaining individual platform integrations
6. **Eliminates the phantom booking problem** — cancellations are reported via webhook, not inferred from feed removal or email absence

### Arguments Against Channex

1. **Vendor dependency** — Geeves becomes dependent on Channex's continued operation and API stability
2. **User onboarding requires platform authorization** — hosts must authorize their platform accounts (Airbnb via OAuth, Booking.com via Extranet request). However, this step is required regardless of integration method — it's a platform requirement, not Channex-specific friction. Channex provides an embeddable white-label iframe and API-driven auto-mapping so the user never leaves the Geeves UI
3. **Not free for the user** — the $0.50/property cost must be absorbed by Geeves or passed to the user
4. **Overkill for personal use** — for a single household with 3 properties, the $130/month base fee is significant relative to the value delivered

### Recommendation

Adopt Channex as the **Phase 2 commercial-tier integration** for users with 3+ properties or who want automated financial reporting. Maintain the iCal + email enrichment path as the **free tier** for users who only need availability management and basic guest details. This creates a natural upgrade path:

| Tier | Data Collection | Financial Accuracy | Monthly Cost |
|---|---|---|---|
| Free (Personal) | iCal + email enrichment + manual CSV upload | Quarterly reconciliation via platform exports | $0 |
| Pro (Host) | Channex API + real-time webhooks | Real-time, authoritative | $130 + $0.50/property |
| Enterprise (PM) | Channex + Plaid bank sync + QBO integration | Fully automated tax-ready P&L | Custom |

---

## 7. Immediate Action Items (Phase 1 Cleanup)

Before Phase 2 begins, the following changes should be made to the existing codebase:

### 7a. Demote Financial Fields in the UI

The PropertyRevenueSection widget and booking detail cards currently display email-scraped financial data without any provenance indicator. Add a visual distinction:

- **Reconciled** (green badge): Financial data confirmed against platform export or Channex API
- **Provisional** (amber badge): Financial data from email scraping only — not yet reconciled
- **Missing** (no badge): No financial data available

### 7b. Add Platform Export Import Flow

Build a simple CSV/XLS upload flow in the Properties settings that:

1. Accepts Airbnb earnings CSV, VRBO payout reports, and Booking.com reservation XLS
2. Parses and maps to existing `property_bookings` rows by confirmation number and date
3. Overwrites email-scraped financial fields with authoritative export data
4. Marks reconciled rows with a `financialSource: 'platform_export'` field

### 7c. Fix the Phantom Booking Problem

Add a reconciliation step that compares email-scraped bookings against platform exports and:

1. Marks bookings present in email but absent from export as `status: 'unverified'`
2. Surfaces unverified bookings in a dedicated admin view for manual resolution
3. Does not include unverified bookings in revenue calculations

### 7d. Document the Architecture Decision

Update `docs/BOOKING_ENRICHMENT.md` and `docs/PHASE_2.md` to reflect the three-tier model and the explicit demotion of email scraping from a financial source to an enrichment layer.

---

## 8. Long-Term Vision: The Geeves Financial Data Stack

The ultimate architecture for Geeves property financial management should look like this:

```
┌─────────────────────────────────────────────────────────────────┐
│                    GEEVES FINANCIAL DASHBOARD                     │
│         (Revenue, Expenses, P&L, Tax Reports, Forecasting)       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
          ┌─────────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
          │  INCOME     │  │ EXPENSES  │  │ BANK RECON  │
          │  (Bookings) │  │ (Costs)   │  │ (Cash Flow) │
          └──────┬──────┘  └─────┬─────┘  └──────┬──────┘
                 │               │               │
    ┌────────────┼───┐     ┌────┼────┐     ┌────┼────┐
    │            │   │     │    │    │     │         │
┌───▼──┐  ┌─────▼┐ ┌▼──┐ ┌▼──┐ ┌▼──┐ ┌▼──┐  ┌───▼───┐  ┌──▼──┐
│Channex│  │Export│ │iCal│ │QBO│ │CSV│ │Rcpt│  │ Plaid │  │ CSV │
│  API  │  │Upload│ │+Em │ │API│ │Imp│ │Scan│  │  API  │  │ Imp │
└───────┘  └──────┘ └───┘ └───┘ └───┘ └───┘  └───────┘  └─────┘
  Real-     Manual   Free   Sync  Manual Email   Auto      Manual
  time      Quarter  Tier   Push  Upload Scrape  Sync      Upload
```

Each data source feeds into a unified `financial_ledger` table that tracks:

- The source of each financial record (provenance)
- The confidence level (authoritative vs. provisional)
- The reconciliation status (matched to bank deposit or not)
- The tax categorization (Schedule E line item)

This architecture ensures that Geeves can serve both the personal user (manual quarterly reconciliation) and the commercial host (real-time automated financial management) without architectural changes — only the data sources connected differ.

---

## 9. Decision Matrix: What to Build When

| Item | Priority | Effort | Value | Dependency |
|---|---|---|---|---|
| Platform export CSV/XLS import | P0 | 1 week | Immediate tax accuracy | None |
| Financial field provenance badges | P0 | 2 days | User trust | None |
| Phantom booking reconciliation | P0 | 3 days | Data integrity | Export import |
| Channex sandbox integration | P1 | 2–4 weeks | Commercial viability | Channex account |
| Channex production deployment | P1 | 1 week | Revenue feature | Sandbox validation |
| Plaid bank statement sync | P2 | 2 weeks | Full reconciliation | Plaid account |
| QBO integration for expenses | P2 | 2 weeks | Tax automation | QBO OAuth |
| Automated tax report generation | P3 | 2 weeks | End-to-end value | All above |

---

## 10. Conclusion

The iCal + email scraping approach was the right choice for Phase 1 given the constraints: no platform API access, no channel manager relationship, and a need to ship quickly. It successfully delivers **availability management** and **guest enrichment** — two genuinely valuable features. However, the tax reconciliation process proved conclusively that it is **not viable as a financial data source** for any purpose that requires accuracy: tax reporting, revenue dashboards, P&L generation, or commission tracking.

The path forward is clear: maintain iCal + email scraping as the free-tier enrichment layer, add platform export import as the immediate fix for financial accuracy, and build toward Channex as the commercial-tier real-time solution. This three-tier model respects the current architecture's strengths while honestly acknowledging its limitations and providing a clear upgrade path for users who need authoritative financial data.

---

*This document should be reviewed alongside: `docs/PHASE_2.md` §7 (Booking Platform API), `docs/BOOKING_ENRICHMENT.md`, and the tax reconciliation session states in `/home/ubuntu/tax_prep/`.*

---

## Addendum: Improvements Implemented (July 5, 2026)

The following changes have been implemented in response to this review. They address the P0 action items identified in Section 7.

### A1. Email Scraper Hardening

**File:** `server/services/multiPlatformEmailScraper.ts`

| Improvement | Description |
|---|---|
| Platform-specific LLM prompt | Added explicit financial guidance per platform: Booking.com told to never extract financials, Airbnb told amounts are host payouts not guest totals, VRBO told amounts are gross host earnings |
| Booking.com financial suppression | After LLM parsing, all financial fields are forcibly deleted for Booking.com emails to prevent hallucinated amounts |
| Financial confidence cap | Email-scraped financial data capped at confidence 70 (never 100) |
| Financial field protection | Existing bookings with `financialSource='platform_export'`, `'screenshot_ocr'`, or `'manual'` are NEVER overwritten by email-scraped data |
| Pre-creation cancellation cross-check | Before creating a new email-only booking, checks if a booking (active OR cancelled) with the same confirmation number already exists — prevents phantom recreations |
| Expanded cancellation detection | Cancellation query now includes "alteration", "reservation change", "modification", "date change", and "no-show" subjects |
| Financial source tagging | All newly created email-only bookings are tagged with `financialSource='email_scrape'` |

### A2. Financial Data Provenance System

**Schema additions to `property_bookings`:**

- `financialSource` — enum: `'platform_export'` | `'email_scrape'` | `'manual'` | `'screenshot_ocr'`
- `taxRemittedByPlatform` — decimal: tax amount remitted by platform on host's behalf
- `taxOwedByHost` — decimal: tax amount host still owes (e.g., Jamaica GART)
- `taxJurisdiction` — string: `'NY_OCCUPANCY'` | `'JM_GART'` | `'NONE'`
- `passThroughTax` — decimal: pass-through tax visible on US Airbnb/VRBO bookings

### A3. Platform Export Import Flow

**Backend:** `properties.uploadPlatformExport` tRPC procedure accepts CSV/XLS uploads, stores in S3, and records metadata in `platform_export_imports` table. Processing logic matches rows by confirmation number and date, overwrites financial fields, and marks as `financialSource='platform_export'`.

### A4. Screenshot OCR for Booking.com

**Backend:** `properties.uploadBookingScreenshot` procedure accepts screenshots from the Booking.com Pulse app or Extranet, stores in S3, runs OCR via LLM to extract financial data, and presents results for user confirmation before writing to the booking record with `financialSource='screenshot_ocr'`.

### A5. Revenue Widget Date-Range Fix

The PropertyRevenueSection widget now defaults to **current year** (Jan 1 of current year → now) rather than all-time. The property detail page allows custom date range selection for historical analysis.

### A6. Provenance Badges in UI

Each property card in the revenue widget now shows a provenance badge:
- **Verified** (green): All bookings have `financialSource='platform_export'` or `'screenshot_ocr'`
- **Provisional** (amber): Some bookings have `financialSource='email_scrape'`
- **Mixed** (amber): Combination of verified and provisional data

### A7. Data Backfill Results

The one-time backfill script reconciled 215 Airbnb payout records against existing `property_bookings` rows:
- 215 matched and updated with verified financial data + `financialSource='platform_export'`
- 122 email-scraped bookings tagged with `financialSource='email_scrape'`
- 129 remaining bookings tagged with `financialSource='manual'`
- Tax jurisdiction set: `JM_GART` for Jamaica properties, `NY_OCCUPANCY` for US properties

---

*These improvements implement the "Demote Email Scraping to Enrichment Layer" strategy described in Section 5, Tier 3. The email scraper now functions as designed: a guest enrichment tool that never overwrites authoritative financial data.*
