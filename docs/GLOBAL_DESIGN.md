# Geeves — Global Design Document

**Version:** 1.8 — Updated June 27, 2026  
**Project:** Geeves Life Management Platform  
**Live URL:** https://geeves.manus.space  
**Repository path:** `/home/ubuntu/geeves-shopping`  
**Manus project:** `geeves-shopping` (nKRUueEwEcFgrDnsh3N8Ek)

---

## 1. Vision & Purpose

Geeves is a **personal life management platform** built for Tarik Perkins (Supah-T) and the TJ Perkins Family household. It functions as a unified command centre that pulls together all aspects of life management — calendar, shopping, finances, property management, household coordination, and AI assistance — into a single coherent interface. The platform is named after the archetype of the perfect personal assistant, with the AI layer embodied as "Geeves."

The platform is designed to serve **all family formations** without assumption or bias, supporting single-parent households, co-parenting arrangements, polyamorous families, multigenerational households, chosen families, and any other configuration. No family structure is assumed or privileged in the data model or UI copy.

---

## 2. Technical Stack

### Runtime & Framework

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 19.2.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui + Radix UI | Latest |
| API Layer | tRPC | 11.x |
| Backend | Express | 4.x |
| Database ORM | Drizzle ORM | 0.44.x |
| Database | MySQL / TiDB (cloud) | — |
| Auth | Manus OAuth + Google OAuth 2.0 | — |
| Real-time | Socket.io | 4.8.x |
| Build Tool | Vite | — |
| Language | TypeScript (strict) | — |
| Test Runner | Vitest | 2.1.x |
| Package Manager | pnpm | — |

### Key Dependencies

```
google-auth-library   — Google OAuth 2.0 + Service Account JWT
jose                  — JWT signing/verification for session cookies
nanoid                — ID generation for all DB records
socket.io             — Real-time event broadcasting
drizzle-orm + mysql2  — Database access
date-fns              — Date manipulation
framer-motion         — UI animations
recharts              — Charts and data visualisation
lucide-react          — Icon library
next-themes           — Dark/light theme management
streamdown            — Markdown streaming renderer for AI responses
```

---

## 3. Project Structure

```
/home/ubuntu/geeves-shopping/
├── client/
│   ├── index.html              ← Google Fonts CDN links (Outfit + Inter) + favicon tags
│   ├── public/                 ← Static assets (favicon.svg, favicon-32.png, favicon-192.png)
│   └── src/
│       ├── _core/              ← Auth hooks (useAuth, getLoginUrl)
│       ├── components/
│       │   ├── DashboardLayout.tsx         ← Sidebar nav + auth shell
│       │   ├── DashboardLayoutSkeleton.tsx
│       │   ├── AIChatBox.tsx               ← Reusable chat UI with streaming
│       │   ├── GeevesChat.tsx              ← Animated brand-mark agent + chat panel
│       │   ├── GeevesLogo.tsx              ← Brand mark SVG components (GeevesConstellationMark, GeevesWordmark)
│       │   ├── ConnectCalendarDialog.tsx   ← Google Calendar connect flow
│       │   ├── LocationAutocomplete.tsx    ← Google Maps Places autocomplete
│       │   ├── Map.tsx                     ← Google Maps proxy component
│       │   ├── ManusDialog.tsx
│       │   └── ui/                         ← shadcn/ui components
│       ├── hooks/
│       │   ├── useMobile.ts                ← useIsMobile hook
│       │   └── useRealtime.ts              ← Socket.io subscription hooks
│       ├── lib/
│       │   └── trpc.ts                     ← tRPC client binding
│       ├── pages/
│       │   ├── Home.tsx                    ← Dashboard (life command centre)
│       │   ├── CalendarView.tsx            ← Master calendar (day/2-day/week/month)
│       │   ├── Household.tsx               ← Household management + member invites
│       │   ├── Join.tsx                    ← Invite claim page (/join?token=...)
│       │   ├── Notes.tsx                   ← Notes CRUD with vertical filtering
│       │   ├── Properties.tsx              ← Property management CRUD + booking calendar
│       │   ├── Settings.tsx                ← Profile / Calendars / Household tabs
│       │   ├── Family.tsx                  ← Household members (Users)
│       │   ├── Shopping.tsx                ← Shopping lists
│       │   ├── ShoppingListDetail.tsx      ← List items + Shop Agent trigger
│       │   ├── ShopAgent.tsx               ← Autonomous shopping agent UI
│       │   ├── Orders.tsx                  ← Order history
│       │   ├── OrderPrep.tsx               ← Order preparation
│       │   ├── Accounts.tsx                ← Bank accounts
│       │   ├── Expenses.tsx                ← Expense management
│       │   ├── WhatsAppImport.tsx          ← WhatsApp list parser
│       │   ├── ScanList.tsx                ← Handwritten list scanner
│       │   ├── Verticals.tsx               ← Verticals management
│       │   └── NotFound.tsx
│       ├── App.tsx                         ← Routes and layout wiring
│       ├── main.tsx                        ← Providers
│       └── index.css                       ← Global theme tokens
├── server/
│   ├── _core/
│   │   ├── context.ts            ← tRPC context (user, session)
│   │   ├── env.ts                ← Environment variable registry
│   │   ├── llm.ts                ← LLM invocation helper (invokeLLM)
│   │   ├── imageGeneration.ts    ← Image generation helper
│   │   ├── voiceTranscription.ts ← Whisper transcription helper
│   │   ├── map.ts                ← Google Maps proxy helper
│   │   ├── notification.ts       ← Owner notification helper
│   │   └── oauth.ts              ← Manus OAuth flow
│   ├── auth/
│   │   ├── googleOAuth.ts        ← Google OAuth 2.0 login + callback
│   │   ├── googleAccountConnect.ts ← Add additional Google accounts to session
│   │   ├── providers.ts          ← GoogleAuthProvider (scopes, token exchange)
│   │   └── rbac.ts               ← Role-based access control helpers
│   ├── services/
│   │   ├── googleCalendarSync.ts ← Token refresh + Google Calendar API helpers
│   │   ├── calendarWebhook.ts    ← Sync orchestration, webhook handler, startup registration
│   │   ├── gmailSend.ts          ← Gmail API email sender (invite emails)
│   │   ├── icalAggregator.ts     ← iCal feed fetcher + merger (Phase 1 — properties)
│   │   └── conflictDetector.ts  ← Double-booking detection (ConflictEntry, BackToBackEntry, ConflictReport)
│   ├── scheduledHandlers/
│   │   ├── knowledgeReview.ts   ← 24h heartbeat: regenerates docs/AI_MEMORY.md from project_knowledge DB
│   │   └── icalPoll.ts          ← 10-min heartbeat: polls all active property iCal feeds
│   ├── routers/
│   │   ├── calendar.ts           ← Calendar + events tRPC procedures
│   │   ├── household.ts          ← Household + members tRPC procedures
│   │   ├── notes.ts              ← Notes tRPC procedures
│   │   ├── properties.ts         ← Properties tRPC procedures
│   │   └── verticals.ts          ← Verticals tRPC procedures
│   ├── routers.ts                ← Root appRouter (wires all sub-routers)
│   ├── db.ts                     ← All database query helpers
│   ├── tokenEncryption.ts        ← AES-256-GCM token encrypt/decrypt (key derived from JWT_SECRET)
│   ├── realtime.ts               ← Socket.io setup, room management, emit helpers
│   ├── *.test.ts                 ← Vitest test files (142 tests total)
│   └── index.ts                  ← Express server entry point (helmet, rate-limit, routes)
├── drizzle/
│   └── schema.ts                 ← All database table definitions
├── storage/
│   └── index.ts                  ← S3 helpers (storagePut, storageGet)
├── shared/                       ← Shared constants and types
├── docs/
│   ├── GLOBAL_DESIGN.md          ← This document
│   ├── PHASE_1.md                ← Phase 1 detailed specification (v1.8 current)
│   ├── BRANDING.md               ← Canonical brand guidelines (colours, typography, logo geometry)
│   ├── DESIGN_PRINCIPLES.md      ← Inclusivity and role architecture rules
│   ├── PERFORMANCE.md            ← Calendar + Gantt load-time analysis and optimisation roadmap
│   ├── SECURITY_ASSESSMENT.md    ← ISO 27001 gap analysis and compliance roadmap
│   └── AI_MEMORY.md              ← Auto-generated AI memory reference (24h heartbeat)
├── todo.md                       ← Feature tracking (all items)
└── package.json
```

