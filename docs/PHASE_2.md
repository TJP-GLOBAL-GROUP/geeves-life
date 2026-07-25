# Geeves.Life — Phase 2 Design Document

*Created: June 26, 2026 | Updated: July 02, 2026 | Status: Active development — Phase 1 hardening + Phase 2 pre-work in progress*

---

## Overview

Phase 2 extends Geeves from a household life management platform into a **commerce-aware, travel-capable personal assistant** — one that can route shopping, errands, deliveries, transport, and travel across the best available services while generating affiliate revenue for the platform. The guiding principle is: **Geeves does the legwork, the user taps once to execute.**

Phase 2 also deepens the platform's core capabilities: modular dashboard widgets, task manager integrations, platform API connectivity for properties, and the Tailscale-based Geeves Node connectivity layer.

---

## 1. Phase 2 Priorities (Ordered)

The following priority order was established June 26, 2026 based on revenue impact, user value, and implementation complexity:

1. **Shopping Cart & Commerce Audit** — document what is already built before adding anything new
2. **Instacart Developer Platform** — highest affiliate revenue potential (15%), covers 1,400+ retailers
3. **Walmart Affiliate Marketing API** — product search and ID cache to replace hardcoded mappings
4. **Amazon Product Advertising API** — product lookup and cart URL composition
5. **Travel Affiliate Integrations** — Booking.com, Expedia, Skyscanner, Rentalcars.com
6. **Task Management Integrations** — Asana OAuth, Google Keep
7. **Platform API Connectivity** — Airbnb, VRBO, Booking.com official property management APIs
8. **Modular Dashboard Widgets** — resizable, reorderable widget system
9. **Tailscale Connectivity Layer** — Geeves Node onboarding and ACL sync
10. **Smart Home Integration Stub** — architecture groundwork only

---

## 2. Shopping Cart — Audit-First Mandate

> **Critical note recorded June 26, 2026:** During Phase 1 research, it was discovered that the Walmart AddToCart URL approach had already been implemented in the codebase, but this was not reflected in the design documentation. This gap means Phase 2 **must begin with a full audit** of the existing shopping cart implementation before any new integrations are added.

### Audit Deliverable: `SHOPPING_CART_AUDIT.md`

Before writing a single line of new shopping code, the following must be documented:

- Every file that touches shopping cart logic (search codebase for `addToCart`, `walmart`, `shopping`, `cart`)
- The current product ID mapping table schema and seed data (50 Walmart IDs confirmed seeded)
- The current URL composition logic: item IDs, quantities, offer IDs, multi-item format
- The current UI flow: how a user adds items, how the cart link is generated, how it is presented to the user
- What is hardcoded vs. dynamic in the current implementation
- What is missing: real-time product search, multi-retailer routing, price comparison

---

## 3. Retailer & Service Partner Research

*Researched June 26, 2026. Rates and program terms subject to change — verify before implementation.*

### 3a. Shopping Retailers

