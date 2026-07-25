# Booking Enrichment — Design & Architecture

## Overview

Geeves enriches iCal-sourced property bookings with guest details, financial data, and platform booking links by scraping the Gmail inbox associated with each property platform. This document describes the data model, scraping architecture, auth flow, and UI surfaces.

---

## Data Model

### `property_bookings` — enrichment columns

| Column | Type | Source | Notes |
|---|---|---|---|
| `guestName` | varchar(255) | email / iCal summary | Override via `setGuestNameOverride` mutation |
| `guestEmail` | varchar(255) | email | |
| `guestPhone` | varchar(50) | email | |
| `guestCount` | int | email | Number of guests |
| `confirmationNumber` | varchar(100) | email | Platform booking reference |
| `totalPrice` | decimal(10,2) | email | Gross booking value |
| `cleaningFee` | decimal(10,2) | email | |
| `commissionAmount` | decimal(10,2) | email | Platform fee |
| `netAmount` | decimal(10,2) | email | Host payout |
| `currency` | varchar(3) | email | ISO 4217, default USD |
| `platformBookingUrl` | text | email | Deep link back to booking on platform |
| `rawEmailSubject` | text | email | Stored for debugging |
| `rawEmailDate` | bigint | email | UTC ms |
| `emailScrapeSource` | varchar(100) | scraper | e.g. `gmail:morabeza@gmail.com` |
| `scrapeConfidence` | tinyint | LLM | 0–100 |
| `lastEnrichedAt` | bigint | scraper | UTC ms |

### `email_scrape_jobs`

Tracks the state of each scrape run per platform.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36) | nanoid |
| `platformId` | varchar(36) | FK → property_platforms |
| `status` | enum | `pending`, `running`, `completed`, `failed` |
| `startedAt` | bigint | UTC ms |
| `completedAt` | bigint | UTC ms |
| `emailsProcessed` | int | |
| `bookingsEnriched` | int | |
| `bookingsCreated` | int | |
| `errorMessage` | text | |

### `property_email_tokens`

Stores Gmail OAuth tokens per notification email address (not per user — one token serves all properties sharing the same inbox).

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36) | nanoid |
| `email` | varchar(255) | UNIQUE — the notification inbox address |
| `accessToken` | text | encrypted at rest |
| `refreshToken` | text | encrypted at rest |
| `expiresAt` | bigint | UTC ms |
| `scope` | text | must include `gmail.readonly` |
| `createdAt` | bigint | UTC ms |
| `updatedAt` | bigint | UTC ms |

---

## Gmail OAuth Flow

### Scope

Only `https://www.googleapis.com/auth/gmail.readonly` is requested. No write access, no send access.

### Auth decision tree

```
User clicks "Connect & Scrape" on a platform row
  └─ Does property_email_tokens have a row for this email?
       ├─ YES → Does the token include gmail.readonly scope?
       │         ├─ YES → Skip OAuth, proceed directly to scrape
       │         └─ NO  → Redirect to Google OAuth (incremental auth)
       └─ NO  → Redirect to Google OAuth (new auth)
```

### OAuth route

`GET /api/auth/google/connect-property-email?platformId=<id>&returnUrl=<url>`

- Builds a Google OAuth URL with `scope=gmail.readonly&access_type=offline&prompt=consent`
- Stores `platformId` and `returnUrl` in the state parameter
- Callback at `/api/auth/google/connect-property-email/callback` stores the token in `property_email_tokens` and redirects back to the Properties page

---

## Email Scraper Architecture

### Service: `multiPlatformEmailScraper.ts`

**Trigger conditions:**
1. Property platform `notificationEmail` is set or updated (fires automatically via `updatePlatform` mutation)
2. Manual trigger via `trpc.properties.triggerEmailScrape({ platformId })` (Connect & Scrape button)

**Scrape window:**
- First run: 2 years back from today
- Subsequent runs: from `lastScrapedAt` minus 7 days (overlap window to catch late-arriving emails)

**Gmail query per platform:**