---

## 4. Database Schema

All tables use `nanoid()` string IDs unless noted. All timestamps are stored as UTC milliseconds (bigint) or MySQL datetime. The database is MySQL/TiDB accessed via Drizzle ORM.

### Core Platform Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `users` | Platform-level user accounts | `id` (int, auto), `openId`, `name`, `email`, `role` (user\|system_admin), `avatarUrl` |
| `households` | Household groupings | `id` (nanoid), `name`, `createdByUserId` (audit only), `wakeWord`, `timezone` |
| `household_members` | Members within a household | `id`, `householdId`, `userId`, `displayName`, `role`, `email`, `avatarUrl`, `pronouns`, `genderIdentity`, `relationshipLabel`, `isBillingContact`, `accessibilityMode`, `status`, `inviteToken`, `inviteTokenExpiresAt`, `invitedAt`, `joinedAt` |
| `verticals` | Life domains (Home & Family, Maxfield Bakery, etc.) | `id`, `householdId`, `name`, `icon`, `color`, `description`, `sortOrder`, `isActive`, **`privacyLevel`** (household\|admin_only\|private) |
| `vertical_owners` | Owners of a vertical (can be outside household) | `id`, `verticalId`, `userId`, `role` (owner\|co_owner), `addedAt` |
| `vertical_integrations` | Services connected to a vertical | `id`, `verticalId`, `type` (calendar\|email\|task_app\|security_app), `provider`, `accountEmail`, `displayName`, `calendarId`, `status`, `metadata` |
| `vertical_visibility` | Cross-vertical visibility config | `id`, `fromVerticalId`, `toVerticalId`, `visibility` (none\|busy_only\|full), **`busyLabel`** (custom text, e.g. "OOO", "Focus Time") |
| `subscriptions` | Billing and plan tracking | `id`, `householdId`, `plan`, `seats`, `status`, `stripeId`, `currentPeriodEnd` |

### Calendar & Sync Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `calendars` | Connected calendar accounts | `id`, `householdId`, `memberId`, `verticalId`, `accountEmail`, `provider` (google_workspace\|google_personal\|ical), `externalId`, `name`, `color`, `syncType`, `isPrimary`, `accessLevel` |
| `events` | Calendar events | `id`, `householdId`, `calendarId`, `externalId`, `title`, `description`, `startTime`, `endTime`, `isAllDay`, `location`, `recurrenceRule`, `status`, `visibility`, `attendees`, `reminders`, `videoCallUrl` |
| `shadow_blocks` | Privacy masking for shared calendars | `id`, `householdId`, `sourceEventId`, `targetCalendarId`, `maskedTitle`, `isDismissed` |
| `oauth_tokens` | Google OAuth access/refresh tokens | `id`, `userId`, `provider`, `accountEmail`, `accessToken`, `refreshToken`, `expiresAt` — unique on (userId, provider, accountEmail) |
| `webhook_channels` | Google Calendar push notification channels | `id`, `calendarId`, `channelId`, `resourceId`, `expiration` |
| `sync_log` | Calendar sync history and status | `id`, `calendarId`, `syncType`, `status`, `eventsSynced`, `startedAt`, `completedAt` |
| **`booking_requests`** | Time-booking requests from members | `id`, `householdId`, `requesterId`, `targetMemberId`, `targetCalendarId`, `proposedStart`, `proposedEnd`, `message`, `status` (pending\|accepted\|declined), `responseNote`, `createdAt` |

### Property & Notes Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `properties` | Owned and managed properties | `id`, `householdId`, `name`, `address`, `type` (primary_residence\|rental_str\|rental_ltr\|commercial\|vacation\|investment\|other), `isActive`, `verticalId`, `propertyEmail`, `leaseDocumentUrl`, `monthlyRentAmount`, `currency` |
| **`property_platforms`** | Platform feeds per property | `id`, `propertyId`, `platform` (airbnb\|vrbo\|booking_com\|direct\|zillow\|apartments_com\|other), `icalInboundUrl`, `icalOutboundKey` (S3 key for hosted outbound ICS), `isActive` |
| **`property_prep_rules`** | Blackout/prep rules per property | `id`, `propertyId`, `blockDaysBefore`, `blockDaysAfter`, `blockNationalHolidays`, `blockSundays`, `customBlockDays` (JSON array of specific dates), `updatedAt` |
| **`property_bookings`** | Merged booking records per property | `id`, `propertyId`, `platform`, `externalUid`, `guestName`, `guestEmail`, `guestPhone`, `checkIn`, `checkOut`, `grossAmount`, `netPayout`, `currency`, `status` (confirmed\|cancelled\|pending), `notes`, `rawIcalData`, `lastSyncedAt` |
| `notes` | Household notes | `id`, `householdId`, `memberId`, `verticalId`, `eventId`, `title`, `content`, `source` (text\|voice\|tablet\|phone), `isCompleted`, `reminderAt` |
| `devices` | Smart home device stubs | `id`, `householdId`, `name`, `type`, `location`, `status` |
| **`booking_overrides`** | Guest name annotations for anonymous iCal blocks | `id`, `bookingId`, `guestName`, `guestEmail`, `notes`, `createdBy`, `createdAt`, `updatedAt` |
| **`project_knowledge`** | AI memory knowledge base | `id`, `category`, `key`, `value`, `sourceDoc`, `lastReviewedAt`, `updatedAt` |