| Retailer | Affiliate Program | Commission Rate | Network | Product Search API | Cart Method | Logo Use |
|---|---|---|---|---|---|---|
| **Walmart** | ✅ Active | 1–4% (most 1%; home décor 4%) | Impact Radius | ✅ Affiliate Marketing API — full catalog search, product lookup, reviews, trending | URL composition (`/sc/cart/addToCart?items=ID_qty,...`) | ✅ Permitted under Walmart Brand Center guidelines |
| **Amazon** | ✅ Active | 1–20% by category (groceries 1%; luxury beauty 10%; games 20%; avg ~3%) | In-house (Associates) | ✅ Product Advertising API 5.0 — requires qualifying sales to maintain access; rate-limited by revenue tier | URL composition (`amazon.com/dp/ASIN`) | ✅ Permitted — must use approved badge assets; no offline use |
| **Target** | ✅ Active | 1–8% (home/apparel 5–8%; electronics 1%) | Partnerize | ❌ No public product search API | URL deep links only | ✅ Permitted under Target Partners brand guidelines |
| **Whole Foods** | ⚠️ Via Amazon | 1% (grocery via Amazon Associates) | Amazon Associates | ✅ Via Amazon PA-API | Amazon URL (`/dp/ASIN`) | ⚠️ Governed by Amazon trademark guidelines — use approved assets only |
| **Costco** | ✅ Active | $3–$8 flat per membership referral; 3–6% on products | CJ Affiliate | ❌ No public product API | URL deep links; also via Instacart IDP | ⚠️ Primarily membership promotion; product logo use requires approval |
| **Publix** | ❌ None | No public affiliate program | — | ❌ No API | ⚠️ Reachable via Instacart IDP | ❌ No affiliate use permitted |
| **CVS** | ✅ Active | ~2–3% (health/beauty) | Skimlinks / CJ | ❌ No public product API | URL deep links; also via Instacart IDP | ⚠️ Affiliate badge use only |
| **Walgreens** | ✅ Active | 2% flat | CJ Affiliate | ⚠️ Product catalog feed (60,000+ items) via CJ — not real-time search | URL deep links; also via Instacart IDP | ⚠️ CJ affiliate badge assets only |
| **Home Depot** | ✅ Active | 1% general; 8% select home décor | Impact Radius | ❌ No public product search API | URL deep links only | ✅ Permitted under affiliate guidelines |
| **Lowe's** | ✅ Active | 2% standard; up to 20% via Creator Program | Impact Radius | ❌ No public product API | URL deep links only | ✅ Permitted under affiliate guidelines |

### 3b. Delivery & Transport Services

| Service | Program | Commission Structure | Network | API / Integration | Logo Use |
|---|---|---|---|---|---|
| **DoorDash** | ✅ Active | $2–$10 per new customer first order | Impact Radius | ✅ Deep link API — compose URLs to specific restaurants/menus | ✅ Permitted under DoorDash affiliate brand guidelines |
| **Instacart** | ✅ Active | Up to **15%** on qualifying grocery purchases | Impact Radius (IDP) | ✅ **Instacart Developer Platform (IDP)** — full cart API covering Whole Foods, Costco, Publix, CVS, Walgreens, Kroger, and 1,400+ retailers | ✅ Permitted for IDP partners |
| **Uber / Uber Eats** | ✅ Active | $5 flat per new rider; Eats varies by market | In-house (uber.com/affiliate) | ✅ Deep link API — `uber://` and web deep links for rides and Eats orders | ⚠️ Strict — must use official Uber badge; no modified logos |
| **Lyft** | ✅ Active | $5–$25 per new rider (varies by market/campaign) | Impact Radius | ✅ Deep link API — `lyft://` and web deep links | ⚠️ Must use official Lyft affiliate badge assets |

---

## 4. The Instacart Opportunity

Instacart's Developer Platform is the single most strategically important commerce integration for Phase 2:

- **One API, 1,400+ retailers** — Whole Foods, Costco, Publix, CVS, Walgreens, Kroger, Aldi, and more are all reachable through a single Instacart integration. This solves the "no affiliate program" problem for Publix and the "no product API" problem for Costco in one move.
- **15% commission** — the highest rate of any retailer in this research. On a $200 grocery order, that is $30.
- **Full cart API** — unlike Walmart's URL-only approach, Instacart's IDP allows server-side cart composition: pass a list of items, get back a pre-filled cart the user can check out with same-day delivery.
- **Shoppable lists** — the IDP is designed exactly for the "Geeves builds the list, user taps once to order" use case.

**Recommended Phase 2 commerce integration order:** Instacart IDP → Walmart Affiliate API → Amazon PA-API → URL deep links for all others.

---

## 5. Commerce Affiliate Revenue Model

*Based on a household spending ~$1,500/month routed through Geeves.*

| Scale | Monthly GMV Routed | Blended Rate | Monthly Revenue |
|---|---|---|---|
| Single household (pilot) | ~$1,500 | ~2–3% | **$30–$45/month** |
| 10 beta households | ~$15,000 | ~2–3% | **$300–$450/month** |
| 100 households | ~$150,000 | ~2–3% | **$3,000–$4,500/month** |
| 1,000 households | ~$1.5M | ~2–3% | **$30,000–$45,000/month** |