| Platform | Gmail search query |
|---|---|
| Airbnb | `from:automated@airbnb.com OR from:express@airbnb.com subject:(reservation confirmed OR new booking)` |
| VRBO | `from:@vrbo.com OR from:@homeaway.com subject:(booking confirmation OR reservation)` |
| Booking.com | `from:@booking.com subject:(booking confirmation OR new reservation)` |
| Direct | `subject:(booking confirmation OR reservation confirmed)` (broad) |

**Per-email processing:**
1. Fetch full email body (plain text preferred, HTML fallback)
2. Pass to `invokeLLM` with structured JSON schema (see below)
3. Match to existing booking by date overlap (checkIn ± 2 days) and property name fuzzy match
4. If match found: update enrichment columns
5. If no match: create a new booking record with `bookingType=booking`

### LLM Parser — JSON Schema

```json
{
  "type": "object",
  "properties": {
    "guestName": { "type": "string" },
    "guestEmail": { "type": "string" },
    "guestPhone": { "type": "string" },
    "guestCount": { "type": "integer" },
    "checkIn": { "type": "string", "description": "ISO 8601 date YYYY-MM-DD" },
    "checkOut": { "type": "string", "description": "ISO 8601 date YYYY-MM-DD" },
    "confirmationNumber": { "type": "string" },
    "totalPrice": { "type": "number" },
    "cleaningFee": { "type": "number" },
    "commissionAmount": { "type": "number" },
    "netAmount": { "type": "number" },
    "currency": { "type": "string" },
    "platformBookingUrl": { "type": "string" },
    "propertyName": { "type": "string" },
    "platform": { "type": "string", "enum": ["airbnb", "vrbo", "booking_com", "direct", "other"] },
    "confidence": { "type": "integer", "minimum": 0, "maximum": 100 }
  },
  "required": ["confidence"],
  "additionalProperties": false
}
```

---

## UI Surfaces

### Properties page — Platform Feeds tab

- **Email badge on platform row**: shows the `notificationEmail` with a Teal ✓ if the token exists and has `gmail.readonly` scope, or an Amber ○ with "(not connected)" if not
- **Scrape button** (mail icon): visible on all platform rows that have a `notificationEmail`; triggers `triggerEmailScrape`; shows spinner while running
- **Scrape status banner**: appears below the tab header when a scrape job exists for any platform on this property; shows running/completed/failed state with counts

### Properties page — Bookings tab

Each booking card is **clickable** to expand enriched details:
- **Guest section**: name, guest count, email (mailto link), phone
- **Financials section**: total, cleaning fee, platform fee, net payout (in Teal)
- **Reference section**: confirmation number (monospace), "View on [Platform]" deep link (Violet)
- **No enrichment state**: italic muted text "No enrichment data yet. Enable email scraping on the platform feed."
- **Enriched badge**: `✓ enriched` Teal pill next to guest name when `guestName` is populated

### Dashboard — Properties widget upcoming list

Each check-in/check-out entry is **clickable** to expand:
- Guest name shown inline in the collapsed row (if available)
- Expanded: guest details, financials (total + net), confirmation ref, platform link

---

## Decisions & Precedents

1. **Read-only Gmail scope only** — no write, no send, no delete. This is non-negotiable and must not be expanded without explicit user approval.
2. **Token stored per inbox address** (not per user) — multiple properties sharing the same notification email share one token row. This avoids re-auth when a second property is added to the same inbox.
3. **LLM parser with confidence score** — emails with confidence < 60 are stored but flagged; the UI shows a `?` badge instead of `✓ enriched`.
4. **Date matching uses ± 2 day window** — iCal dates and email dates sometimes differ by 1 day due to timezone handling; the window prevents duplicate records.
5. **Guest name override is permanent** — if an admin manually overrides a guest name via `setGuestNameOverride`, subsequent scrapes do not overwrite it (the `guestNameOverride` flag is checked before writing).


---

## Architecture Update: July 5, 2026

### Role Redefinition

Email scraping has been **explicitly demoted from a financial data source to a guest enrichment layer**. The scraper's role is now limited to:

1. Populating guest name, email, phone, and guest count
2. Extracting confirmation numbers for cross-referencing
3. Providing platform booking URLs for quick extranet access
4. Creating provisional booking records that are later reconciled against authoritative data

Financial fields extracted by the email scraper are marked as **provisional** (`financialSource='email_scrape'`) and are never treated as authoritative for tax reporting or revenue dashboards.

### New Data Model Columns on `property_bookings`

| Column | Type | Source | Notes |
|---|---|---|---|
| `financialSource` | varchar(50) | system | `'platform_export'` \| `'email_scrape'` \| `'manual'` \| `'screenshot_ocr'` |
| `taxRemittedByPlatform` | decimal(10,2) | platform export | Tax collected and remitted by platform on host's behalf |
| `taxOwedByHost` | decimal(10,2) | calculated | Tax host still owes (e.g., Jamaica GART 10% + $1/night) |
| `taxJurisdiction` | varchar(50) | system | `'NY_OCCUPANCY'` \| `'JM_GART'` \| `'NONE'` |
| `passThroughTax` | decimal(10,2) | platform export | Pass-through tax visible on US Airbnb/VRBO |
| `payoutDate` | bigint | platform export | UTC ms when payout was deposited |
| `payoutBankAccount` | varchar(100) | platform export | Last 4 digits of bank account |

### New Tables

| Table | Purpose |
|---|---|
| `property_photos` | Up to 4 photos per property (3 uploaded + 1 map pin) for carousel display |
| `property_member_order` | Per-member custom ordering of properties in the dashboard widget |
| `booking_screenshots` | Booking.com Pulse/Extranet screenshots with OCR-extracted financial data |
| `platform_export_imports` | Tracks uploaded CSV/XLS platform exports and their processing status |

### Financial Data Hierarchy (Priority Order)

1. **Platform Export** (`financialSource='platform_export'`) — Authoritative. From Airbnb CSV, VRBO reports, Booking.com XLS. Never overwritten.
2. **Screenshot OCR** (`financialSource='screenshot_ocr'`) — Near-authoritative. From Booking.com Pulse app screenshots, confirmed by user.
3. **Manual** (`financialSource='manual'`) — User-entered. Trusted but not automatically verified.
4. **Email Scrape** (`financialSource='email_scrape'`) — Provisional. Displayed with amber badge. Overwritten by any higher-priority source.

### Platform-Specific Financial Interpretation

| Platform | Email Contains Financials? | Interpretation |
|---|---|---|
| Airbnb | Yes (host payout amount) | Treat as `netAmount` (host payout after commission), NOT `totalPrice` |
| VRBO | Yes (host earnings) | Treat as `totalPrice` (gross host earnings before VRBO commission) |
| Booking.com | **No** | NEVER extract financial fields — emails contain zero dollar amounts |

### Scraper Safeguards Added

1. **Booking.com financial suppression** — After LLM parsing, all financial fields are forcibly deleted for Booking.com emails
2. **Financial confidence cap** — Email-scraped financial data capped at confidence 70
3. **Financial field protection** — Bookings with verified `financialSource` are never overwritten by email data
4. **Pre-creation cancellation cross-check** — Checks for existing cancelled bookings before creating new ones
5. **Expanded cancellation detection** — Now includes alteration, modification, date change, and no-show emails

### Decisions & Precedents (Updated)

6. **Email financials are always provisional** — `financialSource='email_scrape'` is set on all email-derived financial data. The UI shows an amber "Provisional" badge.
7. **Platform export always wins** — If a platform export provides financial data for a booking, it overwrites any email-scraped values and sets `financialSource='platform_export'`.
8. **Booking.com is enrichment-only** — The email scraper extracts guest details and confirmation numbers from Booking.com emails but NEVER sets financial fields. Financial data for Booking.com comes exclusively from screenshot OCR or platform export upload.
9. **Tax jurisdiction is property-level** — Determined by property location: US properties get `NY_OCCUPANCY`, Jamaica properties get `JM_GART`.
10. **Revenue widget shows current year** — Default date range is Jan 1 of current year to present, not lifetime.