### Shopping & Commerce Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `shopping_lists` | Shopping lists | `id`, `householdId`, `memberId`, `name`, `category`, `status`, `isRecurring`, `recurringSchedule` |
| `shopping_list_items` | Items within lists | `id`, `listId`, `name`, `quantity`, `unit`, `notes`, `isPurchased`, `estimatedPrice`, `brand`, `preferredPlatform` |
| `orders` | Purchase orders (Walmart, Amazon, etc.) | `id`, `householdId`, `memberId`, `platform`, `retailer`, `orderNumber`, `orderDate`, `status`, `totalAmount`, `currency`, `items` (JSON) |
| `shopping_sessions` | Autonomous shopping agent sessions | `id`, `householdId`, `listId`, `status`, `platform`, `items`, `report`, `createdAt` |
| `shopping_session_items` | Items within a shopping session | `id`, `sessionId`, `name`, `quantity`, `status`, `matchedProductId`, `cartUrl`, `substitutionNote` |
| `platform_credentials` | Encrypted Walmart/Amazon credentials | `id`, `householdId`, `platform`, `username`, `encryptedPassword` |
| `product_mappings` | Product ID cache (Walmart item IDs, Amazon ASINs) | `id`, `householdId`, `platform`, `productName`, `productId`, `productUrl`, `lastVerified` |
| `whatsapp_imports` | WhatsApp message parse history | `id`, `householdId`, `rawText`, `parsedItems`, `createdAt` |

### Financial Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `bank_accounts` | Bank and credit card accounts | `id`, `householdId`, `memberId`, `accountName`, `institution`, `accountType`, `currency`, `currentBalance`, `isActive` |
| `transactions` | Financial transactions | `id`, `householdId`, `accountId`, `date`, `description`, `amount`, `currency`, `category`, `isPersonal`, `isBusiness`, `receiptUrl` |
| `exchange_rates` | USD/JMD exchange rates | `id`, `fromCurrency`, `toCurrency`, `rate`, `updatedAt` |

### AI & Communication Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `chat_messages` | Geeves chat history | `id`, `householdId`, `userId`, `role` (user\|assistant), `content`, `createdAt` |
| `family_members` | Legacy family member profiles (pre-household model) | `id`, `userId`, `name`, `relationship`, `avatarUrl`, `clothingSizes`, `dietaryRestrictions` |

---

## 5. Authentication Architecture

Geeves supports two authentication paths that operate simultaneously.

**Google OAuth 2.0 (Primary)** is the preferred login method. The flow begins at `/api/auth/google/login` where the server generates an authorization URL using `GOOGLE_CLIENT_ID`. After the user consents, Google redirects to `/api/auth/google/callback`. The server exchanges the code for tokens, upserts the user into the `users` table, stores tokens in `oauth_tokens`, creates a JWT session cookie, and redirects to the app. If the user has no household, they are redirected to the household onboarding flow.

**Google OAuth scopes requested (as of June 16, 2026):**
- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.send`

The `gmail.send` scope was added on June 16, 2026 to enable the Gmail API invite email sender. Because `prompt: "consent"` is set, the new scope will be granted on the user's next login.

**Add Additional Google Account** — a separate flow at `/api/auth/google/connect-account` allows an already-authenticated user to add additional Google accounts (e.g., personal Gmail, Workspace accounts) without replacing their session. Each connected account gets its own `oauth_tokens` row and its calendars are auto-discovered.

**Manus OAuth (Fallback)** uses the platform's built-in OAuth at `/api/oauth/callback`. This remains active as a fallback for users without Google accounts.

**Session management** uses JWT cookies signed with `JWT_SECRET`. The tRPC context (`server/_core/context.ts`) decodes the cookie on every request and populates `ctx.user`.

### Environment Secrets

| Secret | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email for Workspace domain-wide delegation |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service account private key (PEM) |
| `JWT_SECRET` | Session cookie signing secret |
| `DATABASE_URL` | MySQL/TiDB connection string |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side LLM, storage) |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus built-in API key (frontend) |

---

## 6. Branding

### Brand Mark

The Geeves brand mark is a **7-node geometric constellation** representing a stylised arch/house form. It is implemented as a pure React SVG component in `client/src/components/GeevesLogo.tsx` and used as the single source of truth for the mark across the entire application.

Full brand guidelines, node geometry, and colour specifications are in **`docs/BRANDING.md`**.

### Typography

**Outfit Bold 700** is used for the wordmark and headings. **Outfit Light 300** is used for the greeting salutation and tagline. **Inter** is used for all body text and UI labels. **Nunito** is loaded as a fallback in the font stack (the original brand SVGs used Nunito). All fonts are loaded via Google Fonts CDN in `client/index.html`.

**Critical:** The wordmark must always be Bold 700. Using `font-light` for the wordmark is a brand non-conformance.

### Colour System

The platform uses a **dual dark/light theme** defined in `client/src/index.css` using Tailwind 4's `@theme inline` block with OKLCH colour values. The primary brand colour is **Vivid Teal `#2AAFA9`**. Only the 6 brand rainbow colours and 5 foundation colours are permitted — see `docs/BRANDING.md §3`.

### Favicon

`favicon.svg` (scalable), `favicon-32.png` (browser tab), and `favicon-192.png` (iOS home screen / PWA) are all generated from the brand mark geometry and served from `client/public/`. The browser tab `theme-color` is `#2AAFA9`.

---

## 7. Role-Based Access Control

### Platform Roles

`users.role` is either `user` or `system_admin`. The `system_admin` role is invisible to families and used only by the developer for platform management.

### Household Roles

`household_members.role` determines what each member can see and do within their household. The permission matrix is enforced in `server/auth/rbac.ts` via the `requirePermission` helper.

### Revised Permission Matrix (v1.5 — Phase 1 Pull-Forward)

The access model was redesigned on June 16, 2026 to correctly separate EA and member capabilities, and to enforce vertical-scoped calendar visibility.

| Permission | `household_admin` | `ea` | `member` | `caregiver` | `child` | `elder` |
|---|---|---|---|---|---|---|
| `calendar.view_vertical` | ✅ All verticals | ✅ All non-blind verticals | ✅ Own verticals only | ✅ Assigned only | ✅ Assigned only | ✅ Assigned only |
| `calendar.view_busy_cross_vertical` | ✅ | ✅ Always (min floor) | ✅ Per visibility rules | ❌ | ❌ | ❌ |
| `calendar.edit` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `calendar.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `booking.request` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `booking.approve` | ✅ | ✅ (on verticals they have access to) | ❌ | ❌ | ❌ | ❌ |
| `shadow.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `vertical.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `property.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Vertical Privacy Levels

Each vertical has a `privacyLevel` field that determines who can see it at all:

| Privacy Level | Who can see the vertical |
|---|---|
| `household` | All household members (default) |
| `admin_only` | Only `household_admin` members — EA and below are completely blind |
| `private` | Only the vertical's named owners |

When a vertical is set to `admin_only` or `private`, members without access cannot see it in the calendar sidebar, cannot see events from it, and cannot receive `busy_only` shadow blocks from it. The vertical does not appear in any list for those members.

**EA floor rule:** Even on verticals where EA has access, EA always sees at minimum `busy_only` blocks from all other verticals — EA can never be set to `none` for any vertical. This prevents accidental double-booking.

### Cross-Vertical Visibility

The `vertical_visibility` table stores per-pair visibility settings between verticals. The `busyLabel` field allows the owner to customise what the shadow block label says (e.g. "OOO", "Focus Time", "Personal", or any free-text string up to 50 characters). The default label is "Busy".

| Visibility Level | What the viewer sees |
|---|---|
| `full` | Full event title and details |
| `busy_only` | Shadow block with the configured `busyLabel` (default: "Busy") |
| `none` | Nothing — the time slot appears free (UI shows a warning when setting this) |