The blended rate improves significantly if Instacart (15%) handles a meaningful share of grocery spend. A household spending $600/month on groceries through Instacart alone generates ~$90/month at 15%.

---

## 6. Travel Affiliate & Platform Research

*Researched June 26, 2026.*

### 6a. Travel Booking Platforms — Affiliate Programs

Travel affiliate programs operate differently from retail: commissions are typically a percentage of **Booking.com's or Expedia's own commission** from the property, not a percentage of the total booking value. This means the effective rate on the total booking value is lower than the headline number suggests.

| Platform | Affiliate Program | Commission Structure | Network | API Access | Cart Method | Notes |
|---|---|---|---|---|---|---|
| **Booking.com** | ✅ Active | 25–40% of Booking.com's commission (tiered by monthly volume); ~4% of booking value via CJ | In-house + CJ Affiliate | ✅ Affiliate API — search, availability, deep links; separate Connectivity API for property managers | Deep link to pre-filled search or property page | Tier 1 (1–50 bookings/month): 25%; Tier 4 (500+): 40% |
| **Expedia Group** (Hotels.com, Vrbo, Expedia) | ✅ Active | 4% hotels; 2% vacation rentals; 1.35% car rentals; 4.5% packages | In-house (Travel Creator Program) | ✅ Affiliate API — search widgets, deep links, data feeds | Deep link to pre-filled search | Hotels.com is part of Expedia Group; same program covers both |
| **Hotels.com** | ✅ Via Expedia | 3.2% conventional lodging; 1.2% car rentals | Expedia Group | ✅ Via Expedia affiliate API | Deep link | Part of Expedia Group; same affiliate account covers Hotels.com |
| **Skyscanner** | ✅ Active | ~20% of Skyscanner's revenue per booking (flexible, performance-based) | In-house (Partners) | ✅ Travel API — flight/hotel/car search, live pricing, deep links | Deep link to Skyscanner results | Primarily a metasearch engine; commissions are on Skyscanner's cut, not total fare |
| **Kayak** | ✅ Active | CPC (cost per click) model, not percentage; ~$0.50–$2.00 per click | In-house | ✅ API — flight/hotel/car search | Deep link to Kayak results | CPC model makes revenue less predictable than percentage-based programs |
| **Airbnb** | ❌ Ended 2021 | Program discontinued | — | ✅ Software Partner API (property management only — not for booking referrals) | N/A | Airbnb ended its affiliate program in March 2021; no referral revenue available |
| **VRBO / Expedia** | ✅ Via Expedia | 2% vacation rentals (via Expedia Group program) | Expedia Group | ✅ Via Expedia affiliate API | Deep link | VRBO is part of Expedia Group |
| **Rentalcars.com** | ✅ Active | 5–7% of rental value | CJ Affiliate | ✅ API — car search, availability, booking deep links | Deep link to pre-filled search | Owned by Booking Holdings (same parent as Booking.com) |
| **TripAdvisor** | ✅ Active | 50% of TripAdvisor's commission (~3–5% of booking value effective) | In-house | ✅ API — hotel search, reviews, pricing | Deep link to TripAdvisor property page | Effective rate on booking value is modest; strong for hotel discovery |
| **Viator** (TripAdvisor) | ✅ Active | 8% on experiences and tours | In-house | ✅ API — experience search, availability, booking | Deep link | Strong for activities/experiences; owned by TripAdvisor |

### 6b. Travel Revenue Model

*Based on a household taking 4–6 trips per year, average $2,000–$5,000 per trip.*