**Default:** `busy_only` for all new vertical pairs.

---

## 8. Calendar Access Model

### How `events.list` Works (Revised)

The `events.list` procedure now applies a three-layer filter:

1. **Vertical access filter** — determine which verticals the requesting member can see based on their role and the vertical's `privacyLevel`. Members only see calendars belonging to verticals they have access to.

2. **Cross-vertical visibility filter** — for calendars in verticals the member has access to, fetch real events. For calendars in verticals the member does not have access to but where `busy_only` visibility applies, synthesise shadow blocks using the configured `busyLabel`. For verticals set to `none`, show nothing.

3. **EA floor rule** — EA always receives at least `busy_only` blocks from all verticals, regardless of the visibility setting.

### Booking Request Flow

Members (and any role without `calendar.edit`) can request time from a vertical owner or EA by submitting a `booking_request`. The flow is:

1. Member selects a free slot on the calendar (a slot with no events or only `busy_only` blocks)
2. Member submits a booking request with a message
3. The vertical owner or EA receives a notification and sees the request in their Household page
4. On accept: the server creates a real event on the target calendar and propagates shadow blocks to all other verticals (using the same `propagateShadowBlocks` logic as event creation)
5. On decline: the member receives a notification with the optional response note
6. Accepted external Google Calendar invites also trigger shadow block propagation on sync update

---

## 9. Dashboard

The dashboard (`/`) is the life management command centre. It uses a **personalised, draggable widget layout** powered by the `WidgetGrid` component and the `widget_layouts` DB table.

| Widget | Data Source | Status |
|---|---|---|
| Calendar | `trpc.calendar.events.list` | ✅ Live |
| Properties | `trpc.properties.list` + `trpc.properties.getUpcomingEvents` | ✅ Live |
| Shopping | `trpc.shopping.lists.list` | ✅ Live |
| Financials | `trpc.banking.accounts.list` | ✅ Live |
| Constellation | `trpc.household.getMembers` | ✅ Live |
| Tasks | Stub — "Coming Soon" | ⏳ Phase 2 |
| Geeves Chat | Floating pill button | ✅ Live |

**Key design decisions (Jul 2026):**
- **Personalised layout:** `WidgetGrid` loads each user's saved widget order and visibility from `widget_layouts` via `trpc.dashboard.getLayout`. On first visit, the default order is used. Reordering and visibility changes are saved immediately via `trpc.dashboard.saveLayout`.
- **Drag-to-reorder:** Desktop uses mouse drag handles; mobile uses long-press + drag. An "Edit Layout" mode toggle activates drag handles and visibility toggles.
- **Stale-while-revalidate:** All calendar and property queries use `staleTime: 30_000` + `placeholderData: keepPreviousData` so navigating between periods never shows a blank state.
- **Greeting header:** Time-of-day salutation with the user's first name. Daily summary generated from live data (event count + active list count).
- **Mobile:** Single-column stacked layout. Horizontal snap carousel available via toggle.

---

## 10. Calendar System

### Vertical Colour Coding (Updated June 16, 2026)

Calendar events now inherit the **vertical's colour** rather than the individual calendar's stored colour. The `CalendarView` component fetches all verticals and builds a `calendarId → verticalColor` lookup map. Calendars not assigned to any vertical fall back to their stored calendar colour.

### Google Calendar Sync

The sync service implements full sync, incremental sync (via `syncToken`), and webhook push notifications. Multi-account token routing handles Workspace service account impersonation for `@tjperkinsfam.com`, `@maxfieldbakery.com`, and `@maxfieldmarket.com`, and stored OAuth tokens for personal Gmail and third-party Workspace accounts.

### Shadow Blocks (Privacy Masking)

When an event is created on a calendar belonging to a vertical, the server automatically creates shadow blocks on all sibling calendars in the same vertical. Shadow blocks render as dashed-border entries in both TimeGridView and MonthView. The `maskedTitle` field stores the configured `busyLabel` for cross-vertical blocks.

### Real-Time Updates

Socket.io broadcasts `calendar:event:created/updated/deleted`, `calendar:shadow:updated`, and `calendar:sync:status` events to all household members in the same room. The `useRealtimeCalendar` hook invalidates React Query caches on receipt.

---

## 11. Properties System

### Overview

The Properties system manages all owned and managed real estate. It is divided into two property categories with distinct platform ecosystems:

| Category | Type Field | Supported Platforms |
|---|---|---|
| Short-Term Rental | `rental_str` | Airbnb, VRBO, Booking.com, Direct |
| Long-Term Rental | `rental_ltr` | Zillow, Apartments.com, Direct |
| Other | `primary_residence`, `commercial`, `vacation`, `investment`, `other` | N/A (no platform feeds) |

### Multi-Platform iCal Architecture

Each property can have **multiple platform feeds** via the `property_platforms` table. Each platform feed has:

- **Inbound iCal URL** (`icalInboundUrl`) — the platform's calendar export URL that Geeves polls to import bookings
- **Outbound iCal key** (`icalOutboundKey`) — the S3 key for the Geeves-hosted outbound ICS file that the platform subscribes to for blackout dates

Geeves acts as an **iCal aggregator**: it polls all inbound feeds for a property, merges them into a single unified booking calendar, detects conflicts (overlapping bookings from different platforms), and flags them as alerts. The merged calendar is then assigned to the property's vertical.

**Outbound ICS hosting:** The outbound ICS file is hosted at a stable URL derived from the S3 key. Each platform subscribes to this URL. When Geeves applies a blackout date or prep rule, it regenerates the outbound ICS and the platform picks up the change on its next poll. Each blocked slot in the outbound ICS includes a `DESCRIPTION` field explaining the reason (e.g. "Preparation time — 1 day after booking", "Blackout date set by Geeves", or the vertical event title if blocked by a calendar event).

### Prep Rules

Prep rules are stored per property in `property_prep_rules`:

- **Block days before** — number of days to block before each booking (default 0)
- **Block days after** — number of days to block after each booking (default 1)
- **Block national holidays** — boolean; if true, no check-in or check-out on US national holidays
- **Block Sundays** — boolean; if true, no check-in or check-out on Sundays
- **Custom block days** — JSON array of specific dates to always block

Prep rules are applied when regenerating the outbound ICS. They are not applied retroactively to confirmed bookings already on the calendar.

### Blackout Dates

Blackout dates can be set in two ways:

1. **Manual blackout** — set by a vertical owner or EA with vertical access via the Properties page. Creates a blocked slot in the outbound ICS with the reason "Blackout date set by Geeves."
2. **Rule-based blackout** — triggered automatically by prep rules (see above).
3. **Calendar-driven blackout** — when a calendar event is created on a vertical that the property belongs to, Geeves can optionally propagate that block to the property's outbound ICS. The description in the ICS will say "Owner unavailable" (not the event title, for privacy).

### Long-Term Rental Features

Long-term rental properties (`rental_ltr`) support:
- Lease document storage (PDF uploaded to S3, URL stored in `properties.leaseDocumentUrl`)
- Monthly rent amount and currency stored in `properties.monthlyRentAmount`
- Tenant information stored in `property_bookings` (guest fields repurposed as tenant fields)
- Revenue displayed as a fixed monthly card in the Properties widget

### Properties Widget (Dashboard) — Jul 2026 Redesign

The Properties widget uses a **carousel** layout — one property at a time with left/right arrow navigation and swipe gesture support.

**Per-property card:**
- Property name, type badge (rental_str / rental_ltr / etc.), vertical colour dot
- Horizontal booking Gantt (8-day default window, 15-day toggle)
- Anchored scrollable list of the next 5 upcoming check-ins/check-outs for that property
- Dot pagination indicator when the household has multiple properties

**Gesture behaviour:**
- Swipe left/right → advance to next/previous property
- Swipe left/right on the Gantt → advance the Gantt window by one day
- Pinch in → zoom out to wider Gantt window; pinch out → zoom in to narrower window

**Cross-property conflict badge:** The widget card header shows a red conflict badge when any property has future double-booking conflicts.

### Properties Page — Jul 2026 Redesign

The full Properties page (`/properties`) uses a **sidebar + detail** split layout:

**Desktop (lg+):**
- Left sidebar: scrollable list of property selector cards, each showing property name, type badge, address, and edit/delete action buttons
- Right panel: inline `PropertyDetail` component (no slide-over) for the selected property. Includes all tabs: Bookings (Gantt), Platforms, Prep Rules, Revenue.
- Stats bar at the top: total properties, active count, rental count

**Mobile:**
- Horizontal swipe carousel of property summary cards; tap to expand inline detail below

**Preserved sub-components:** `PlatformManager`, `PrepRulesEditor`, `BookingsTab`, `PropertyDetail` — all unchanged from previous version. All create/edit/delete dialogs preserved.

### Guest Details (Phase 2)

In Phase 2, clicking a booking will open a guest detail sheet showing:
- Guest name, email, phone (from email scraping or platform API)
- Booking platform and reference number
- Gross booking amount and net payout (with toggle)
- Quick email action links (pre-composed Gmail drafts)
- Platform API integration for live guest data (Airbnb, VRBO, Booking.com APIs where available)

---

## 12. Shopping System

The shopping system is the most mature feature set, built across multiple iterations.

**Shopping Lists** — Full CRUD with categories, recurring schedules, and inline item editing. Items can be moved between lists.

**Shop Agent** — The autonomous shopping agent manages a session lifecycle: `pending_credentials → ready → shopping → review → approved/cancelled`. It searches Walmart and Amazon for each item, handles cross-platform fallback, tracks substitutions, detects cart conflicts, and generates a consolidated report.

**Order Import** — 42 Walmart orders (Jul 2025–Feb 2026) and 24 Amazon orders (Dec 2024–Feb 2025) were imported from Gmail via AI email parsing.

**Product Mapping Cache** — The `product_mappings` table caches Walmart item IDs and Amazon ASINs. 50 Walmart product IDs are seeded from purchase history.

**WhatsApp Import** — Copy-paste WhatsApp messages are parsed by the LLM to extract structured items, cross-referenced against order history.

**Scan List** — Handwritten shopping lists can be photographed and uploaded. The LLM vision API parses the image into structured items.

---

## 13. Verticals System

Verticals are the **core organisational layer** of Geeves. Every calendar, email account, task app, and future integration belongs to exactly one vertical.

### Rules

- A calendar belongs to exactly one vertical (`calendars.verticalId`)
- A vertical can have many calendars, email accounts, task apps, and security apps
- Cross-vertical visibility defaults to `busy_only` (updated from `none` on June 16, 2026)
- Vertical owners can be any Geeves subscriber — not required to be a household member
- A vertical can have multiple co-equal owners
- Each vertical has a `privacyLevel` controlling who can see it at all

### TJ Perkins Default Verticals

| Vertical | Brand Colour | Hex | Google Account | Account Type |
|---|---|---|---|---|
| Home & Family | Coral Red | `#E8624A` | tarik@tjperkinsfam.com | Workspace (service account) |
| Maxfield Bakery | Indigo Blue | `#4F7EC4` | tarik@maxfieldbakery.com | Workspace (service account) |
| Maxfield Market | Golden Yellow | `#D4A017` | tarik@maxfieldmarket.com | Workspace (service account) |
| Personal | Bold Violet | `#8B5CF6` | tarikp@gmail.com | Personal Gmail (OAuth) |
| StartOut | Amber Orange | `#E8943A` | tarik.perkins@startout.org | Third-party Workspace (OAuth) |

**Note:** Vertical colours were corrected on June 17, 2026 to use the brand rainbow palette. The previous colours (Tailwind Emerald, Amber, Orange, Indigo, Purple) were off-brand.

### Backend Procedures (`trpc.verticals.*`)

`list`, `create`, `update`, `delete`, `addOwner`, `removeOwner`, `listOwners`, `addIntegration`, `removeIntegration`, `listIntegrations`, `setVisibility`, `getVisibility`, `assignCalendar`, `unassignCalendar`, `seedDefaults`

---

## 14. Household & Invite System

### Household Management

The Household page (`/household`) allows `household_admin` members to view/edit household settings, view all members, invite new members, and manage pending invitations.

### Member Invite Flow

1. Admin fills in the invite dialog: display name, email, role, pronouns, relationship label, accessibility mode
2. Server generates a secure 48-hex-char invite token (192-bit entropy), stored on the `household_members` record with a 7-day expiry
3. Server attempts to send the invite email via the **Gmail API** using the admin's stored OAuth token
4. If Gmail API fails: the server returns the raw `joinUrl` and a `mailto:` link; the UI copies the join link to clipboard and shows a toast with an "Open Mail" action
5. The invitee visits `/join?token=...` — a standalone page (no sidebar) showing the invite details and a Google sign-in button
6. On sign-in, the `claimInvite` procedure links the logged-in user to the member record and sets status to `active`

**Resend invite:** The Resend Invite button (mail icon on invited member rows) regenerates a fresh token and re-attempts the email send with the same fallback logic.

---

## 15. AI Layer — Geeves Chat

The Geeves chat agent is rendered as an **animated brand mark** — the 7-node geometric constellation that matches the logo exactly. It breathes at rest (glow filter), animates while thinking (pulse), and glows while responding. The agent is presented as a compact **branded pill button** ("Ask Geeves") in the bottom-right corner of every page.

The chat backend uses `invokeLLM` with **LLM tool calling** — 12 tools covering calendar, shopping, finance, household, and orders. The agentic loop runs up to 5 rounds. Chat history is persisted in the `chat_messages` table scoped to the household.

### Available Tools (Phase 1)

`get_upcoming_events`, `create_event`, `get_shopping_lists`, `get_orders`, `get_household_members`, `get_bank_accounts`, `get_transactions`, `start_shopping_session`, `cancel_shopping_session`, `get_session_status`, `get_notes`, `create_note`

---

## 16. Real-Time Infrastructure

Socket.io is configured on the same Express server. Authenticated connections join a household-scoped room (`household:{id}`) and optionally a member-scoped room (`member:{id}`). Events emitted include:

- `calendar:event:created/updated/deleted` — triggered by CRUD operations and sync
- `calendar:shadow:updated` — triggered when shadow blocks change
- `calendar:sync:status` — triggered by sync service with progress updates
- `household:member:updated` — triggered by member changes
- `notification` — member-scoped notifications

---

## 17. File Storage