| Use Case | Average Booking Value | Commission Rate | Revenue per Booking |
|---|---|---|---|
| Hotel booking via Booking.com (25% of their ~15% cut) | $500/stay | ~3.75% effective | **~$19/stay** |
| Flight via Skyscanner | $400/ticket | ~$0.80–$2.00 CPC | **~$1–2/click** |
| Car rental via Rentalcars.com | $300/rental | 5–7% | **~$15–21/rental** |
| Vacation rental via VRBO/Expedia | $1,500/stay | 2% | **~$30/stay** |
| Tour/experience via Viator | $150/experience | 8% | **~$12/experience** |

For a household taking 4 trips per year with hotel, car, and one experience each: approximately **$250–$400/year** in travel affiliate revenue per household. At 100 households: **$25,000–$40,000/year** in travel affiliate revenue alone.

### 6c. The EA Travel Booking Use Case

Geeves is uniquely positioned to serve **Executive Assistants** who book travel for their principals. An EA using Geeves to research and book travel for a client generates affiliate revenue on every booking — flights, hotels, car rentals, and experiences — without any additional effort. This is a strong revenue driver for the EA-tier subscription model.

The EA travel workflow in Phase 2 would be:
1. EA opens Travel Assistant in Geeves
2. Searches flights/hotels/cars via integrated APIs (Skyscanner, Booking.com, Expedia)
3. Presents options to principal via the Geeves household interface
4. Principal approves; EA completes booking through Geeves affiliate deep link
5. Geeves earns affiliate commission on the completed booking

---

## 7. Booking Platform API — Commercial Model & Strategy

### 7a. The Three Tiers of Platform Access

The major short-term rental platforms (Airbnb, VRBO, Booking.com) offer API access in three distinct tiers, each with different commercial implications:

**Tier 1 — iCal (Current, Phase 1)**
- Read-only availability sync via iCal feed URLs
- No authentication required; no official API relationship
- Limitations: no guest data, no financial data, no real-time push, no booking management
- Status: **Live in Geeves Phase 1**

**Tier 2 — Connectivity Partner API (Phase 2 Target)**
- Official API relationship with the platform
- Requires application and approval as a "Connectivity Partner" or "Software Partner"
- Capabilities: read/write availability, rates, reservations, guest messaging, financial reporting
- Commercial model: **free for approved partners** — platforms want their inventory managed well
- Approval process: Airbnb requires a formal application; VRBO/Expedia uses Integration Central; Booking.com uses the Connectivity Portal
- **This is the right Phase 2 target for Geeves property management features**

**Tier 3 — Property Manager (PM) Account**
- Host upgrades their own account to PM status
- Gives the host (not Geeves) direct API access
- Geeves would need to be connected as the host's software tool
- More complex setup; requires host to take action on each platform

### 7b. Commercial Viability as a Product

The key question is whether Geeves can manage bookings for **end users who are not the API key holder**. The answer is yes, under the Connectivity Partner model:

- Geeves applies to become a Connectivity Partner on each platform
- Geeves holds the API credentials
- Hosts connect their listings to Geeves through an OAuth-style authorization flow on each platform
- Geeves manages availability, rates, and reservations on behalf of the host
- **The API belongs to Geeves; the host's access is mediated through Geeves**

This is exactly the model used by channel managers like Guesty, Hostaway, and Lodgify. When a host leaves Geeves, they disconnect their listings from the Geeves integration — the API credentials stay with Geeves.

### 7c. Platform-Specific Notes

**Airbnb:** The Software Partners program is invite-only for large-scale PMS providers. For smaller tools, Airbnb offers a more accessible "API-connected software" path where hosts connect their own accounts. Geeves should target the host-connected path initially, then apply for Software Partner status as the user base grows.

**VRBO (Expedia Group):** Integration Central is the application portal. VRBO distinguishes between "public API" (limited, no official relationship) and "official API" (full connectivity, requires approval). Geeves should apply for official API access.

**Booking.com:** The Connectivity Portal is the application path. Booking.com has a tiered partner program (Standard, Advanced, Premier) based on performance points. Geeves would start at Standard and progress as the platform grows.

### 7d. Revenue Potential as a Commercial Product

If Geeves evolves into a property management SaaS product (beyond personal use), the platform API integrations unlock a subscription revenue model:

| Tier | Properties Managed | Monthly Subscription | Annual Revenue |
|---|---|---|---|
| Personal (pilot) | 1–5 | Free / included | — |
| Small Host | 6–20 | $29/month | $348/year per host |
| Professional | 21–100 | $99/month | $1,188/year per host |
| Enterprise | 100+ | Custom | Custom |

At 100 small hosts: $2,900/month ($34,800/year) from property management subscriptions alone, on top of affiliate revenue.

---

## 8. Logo & Brand Usage — Summary Rules

When approved as an affiliate or connectivity partner, you may display the retailer's or platform's **name and approved badge/lockup** in the context of directing users to purchase or book. The universal rules are:

- ✅ Displaying a Walmart logo next to a shopping list item with a "Shop at Walmart" button is **permitted**
- ✅ Using Amazon's approved "Buy on Amazon" badge next to a product is **permitted**
- ✅ Showing a Booking.com logo in a hotel search result with a "Book on Booking.com" link is **permitted**
- ❌ Using any retailer or platform logo in Geeves **marketing materials** as if they endorse or partner with Geeves is **not permitted** without a separate partnership agreement
- ❌ Modifying any logo (colour, proportion, adding effects) is **never permitted**
- ❌ Using logos in offline/print materials is **not permitted** under most programs

Each program provides a brand asset kit upon approval. Always download and use the official assets.

---

## 9. Full Phase 2 Feature Scope

### 9a. Commerce & Shopping

| Feature | Priority | Notes |
|---|---|---|
| Shopping cart audit (`SHOPPING_CART_AUDIT.md`) | P0 — must precede all other commerce work | Document existing Walmart URL cart fully |
| Instacart Developer Platform integration | P1 | Full cart API, 15% commission, 1,400+ retailers |
| Walmart Affiliate Marketing API | P2 | Product search, ID cache, real-time pricing |
| Amazon Product Advertising API | P2 | Product lookup, cart URL composition |
| Multi-retailer shopping list routing | P3 | User sets preferred store per category |
| Affiliate link tracking and revenue dashboard | P3 | Admin view of affiliate earnings |
| URL deep links: Target, Home Depot, Lowe's, CVS, Walgreens, Costco | P3 | No API needed — URL composition only |
| DoorDash deep link integration | P3 | Restaurant ordering |
| Uber / Uber Eats deep link integration | P3 | Rides and food delivery |
| Lyft deep link integration | P3 | Rides |

### 9b. Travel Assistant

| Feature | Priority | Notes |
|---|---|---|
| Travel Assistant page (flight/hotel/car search) | P1 | Skyscanner API for flights; Booking.com/Expedia for hotels |
| Hotel search and booking deep links | P1 | Booking.com affiliate API |
| Flight search and booking deep links | P1 | Skyscanner affiliate API |
| Car rental search and booking deep links | P2 | Rentalcars.com affiliate API |
| Vacation rental search | P2 | VRBO/Expedia affiliate API |
| Experience/tour search | P3 | Viator API |
| EA travel booking workflow | P2 | EA searches, principal approves, EA books via affiliate link |
| Trip itinerary builder | P3 | Aggregate flight + hotel + car into one view |
| Travel calendar integration | P3 | Auto-create calendar events from confirmed bookings |

### 9c. Property Management — Platform API

| Feature | Priority | Notes |
|---|---|---|
| Airbnb Software Partner application | P1 | Apply for API access; initially host-connected path |
| VRBO Integration Central application | P1 | Apply for official API access |
| Booking.com Connectivity Partner application | P1 | Apply via Connectivity Portal |
| Availability and rates sync (read/write) | P2 | Replace iCal read-only with full read/write |
| Reservation management | P2 | Accept/decline/modify bookings via API |
| Guest messaging | P3 | Automated and manual guest communication |
| Financial reporting API | P3 | Replace email scraping with official financial data |
| Multi-property channel manager view | P3 | Unified availability calendar across all platforms |

### 9d. Calendar & Scheduling Enhancements

| Feature | Priority | Notes |
|---|---|---|
| Recurring event expansion (show each occurrence) | P2 | Currently only stores RRULE; expand to show instances |
| Attendee management (invite guests) | P2 | Add attendees to events with Google write-back |
| RSVP / accept/decline for invited events | P2 | Handle incoming event invitations |
| Calendar event search | P2 | Full-text search across all events |
| Reminders / push notifications | P2 | Browser push + email reminders before events |
| Calendar sharing with external users | P3 | Share a calendar view with non-Geeves users |
| Print / export calendar | P3 | PDF export of calendar view |

### 9e. Task Management Integrations

| Feature | Priority | Notes |
|---|---|---|
| Asana OAuth integration — bidirectional task sync | P2 | Tasks appear in Geeves; Geeves tasks sync to Asana |
| Google Keep integration — notes and tasks sync | P2 | Keep notes appear in Geeves tasks widget |
| WhatsApp direct integration (beyond import) | P3 | WhatsApp Business API for two-way messaging |

### 9f. Dashboard & UX Enhancements

| Feature | Priority | Notes |
|---|---|---|
| Modular/resizable dashboard widgets | P2 | Drag-to-reorder, resize handles, per-user layout persistence |
| Transforming Constellation animation | P2 | Nodes morph to domain icons on hover/expand |
| 3-year purchase history analysis engine | P2 | AI-powered spending pattern analysis across all import sources |
| Household onboarding flow for new Google sign-ins | P2 | Guided setup wizard for new households |

### 9g. Infrastructure & Connectivity

| Feature | Priority | Notes |
|---|---|---|
| Tailscale connectivity layer — Geeves Node onboarding | P2 | Hub/Node ACL sync, device registration |
| Smart home integration stub | P3 | Architecture only — no live integrations in Phase 2 |
| Microsoft OAuth login | P3 | Outlook/Hotmail account support |
| Facebook OAuth login | P3 | Meta account support |
| Instagram OAuth login | P3 | Via Meta OAuth, same app as Facebook |
| Apple Sign In | P4 | Required for iOS App Store distribution |

---

## 10. Phase 1 → Phase 2 Beta Acceleration

*Noted June 26, 2026:* If Phase 1 reaches a stable build by **Sunday June 29, 2026**, the following Phase 2 items may be pulled forward into the Phase 1 Beta program given their revenue potential and the fact that the foundational shopping cart work is already done:

1. Complete the shopping cart audit first (`SHOPPING_CART_AUDIT.md`)
2. Confirm the existing Walmart URL cart is production-ready
3. Add Instacart IDP as a fast follow (highest revenue impact — 15% commission)
4. Register for affiliate programs: Walmart Impact Radius, Instacart IDP, Amazon Associates
5. Add Travel Assistant stub with Booking.com and Skyscanner deep links (low implementation cost, immediate affiliate revenue)

---

## 11. Phase 1 Known Gaps Pulled Forward

The following items were listed as "Phase 2" in earlier documentation but have since been completed in Phase 1 and should be noted as resolved:

| Item | Resolution |
|---|---|
| Properties guest details (email scraping, contact info) | ✅ Completed — multiPlatformEmailScraper.ts, LLM parser, enriched booking cards |
| Properties revenue tracking (email scraping, financial data) | ✅ Completed — financial fields on property_bookings, PropertyRevenueSection widget |
| Resend branded email service (`invites@geeves.life`) | ✅ Completed — RESEND_API_KEY activated June 26, 2026; geeves.life domain verified |
| Family member interfaces (child/elder) | ✅ Completed — FamilyView.tsx with ChildView, ElderView, CaregiverView |
| Booking requests flow | ✅ Completed — BookingRequestDialog + BookingReviewDialog in CalendarView |

---

## 12. July 02, 2026 Sprint — Calendar Infrastructure Hardening

The following items were completed in an autonomous sprint on July 02, 2026. These are Phase 1 hardening items that strengthen the calendar and access-control infrastructure required before Phase 2 platform integrations can be safely built.