All user-uploaded files (receipts, handwritten list images, lease documents) are stored in S3 via the `storagePut` helper in `server/storage/index.ts`. File keys include random suffixes to prevent enumeration. Only metadata (URL, key, MIME type) is stored in the database — never file bytes.

---

## 18. Testing

All tests are in `server/*.test.ts` and run with `pnpm test` (Vitest).

**Current status: 142 tests passing across 9 test files.**

| Test File | Tests | Coverage |
|---|---|---|
| `server/features.test.ts` | 54 | Shopping, orders, expenses, accounts, chat, agent, WhatsApp, scan |
| `server/household.test.ts` | 12 | Household CRUD, members, invitations |
| `server/calendar-sync.test.ts` | 16 | Calendar sync, OAuth, webhooks |
| `server/google-credentials.test.ts` | 6 | Google credential validation |
| `server/listScanner.test.ts` | 5 | Handwritten list image parsing |
| `server/auth.logout.test.ts` | 1 | Auth logout |
| `server/verticals.test.ts` | 13 | Verticals CRUD, owners, integrations, visibility |
| `server/calendar-management.test.ts` | 15 | Calendar management, vertical assignment, Google account linking |
| `server/settings-contracts.test.ts` | 20 | Settings page contracts, calendar/vertical cross-procedure invariants |

---

## 19. Deployment

**Platform:** Manus WebDev (managed Node.js + Cloud Run)  
**Production URL:** https://geeves.manus.space  
**Deploy method:** Click "Publish" in Manus Management UI after saving a checkpoint  
**Runtime:** Single Node.js process, 1 vCPU, 512 MiB RAM, 180s request timeout, min-instances=0

### Rebuild Checklist (if sandbox is corrupted)

1. Create a new `web-db-user` project in Manus WebDev
2. Restore from the latest checkpoint via Management UI → Version History
3. Add all secrets from Section 5 via Management UI → Settings → Secrets
4. Add both callback URIs to Google Cloud Console authorized redirect URIs
5. Run `pnpm db:push` to apply schema migrations
6. Run `pnpm test` to verify all tests pass
7. Publish

---

## 20. Email Service Architecture

### Current State (Phase 1)

Household invite emails are sent via the **Gmail API** using the admin's stored Google OAuth access token. The `gmail.send` scope is requested during Google login (added June 16, 2026). The service is implemented in `server/services/gmailSend.ts`.

**Fallback (when Gmail API is unavailable):**
- Returns the raw `joinUrl` and a pre-filled `mailto:` link to the caller
- The UI copies the join link to clipboard automatically
- A toast notification offers an "Open Mail" action for manual sending
- No third-party notification service is used as fallback (by design — branding requirement)

### Current State (Phase 1 — Updated June 26, 2026)

Resend is now **active** as the primary email sender. The `RESEND_API_KEY` was added June 26, 2026 and the `geeves.life` domain is verified in Resend. The send pipeline in `server/services/gmailSend.ts` now tries Resend first, falls back to Gmail API, then falls back to `mailto:` link.

**Sender address:** `Geeves.Life <invites@geeves.life>`

**Send order:**
1. **Resend API** — branded `invites@geeves.life` sender, 15s timeout
2. **Gmail API** — admin's stored OAuth token with `gmail.send` scope
3. **`mailto:` fallback** — returns pre-filled link + raw join URL for clipboard copy

The UI reports which method was used (`emailMethod: "resend_api" | "gmail_api" | "fallback_mailto"`) in the invite response.

---

## 21. Inclusivity & Design Principles

All development must adhere to `docs/DESIGN_PRINCIPLES.md`. Key rules:

1. **Never hardcode relationship labels.** All relationship descriptors are user-defined free-text.
2. **Never assume gender from role.** No role carries gendered assumptions.
3. **Never use gendered language in UI copy.** Use "partner" not "husband/wife," use names not "Mom/Dad."
4. **Store pronouns per member** (free-text, used in AI-generated text and UI copy).
5. **Store gender identity per member** (free-text, display only, never used for logic).
6. **No single "owner" in family UX.** All `household_admin` members are co-equal.
7. **Accessibility modes are not tiers.** `picture_board`, `large_text`, and `voice_only` are first-class interfaces.
8. **Use stored pronouns in all AI-generated text.** When Geeves refers to a member, it must use their stored pronouns (e.g., he/him for Eniola).

---

## 22. Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 1** | 🔄 Near Complete (testing phase) | Shopping, finances, calendar, household, properties (calendar layer), notes, settings, dashboard, verticals, AI agent, real-time sync, access model redesign, booking requests |
| **Phase 2** | Planned | Commerce (Instacart IDP, Walmart Affiliate API, Amazon PA-API, travel affiliate integrations), task manager (Asana + Google Keep), modular/resizable dashboard widgets, platform API integration (Airbnb/VRBO/Booking.com official APIs), Tailscale connectivity layer (Hub/Node onboarding, ACL sync), recurring event expansion, attendee management, calendar search, push notifications |
| **Phase 3** | Future | Voice interface, WhatsApp Business API, Geeves Node hardware launch, virtual desktop for constellation members |
| **Phase 4** | Future | Walmart/Amazon API integration (requires affiliate registration), automated order workflow, Geeves Hub hardware launch, Works-with-Geeves certification programme |
| **Phase 5** | Future | Geeves Display (premium wall panel), Geeves Auto (Android Automotive OS app) |
| **Phase 6** | Future | Geeves Auto aftermarket head unit, Headscale self-hosted coordination migration |

---

---

## 23. AI Memory Knowledge Base

A `project_knowledge` database table stores all brand, design, and architectural decisions as structured key-value records. A 24h heartbeat job at `POST /api/scheduled/knowledge-review` reads this table and regenerates `docs/AI_MEMORY.md`.

**Any AI agent starting a new session on this project must read `docs/AI_MEMORY.md` before making any UI, colour, typography, or structural changes.**

To add a new decision to the knowledge base, insert a row into `project_knowledge` with the appropriate `category`, `key`, `value`, `sourceDoc`, and `notes`. The next heartbeat cycle will include it in `AI_MEMORY.md`.

Categories: `brand_colour`, `foundation_colour`, `typography`, `logo`, `vertical`, `design_rule`, `doc_location`, `architecture`, `phase_status`.

---

---

## 24. Security Architecture

As of the June 18, 2026 security hardening sprint, the following controls are active:

| Control | Implementation | Status |
|---|---|—|
| HTTP security headers | `helmet` middleware: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy | ✅ Active |
| Rate limiting | `express-rate-limit`: 300 req/15min on `/api/trpc`, 20 req/15min on `/api/oauth` | ✅ Active |
| OAuth token encryption | AES-256-GCM via `server/tokenEncryption.ts`; key derived from `JWT_SECRET` | ✅ Active |
| Socket.io CORS | Restricted to `APP_URL` + localhost; no wildcard in production | ✅ Active |
| Request body limit | 10 MB max for all API routes | ✅ Active |
| RBAC | `server/auth/rbac.ts`; 6 household roles; `protectedProcedure` + `adminProcedure` | ✅ Active |
| Input validation | Zod schemas on all tRPC inputs; Drizzle ORM parameterised queries | ✅ Active |
| Session cookies | HTTP-only, SameSite=Strict, signed with `JWT_SECRET` | ✅ Active |