### 12a. Completed Items

| Item | Description |
|---|---|
| **P-52: Property filtering by allowedCalendarIds** | `properties.list`, `properties.getUpcomingEvents`, and `properties.getRevenueSummary` now filter results when a member has restricted `allowedCalendarIds` in `vertical_member_access`. A property manager scoped to specific properties sees only those properties. |
| **P-53: ResourcesWidget in Constellation Members** | The Resources tab in the MemberDetailSheet now renders a live `ResourcesWidget` (replaces the placeholder stub). Admins can add/edit/remove resource links; members see a read-only list. |
| **P-54: Meeting request access control** | `bookingRequests.create` enforces `canRequestMeetings` via `getMemberCalendarAccessBatch`. New `accessControl.getMyAccessibleVerticals` procedure returns only verticals where the caller has meeting-request permission. `BookingRequestDialog` uses this filtered list. |
| **Shadow Block Backfill** | Full backfill of 1,503 StartOut events that had 0 shadow blocks due to rate-limiter trips during sync bursts. Resolved by adding `skipRateLimit` option to `onEventUpserted` and processing events sequentially in the backfill handler. |
| **Propagation Retry Queue** | New `propagation_queue` table and `/api/scheduled/propagation-retry` heartbeat handler. When circuit breaker or rate limiter blocks a write, the event is enqueued for automatic retry with exponential backoff (1m→4m→9m→16m→25m, max 5 attempts). Prevents stale shadow blocks from missed event updates. |
| **Repropagate-Event Endpoint** | New `POST /api/internal/repropagate-event` admin endpoint to force re-propagate a single event. Used to fix the Allison//Tarik 1:1 stale SB incident where a rescheduled meeting's shadow blocks remained at the old time. |

### 12b. Root Cause Analysis — Stale Shadow Blocks

The Allison//Tarik 1:1 meeting was rescheduled from 1:00 PM to 11:45 AM. The Google Calendar webhook fired correctly, the event was updated in the DB, and `onEventUpserted` was called. However, the circuit breaker was tripped (from a concurrent backfill operation), so the re-propagation was silently blocked. The old shadow blocks remained at 1:00 PM on all target calendars.

The propagation retry queue now ensures this scenario is impossible: blocked propagations are enqueued and retried within 1–2 minutes.

### 12c. Cross-Platform Architecture (Future)

The retry queue is platform-agnostic — it operates at the `onEventUpserted` level. Any future calendar source (Microsoft Graph, Apple CalDAV) automatically benefits from it. The architecture supports:

| Platform | Trigger Mechanism | Status |
|---|---|---|
| Google Calendar | Push webhooks (7-day TTL) → incremental sync | ✅ Live + retry queue |
| Microsoft Outlook | Graph subscriptions (3-day TTL) → delta query | Future — same retry queue applies |
| Apple iCloud | CalDAV REPORT polling (10 min) → diff detection | Future — same retry queue applies |

### 12d. Test Sheet Delivered

A 10-case test sheet (`docs/TEST_SHEET_PM_ROLE_ENIOLA.md`) was created for Eniola to test the property manager role. Covers account creation, calendar busy-only masking, property scope enforcement, resources widget, meeting requests, PII exclusion, vertical scope enforcement, read-only resources, and session persistence. Includes 5 additional recommended test cases.

The following items remain genuinely deferred to Phase 2:

| Item | Phase 2 Section |
|---|---|
| Recurring event expansion | §9d |
| Attendee management | §9d |
| Calendar event search | §9d |
| Reminders / push notifications | §9d |
| Asana + Google Keep integration | §9e |
| Modular/resizable dashboard widgets | §9f |
| Platform API connectivity (Airbnb, VRBO, Booking.com) | §9c |
| Tailscale / Geeves Node connectivity | §9g |
| 3-year purchase history analysis | §9f |
| Transforming Constellation animation | §9f |

---

*Last updated: July 02, 2026 by Manus AI*