**Remaining gaps (see `docs/SECURITY_ASSESSMENT.md` for full analysis):**
- Audit log table (no centralised trail for destructive operations) — partially addressed; full audit log coverage is Phase 1 completion work
- Session token rotation on privilege change (deferred to Phase 2)
- Account deletion and data export flow (designed in §26 below; implementation in Phase 1 completion sprint)

---

---

## 25. Hardware & Connectivity Strategy

Geeves.life is a **BYOD-first, open platform**. No hardware purchase is required to use any core feature. The hardware line exists as a convenience tier for customers who want plug-and-play connectivity and compute features.

**Product surface map:**

| Surface | Form factor | Geeves product | BYOD alternative |
|---|---|---|---|
| Mobile | Phone | Geeves app (iOS / Android) | Any phone |
| Desktop | Computer | Geeves web app | Any browser |
| Wall panel | Tablet | Panel mode PWA | Any tablet ≥ 8", 2 GB RAM |
| Home hub | Mini-PC / SBC | Geeves Hub (Pi 5 8GB) | Synology NAS, Unraid, any Docker host |
| Remote node | Headless SBC | Geeves Node (Pi Zero 2W / Pi 4) | Any Raspberry Pi, GL.iNet router |
| Premium display | Wall panel | Geeves Display (Phase 5) | N/A |
| Vehicle | Head unit | Geeves Auto (Phase 5–6) | Android Automotive OS app |

The connectivity layer is built on **Tailscale / WireGuard**. Each household gets its own tailnet. Constellation members are added via Geeves-managed pre-auth keys with ACL policies that mirror the Geeves RBAC model. At scale (>20,000 households), the coordination layer migrates to self-hosted **Headscale** to eliminate per-user costs.

**Full documentation:**
- `docs/HARDWARE_PHILOSOPHY.md` — BYOD principle, hardware line specs, auto head unit roadmap, Works-with-Geeves programme
- `docs/CONNECTIVITY_STRATEGY.md` — Tailscale/Headscale architecture, WiFi bridge stack, 150k-scale cost model, remote print, virtual desktop

---

---

## 26. Account Lifecycle & Member CRUD Design

*Designed: June 26, 2026*

This section defines the complete lifecycle for user accounts and household membership — covering account creation, member join/leave events, account cancellation, data archival, and the notification system that keeps household admins informed throughout.

### 26a. Account States

Every user account and household membership moves through a defined set of states:

| State | Description | Triggered By |
|---|---|---|
| `active` | Normal operating state | Account creation or invite acceptance |
| `deactivated` | Soft-deleted; PII anonymised; 30-day grace period | Member-initiated deletion or admin removal |
| `hard_deleted` | Full cascade removal after grace period | Automatic after 30-day grace period |
| `suspended` | Admin-suspended; cannot log in | Super admin action |

### 26b. Member Join Flow

When a new member accepts a household invite and completes Google OAuth:

1. `household_members` row is updated: `status = 'active'`, `userId` linked
2. `users` row is stamped: `householdId` and `memberId` written
3. All vertical access rules for this member are applied
4. **Notification triggered:** household admin + all EAs receive an in-app notification and email: "[Member Name] has joined [Household Name] as [Role]."
5. Audit log entry written: `actor=system`, `action=member_joined`, `targetId=memberId`

### 26c. Member Leave / Removal Flow

When a member leaves voluntarily (`household.leaveHousehold`) or is removed by an admin (`household.removeMember`):

1. `household_members` row: `status = 'deactivated'`, `deactivatedAt` stamped
2. All `vertical_member_access` rows for this member are soft-deleted
3. All `constellation_members` rows for this member are removed
4. All `oauth_tokens` for this member are revoked (Google token revocation API called, then DB row marked `status = 'revoked'`)
5. All `shadow_blocks` created by this member's calendars are deleted
6. All pending `household_invites` sent by this member are cancelled
7. All `booking_requests` submitted by this member are marked `status = 'cancelled'`
8. **Notification triggered:** household admin + all EAs receive an in-app notification and email: "[Member Name] has left [Household Name]. They were a member of [N] verticals."
9. Audit log entry written: `actor=memberId or adminId`, `action=member_removed`, `targetId=memberId`

### 26d. Account Cancellation Flow (Member-Initiated)

A member may delete their own account from **Settings → Profile → Delete My Account**:

1. Member must type a confirmation phrase: `DELETE MY ACCOUNT`
2. System initiates **soft-delete** (30-day grace period):
   - `users.status = 'deactivated'`, `users.deactivatedAt` stamped
   - PII anonymised immediately: `name → 'Deleted User'`, `email → sha256(email)`, `profileImage → null`
   - All OAuth tokens revoked
   - Member is removed from all households (triggers §26c flow for each)
   - Session cookie invalidated
3. A **grace period email** is sent to the original email address: "Your account will be permanently deleted in 30 days. To cancel this request, log in before [date]."
4. After 30 days, a scheduled job performs **hard-delete**:
   - All remaining user-linked rows cascade-deleted
   - `audit_log` rows are anonymised (actor replaced with `[deleted-user]`)
   - `calendar events` created by this user are deleted from Geeves DB (Google Calendar is not touched — those belong to the user)
   - `property_bookings` rows where this member was the admin are reassigned to the remaining household admin, or anonymised if no household remains

### 26e. Household Cancellation Flow (Admin-Initiated)

A household admin may close the entire household from **Settings → Household → Close Household**:

1. Admin must type: `CLOSE HOUSEHOLD`
2. All household members are notified by email: "[Admin Name] has initiated closure of [Household Name]. The household will be permanently deleted in 30 days."
3. All members are soft-deactivated (§26c flow for each)
4. Household record: `status = 'deactivated'`, `deactivatedAt` stamped
5. After 30 days: full cascade hard-delete of all household data
6. iCal feeds for all properties are deactivated (feed URLs return 410 Gone)
7. All webhook channels are deleted from Google Calendar

### 26f. Data Archival Model

| Data Type | On Soft-Delete | On Hard-Delete |
|---|---|---|
| User PII (name, email, photo) | Anonymised immediately | Row deleted |
| Calendar events | Retained anonymously | Deleted |
| Property bookings | Anonymised (guest name → 'Guest') | Deleted |
| Financial transactions | Retained anonymously | Deleted |
| Audit log entries | Actor anonymised | Retained for 7 years (compliance) |
| OAuth tokens | Revoked + DB row marked revoked | Row deleted |
| Shadow blocks | Deleted immediately | N/A |
| Chat messages | Retained anonymously | Deleted |
| Bug reports | Retained anonymously | Deleted |

### 26g. Multi-Vertical / Constellation Exit Handling

A member may belong to multiple verticals and constellations within a household. On removal:

- **Verticals:** All `vertical_member_access` rows are soft-deleted. The vertical itself is not affected. Other members' access is unchanged.
- **Calendars:** Calendars owned by the departing member are unlinked from their vertical. Shadow blocks propagated from those calendars are deleted. The calendar records remain in the DB (marked `status = 'inactive'`) until the 30-day grace period expires.
- **Constellations:** The member is removed from all constellation membership lists. If the member was the only admin of a constellation, the household admin is automatically promoted to constellation admin.
- **Resources:** Resources linked to the departing member are reassigned to the household admin.
- **Booking requests:** Pending requests are cancelled. Accepted requests are retained with the member anonymised.

### 26h. Member CRUD Gaps Audit (Phase 1 Completion)

The following gaps in member lifecycle handling must be addressed before Phase 1 Beta launch:

| Gap | Priority | Notes |
|---|---|---|
| `household.removeMember` procedure | P0 | Admin-initiated removal with full cascade |
| `household.leaveHousehold` procedure | P0 | Member-initiated exit with full cascade |
| `household.deleteAccount` procedure | P0 | Full account closure with grace period |
| `household.closeHousehold` procedure | P1 | Admin-initiated household closure |
| Member join notification (in-app + email) | P0 | Triggered on invite acceptance |
| Member leave/removal notification (in-app + email) | P0 | Triggered on removal or voluntary exit |
| Grace period email on account deletion | P1 | 30-day warning with cancellation link |
| Scheduled hard-delete job (30-day grace) | P1 | Heartbeat-driven cascade deletion |
| Audit log entries for all CRUD events | P0 | Already have audit_log table; need entries |

---

## 27. System Notification Design

*Designed: June 26, 2026*

This section defines all system-generated notifications, their triggers, recipients, delivery channels, and content templates.

### 27a. Notification Channels

| Channel | Implementation | Use Case |
|---|---|---|
| **In-app** | `notifyOwner()` helper + in-app notification badge | Owner/admin alerts; real-time |
| **Email** | Resend API (`invites@geeves.life`) with Gmail fallback | Member-facing notifications; async |
| **Toast** | Client-side toast (Sonner) | Immediate UI feedback; ephemeral |

### 27b. Notification Trigger Matrix

| Event | In-App | Email | Recipients | Template |
|---|---|---|---|---|
| New member joins household | ✅ | ✅ | All household admins + EAs | "[Name] joined as [Role]" |
| Member removed from household | ✅ | ✅ | All household admins + EAs | "[Name] left [Household]. Was in [N] verticals." |
| New booking detected (iCal/email) | ✅ | ❌ | Household admin | "New booking at [Property]: [Guest], [Dates]" |
| Booking cancellation detected | ✅ | ✅ | Household admin | "Cancellation at [Property]: [Guest], [Dates]" |
| Booking modification detected | ✅ | ❌ | Household admin | "Booking modified at [Property]: [what changed]" |
| New direct booking request | ✅ | ✅ | Household admin + EAs | "New booking request for [Property]: [Dates]" |
| Bug report status changed | ❌ | ✅ | Reporter | "Your report '[Title]' is now [Status]" |
| Account deletion grace period started | ❌ | ✅ | Affected user | "Account deletion in 30 days — cancel here" |
| Household closure initiated | ❌ | ✅ | All household members | "[Household] closing in 30 days" |
| iCal feed stale (>4h) | ✅ | ❌ | Household admin | "[Platform] feed for [Property] is stale" |
| OAuth token expired/revoked | ✅ | ❌ | Affected member | "[Account] needs reconnecting" |
| Invite accepted | ✅ | ❌ | Inviting member | "[Name] accepted your invite" |
| Invite expired (7 days) | ✅ | ✅ | Inviting member | "Invite to [Email] expired — resend?" |

### 27c. In-App Notification Storage

In-app notifications are stored in a `notifications` table:

```
notifications
  id          — bigint PK
  householdId — FK
  memberId    — FK (null = all admins)
  type        — enum (member_joined, member_left, new_booking, cancellation, ...)
  title       — varchar(255)
  body        — text
  isRead      — boolean default false
  actionUrl   — varchar(512) nullable
  createdAt   — bigint (UTC ms)
  readAt      — bigint nullable
```

A notification badge in the DashboardLayout sidebar shows the count of unread notifications. Clicking opens a notification drawer.

### 27d. Phase 1 Notification Implementation Priority

For the Phase 1 Beta, the minimum viable notification set is:

1. Member join notification (in-app + email) — required for Beta
2. Member leave/removal notification (in-app + email) — required for Beta
3. Cancellation alert notification (in-app) — in progress (CancellationAlertsWidget)
4. New booking notification (in-app) — required for Beta
5. Bug report status update (email) — required for Beta (bug reporting system)

All other notifications in the matrix above are Phase 2 scope.

---

*Last updated: June 26, 2026 by Manus AI (account lifecycle, notification system, Phase 2 roadmap reconciliation)*

---

## 28. OAuth Token Health System

**Implemented:** June 27, 2026

### 28a. Token Expiry Detection

When a Google Calendar sync fails with `invalid_grant`, the server immediately:

1. Marks the `oauth_tokens` row `status = "expired"` in the DB
2. Sets `expiredNotifiedAt = now()` (prevents duplicate alerts)
3. Fires `notifyOwner()` — in-app push notification: *"⚠️ Google account disconnected: [email] — calendar sync paused"*
4. Sends a Resend email to `tarik@tjperkinsfam.com` via `reports@geeves.life`

The `expiredNotifiedAt` column ensures the notification fires only once per expiry event, not on every subsequent failed sync.

### 28b. Dashboard Banner

`useExpiredAccountCount()` (exported from `ReconnectSequenceModal.tsx`) polls `trpc.integrations.list` every 60 seconds. When any account has `status = "expired"` or `"revoked"`, an amber warning banner appears at the top of the dashboard:

> ⚠️ **2 Google accounts need reconnecting.** Calendar sync and shadow blocks are paused. [Fix Now →]

### 28c. Reconnect Sequence Modal

The `ReconnectSequenceModal` component provides an animated node-graph UI for reconnecting multiple accounts in sequence. Each account is shown as a node:

- **Red pulsing** = disconnected
- **Amber spinning** = OAuth redirect in progress
- **Green checkmark** = server-confirmed reconnected

A progress bar shows "Step 1 of 2 — 0%" advancing to "Step 2 of 2 — 50%" etc.

**Critical implementation detail:** See `docs/patterns/OAUTH_REDIRECT_SEQUENCE.md` for the full pattern. The key rule is:

> **Sequence advancement logic must live at the PAGE level via `useReconnectSequenceResume()`, not inside the modal component.**

The modal is conditionally rendered and is unmounted during OAuth redirects. The page-level hook runs unconditionally, reads `reconnect_success` / `connect_error` URL params, advances `sessionStorage` state, and opens the modal with the correct state already applied.

### 28d. Files

| File | Purpose |
|---|---|
| `client/src/components/ReconnectSequenceModal.tsx` | Modal component + `useExpiredAccountCount` + `useReconnectSequenceResume` hook |
| `client/src/pages/Home.tsx` | Calls `useReconnectSequenceResume` at page level; renders dashboard banner |
| `client/src/pages/Settings.tsx` | Calls `useReconnectSequenceResume` at page level; renders reconnect banner in Integrations tab |
| `server/services/calendarWebhook.ts` | Marks tokens expired, fires `notifyOwner` + Resend email on first expiry |
| `docs/patterns/OAUTH_REDIRECT_SEQUENCE.md` | Full pattern documentation with code examples |

---

*Last updated: June 27, 2026 — OAuth token health system, reconnect sequence modal pattern*
