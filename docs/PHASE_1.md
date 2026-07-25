# Geeves — Phase 1 Specification

**Version:** 3.0 — Updated July 7, 2026 (Vendor Matching + Expenses Module + Shopping Module Schema Sprint)  
**Status:** 🔄 Active Development — Phase 1 ~98% complete  
**Latest Checkpoint:** `374736c6` (Jul 6, 2026)  
**Tests:** 199+ passing (11 test files)  
**Live URL:** https://geeves.manus.space

---

## Phase 1 Audit — June 25, 2026 (v2.0 Auth Overhaul + OAuth Compliance Sprint)

**Completed in v2.0 sprint (Jun 20–25):**
- **Google-Only Authentication (Jun 24):** Manus OAuth fully removed. Google OAuth is the sole auth method. Login at `/login`, callback at `/api/oauth/google/callback`. All Manus OAuth routes, SDK calls, and UI references removed.
- **Incremental Auth Scopes (Jun 25):** Login requests identity scopes only. Calendar/gmail.send scopes requested separately via Settings → Integrations connect-account flow.
- **CSRF Nonce (Jun 25):** Added to all three OAuth flows (login, connect-account, reconnect). State parameter encodes origin + returnPath + nonce. Nonce verified on callback.
- **Token Refresh Hardening (Jun 25):** Refresh failure marks `oauth_tokens.status=expired` and throws immediately. Stale-token fallback removed. JWT_SECRET absence is now a fatal startup error.
- **Non-Destructive Account Reconnect (Jun 23):** Reconnecting a Google account preserves all existing calendars, events, and shadow blocks. `getOAuthTokenByEmail` returns any status. Callback uses `reconnect_success` param.
- **Member Permissions Page (Jun 20):** `MemberPermissions.tsx` replaces `VerticalAccessMatrix`. Member selector, vertical filter, collapsible RBAC groups with per-member override badges, EA Delegation toggle. `member_permission_overrides` table + `eaCanManageAccess` column. `accessControl` router with 7 procedures.
- **Settings Integrations Tab (Jun 20):** Account management moved from Calendars tab. Each account has `purposes` field (calendar_sync, email_scraping, notes, tasks, gmail_send). Add Account flow shows purpose picker before OAuth.
- **Landing Page (Jun 25):** Public landing page at `/`. Beta signup ICP form (`beta_signups` table), contact form (`contact_messages` table). Dashboard moved to `/dashboard`. Super Admin has Beta Signups and Contact Messages tabs.
- **Legal Pages (Jun 24):** Privacy Policy at `/privacy` and Terms of Service at `/terms`.
- **Subscription Management Tab (Jun 25):** `SubscriptionTab` in Settings → Plan (admin-only). Shows plan, status, seats used/total with progress bar, add-ons, billing contact, Stripe customer ID. `subscriptions` DB table.
- **Resend Email Stub (Jun 25):** `sendEmailViaResend()` in `gmailSend.ts`. Email delivery priority: Resend API → Gmail API → mailto: fallback. Requires `RESEND_API_KEY` secret to activate.
- **Walmart Order Parsing Fix (Jun 25):** Improved LLM system prompt for Walmart email format + post-processing strip of currency symbols from `totalAmount`.
- **Vertical Visibility Matrix (Jun 22):** 26 missing directional rules added to complete the full N×(N-1) matrix across all 6 verticals.
- **Shadow Block Propagation Fix (Jun 22):** Root cause diagnosed — duplicate calendar records with `verticalId=null` caused silent propagation skip. Fixed by assigning correct `verticalId`. 279 events backfilled.

**Known gaps from v2.0 (not yet built):**
- Event-level shadow overrides UI (`shadow_overrides` table exists, UI not yet built)
- Family member interfaces: child view, elder view, caregiver view (role-filtered dashboards)
- Asana integration (task sync)
- Google Keep integration (notes sync)
- Backend enforcement of `vertical_member_access` rules in `properties` router
- Backend enforcement of `calendarAccess` rules in `calendar.list` and `events.list`

---

## Phase 1 Audit — July 7, 2026 (v3.0 Vendor Matching + Expenses Module Sprint)

**Completed in v3.0 sprint (Jun 26–Jul 7):**

**Section 15 — Shadow Block Sync Reliability:**
- Shadow block sync_status lifecycle (pending_sync → synced / sync_failed)
- Sync retry heartbeat job (shadowBlockSyncRetry.ts, 50/batch, every 2 min)
- Dashboard sync health indicator (green/amber/red banner)
- P-16 guard: NULL accountEmail calendars skipped in all propagation paths
- Deleted 48,486 pre-Jul-1 shadow blocks; scoped to Jul 1+ only
- Engineering pattern P-16 documented (Best-Effort External Write Treated as Success)
- Cardinal Rules added to DESIGN_PRINCIPLES.md (§11)

**Section 16 — Vendor Matching & Expenses Schema:**
- `chart_of_accounts` table (QBO-compatible, per-vertical hierarchy)
- `vertical_financial_configs` table (1:1 with verticals, currency/tolerance/QBO connection)
- `vendor_accounts` table (14 vendors seeded with match patterns)
- `vendor_orders` table (424 rows migrated from orders + walmart_orders)
- `vendor_order_items` table (419 rows migrated from order_items)
- `transaction_matches` table (bank-to-order matching with confidence scoring)
- `expenses` table (35 columns, approval workflow, QBO export, cross-vertical split support)
- Enhanced `audit_log` with actorType, verticalId, previousValue, newValue
- `financial_transactions.verticalId` FK added (671 rows backfilled from enum)
- `bank_accounts` enhanced with householdId, cardNetwork, verticalId
- 273 test verticals cleaned up (6 canonical retained)

**Section 17 — Expenses Split + Bug Fixes + Member Lifecycle:**
- Cross-vertical + cross-property expense split pattern (splitGroupId, splitAmount, splitSequence)
- `notifications` table deployed (household-scoped, multi-channel)
- `PropertyAllocationPicker` component (multi-vertical, multi-property, dollar/% allocation)
- `household.removeMember` procedure (admin-only, full cascade + audit)
- `household.leaveHousehold` procedure (member-initiated, last-admin guard)
- Bug fixes: C-03 (date parsing), H-01 (UTC display), H-05 (security.ts memberId), M-01 (booking badge), M-04 (delete impact), M-05 (notify on respond), M-06 (empty state)

**Known gaps from v3.0 (not yet built):**
- Vendor matching algorithm (auto-match bank transactions to orders)
- Expense approval workflow UI
- QBO export pipeline
- PropertyAllocationPicker integration into expense creation flow
- Notification delivery (email/push channels)
- Booking request flow UI (table exists, badge wired, submit/approve UI needed)

---

---

## Phase 1 Audit — June 19, 2026 (v1.9 Knowledge Management + Vertical Access Control Sprint)

**Completed in v1.9 sprint:**
- `audit_log` table: full ISO 27001-aligned audit trail (actor, household, action, category, resourceType, resourceId, outcome, metadata, ipAddress, userAgent). `writeAuditLog`/`getAuditLog`/`countAuditLog` helpers in `db.ts`. `securityRouter` with `audit.list`, `audit.export`, `gdpr.exportData` (Art. 20), `gdpr.deleteAccount` (Art. 17) procedures. Audit calls added to `auth.logout`, `household.members.invite`, `household.members.claimInvite`.
- `project_tasks` table: 193 tasks seeded from `todo.md` (150 done / 39 todo / 4 deferred — 78% complete). SHA-256 `titleHash` for idempotent upserts.
- `knowledgeReview.ts` heartbeat extended: syncs `todo.md` → `project_tasks` on every 24h run; adds live task status section to `AI_MEMORY.md`; auto-flags stale/deprecated knowledge entries.
- 25 DB table definitions seeded into `project_knowledge` (all 30+ tables documented with purpose, columns, relationships, deprecation status). `family_members` formally marked as `db_schema_deprecated`.
- Super Admin portal (`/super-admin`): `system_admin`-gated page above all household/constellation roles. Tabs: Project Tasks, Knowledge Base, Audit Log, Users. Full CRUD on knowledge entries (create, edit, bulk-delete, mark-deprecated, search). `superAdminRouter` with `tasks.*`, `knowledge.*`, `audit.*`, `users.*`, `stats.summary` procedures.
- `vertical_member_access` table: per-member, per-vertical access rules (`accessLevel`: full/read_only/blind/none; `calendarAccess`: availability_only/default_vertical/blind/read_write; `allowedCalendarIds`; `canRequestMeetings`).
- `vertical_data_policies` table: data category visibility rules (`financial`, `private`, `guest_pii`, `operational`) with `hiddenFromRoles` and `hiddenFromMemberIds` JSON arrays.
- `household.verticalAccess` router: `getMatrix`, `upsertMemberAccess`, `removeMemberAccess`, `upsertDataPolicy`, `removeDataPolicy` procedures.
- Vertical Access Matrix UI (`/vertical-access`): per-member access level + calendar access type selectors, meeting request toggle, data visibility policy toggles per category per member. Accessible via "Access Control" nav item (Shield icon) in sidebar.
- Manus bug report drafted: `docs/MANUS_SUPPORT_REPLY_FINAL.html` — structured HTML report covering context retention failure, 3,098,893 credits spent, cross-project evidence (MBOMS, StartOut, Geeves), 5 product improvement recommendations, and design partnership request.
- Support escalation skill created: `skills/support-escalation-report/` — reusable workflow for future Manus support escalations.

**Known gaps from v1.9 (not yet built):**
- Backend enforcement of `vertical_member_access` rules in `properties` router (financial field stripping for members with `financial` data policy)
- Backend enforcement of `calendarAccess` rules in `calendar.list` and `events.list` procedures
- Calendar picker in Access Matrix UI (allowedCalendarIds per member)
- Booking request flow UI — `booking_requests` table exists but no submit/approve/decline UI
- Session token rotation on privilege change
- OAuth token backfill migration (existing plaintext rows in `oauth_tokens`)
- `shadow_blocks` unique constraint not yet applied to live DB

---

## Phase 1 Audit — June 18, 2026 (v1.8 Security Hardening + Performance Sprint)

A second full codebase audit was conducted on June 18, 2026. The following items were completed in this sprint:

**Completed in v1.8 sprint:**
- `isShadowBlock` column added to `events` table (applied to live DB via SQL); `eventPropagation.ts` now guards against re-propagating shadow events
- DB composite indexes applied to live DB: `events (householdId, startTime, endTime)`, `events (calendarId, startTime)`, `shadow_blocks (householdId, startTime, endTime)`
- iCal 10-minute polling heartbeat: `server/scheduledHandlers/icalPoll.ts` created; registered at `/api/scheduled/ical-poll`; manus-heartbeat cron `geeves-ical-poll` (task_uid: `isA38dxJtHoRhbRRvxayvf`) fires every 10 minutes
- OAuth token encryption at rest: `server/tokenEncryption.ts` (AES-256-GCM, key derived from `JWT_SECRET`); all `db.ts` OAuth helpers now encrypt on write and transparently decrypt on read; legacy plaintext rows decoded gracefully until backfill migration is run
- HTTP security headers: `helmet` added with full CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, HSTS (production), COEP disabled for Google Maps compatibility
- Rate limiting: `express-rate-limit` — 300 req/15min on `/api/trpc`, 20 req/15min on `/api/oauth`
- Socket.io CORS: restricted from `origin: "*"` to `[APP_URL, localhost]`; falls back to `"*"` only when `APP_URL` env is unset (dev sandbox)
- Express body limit: reduced from 50 MB to 10 MB for all API routes
- `events.list` parallelised: `getEvents`, `getShadowBlocksInRange`, and `getVerticals` now run in parallel via `Promise.all` (was sequential — 3 serial DB calls)
- Batch helpers added to `db.ts`: `getOwnedVerticalIds` and `getAllVerticalVisibilityForHousehold` replace N+1 loops

**Known gaps identified in v1.8 audit (not yet built):**
- `shadow_blocks` unique constraint — schema has it; not yet applied to live DB (needs `CREATE UNIQUE INDEX IF NOT EXISTS shadow_blocks_source_target_uniq ON shadow_blocks (sourceEventId, targetCalendarId)`)
- OAuth token backfill migration — existing plaintext rows in `oauth_tokens` not yet re-encrypted; `tokenEncryption.ensureEncrypted` helper exists but no migration script has been run
- Shadow block Google write-back — propagation writes DB rows but does not write blocker events to target Google Calendars
- Properties page iCal data display — `property_bookings` data exists in DB but not shown on `/properties` page
- `properties.getDashboardData` batched procedure — 3 separate queries per property in `PropertyBookingTimeline` (no server-side batching)
- Multi-account Google OAuth UI — `connect-account` route exists but no "Add Google Account" button in Settings
- Booking request flow UI — `booking_requests` table exists but no submit/approve/decline UI is built
- Audit log table — no centralised audit trail for security-relevant actions
- GDPR/data deletion — no user data export or account deletion flow
- Session token rotation on privilege change

---

## Phase 1 Audit — June 18, 2026 (v1.7 post-audit pass)

A full codebase audit was conducted on June 18, 2026. The following items were completed since v1.6 and are now live:

**Completed since v1.6:**
- All-day multi-day event rendering: floating bar strip in day/2-day/week views; spanning Gantt bars in month view
- All-day event sync: `parseGoogleEvent` now correctly handles Google's exclusive `end.date` format
- `shadow_blocks` table extended with `startTime`, `endTime`, `isAllDay` columns; `getShadowBlocksInRange` uses overlap query
- Recurring event full CRUD: scope modals (this / following / all) for create, edit, and delete; Google Calendar write-back per scope
- Event detail dialog: sticky header with pinned action buttons; collapsible description; recurrence badge
- Gantt fixes: ▲ check-in marker only on actual check-in day; ▼ on checkout day; mid-stay fill for intermediate days
- Prep day suppression: prep day markers suppressed when the day is already occupied by a booking
- Back-to-back ↔ symbol: UTC ISO date key matching fixes timezone drift; Jul 3 back-to-back now correctly detected
- Upcoming checkins: `getUpcomingEvents` now filters by `checkIn >= today midnight`
- DB indexes on `property_bookings` (propertyId+checkIn, platformId, icalUid)
- QueryClient global defaults: staleTime 2min, gcTime 10min, refetchOnWindowFocus false
- Force Full Re-sync button in Settings recovers events previously deleted from Geeves
- Shadow block propagation: DB row always written regardless of Google Calendar write success
- Knowledge DB: 85 entries across 16 categories; `AI_MEMORY.md` generated; `knowledgeReview.ts` upgraded

---

## Overview

Phase 1 establishes the full foundation of the Geeves platform. It covers every layer of the application: database schema, authentication, real-time infrastructure, the master calendar, household management, shopping and commerce, financial management, property management, notes, settings, verticals, and the life-management dashboard. The platform is now entering the testing phase, with two significant Phase 1 pull-forward items added on June 16, 2026:

1. **Calendar Access Model Redesign** — the role-based calendar visibility system is being redesigned to correctly separate EA and member capabilities, enforce vertical-scoped visibility, and introduce the booking request flow.
2. **Properties Calendar Layer** — the iCal aggregation and booking timeline features are being pulled forward into Phase 1 (calendar integration only; guest details and financial data remain Phase 2).

---

## 1. Infrastructure & Foundation

### 1.1 Technology Stack

The application is a React 19 + Tailwind 4 + Express 4 + tRPC 11 monorepo. TypeScript is used throughout with strict mode enabled. The database is MySQL/TiDB accessed via Drizzle ORM. Authentication uses both Manus OAuth (fallback) and Google OAuth 2.0 (primary). Real-time updates are delivered via Socket.io. All tests run with Vitest.

### 1.2 Database Schema

The schema is defined in `drizzle/schema.ts` and applied with `pnpm db:push`. Phase 1 introduced 30+ database tables covering all feature domains. Key design decisions:

- All IDs use `nanoid()` strings except `users.id` which is an auto-increment integer (required by Manus OAuth).
- All business timestamps are stored as UTC milliseconds (bigint) to avoid timezone drift.
- File bytes are never stored in the database — only S3 URLs and keys.
- The `household_members` table includes `pronouns`, `genderIdentity`, and `relationshipLabel` as free-text fields per the inclusivity principles.
- The `events` table includes a `videoCallUrl` field for Google Meet, Zoom, and Teams links.
- The `calendars` table includes `accountEmail` and `accessLevel` to support multi-account token routing and write-back permission checks.

**New tables added for Phase 1 pull-forward (June 16, 2026):**
- `property_platforms` — multiple platform feeds per property (Airbnb, VRBO, Booking.com, Direct, Zillow, Apartments.com)
- `property_prep_rules` — per-property blackout and preparation time rules
- `property_bookings` — merged booking records from all platform feeds
- `booking_requests` — time-booking requests from members to vertical owners/EAs
- `vertical_visibility.busyLabel` — configurable custom label for `busy_only` shadow blocks (e.g. "OOO", "Focus Time")
- `verticals.privacyLevel` — controls who can see a vertical at all (`household` | `admin_only` | `private`)

### 1.3 Visual Design System

The platform uses a **dual dark/light theme** with the **Outfit + Inter + Nunito** type pairing and a **Deep Charcoal / Warm White** colour system. The theme is defined entirely in `client/src/index.css` using Tailwind 4's `@theme inline` block with OKLCH colour values.

**Brand mark (updated June 16, 2026):** The brand mark is the **exact brand kit geometry** — a 7-node geometric constellation representing a stylised arch/house form. It is implemented as a pure React SVG component in `client/src/components/GeevesLogo.tsx`.

**Typography (updated June 17, 2026):** The wordmark is now **Outfit Bold 700** (corrected from font-light 300). The tagline "OPERATING SYSTEM" has been added to the sidebar, greeting header, and splash screen. Nunito is loaded as a fallback font per the brand SVG specification.

**Colour palette (updated June 17, 2026):** All UI colours now strictly use the 6 brand rainbow colours and 5 foundation colours. Off-brand Tailwind colours (Emerald, Rose, Sky Blue) have been removed. Vertical colour assignments now match the brand rainbow. See `docs/BRANDING.md` for the full palette.

**Favicon (updated June 16, 2026):** `favicon.svg` (scalable), `favicon-32.png` (browser tab), and `favicon-192.png` (iOS home screen / PWA) are generated from the brand mark geometry.

**"Ask Geeves" button (updated June 16, 2026):** Redesigned from a large 100px floating constellation to a compact branded pill button (logo mark + "Ask Geeves" label) in the bottom-right corner.

---

## 2. Authentication

### 2.1 Google OAuth 2.0 (Primary)

Google OAuth is the primary login method. The flow is implemented in `server/auth/googleOAuth.ts` and registered as Express routes at `/api/auth/google` and `/api/auth/google/callback`.

**Google OAuth scopes (as of June 16, 2026):**
- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.send` *(added June 16, 2026)*

**Workspace auto-detection:** If the user's email domain is `tjperkinsfam.com`, `maxfieldbakery.com`, or `maxfieldmarket.com`, the server uses service account impersonation to auto-discover and register all Google Workspace calendars.

### 2.2 Add Additional Google Account

A separate flow at `/api/auth/google/connect-account` allows an already-authenticated user to add additional Google accounts without replacing their session.

### 2.3 Manus OAuth (Fallback)

The Manus OAuth flow remains active at `/api/oauth/callback` as a fallback.

---

## 3. Household & Role System

### 3.1 Household Model

Every authenticated user belongs to exactly one household. A household is created automatically on first login if none exists. The `createdByUserId` field is an audit field only — all `household_admin` members are co-equal.

### 3.2 Role Architecture

**Platform roles** (`users.role`): `user` or `system_admin`. The `system_admin` role is invisible to families.

**Household roles** (`household_members.role`): `household_admin`, `ea`, `member`, `caregiver`, `child`, `elder`.

### 3.3 Revised Permission Matrix (Phase 1 Pull-Forward)

The access model was redesigned on June 16, 2026. The key changes from the previous model are:

- `member` no longer has `calendar.view_all` or `calendar.edit` — members can only see their assigned verticals and submit booking requests
- `ea` retains full edit capability but is subject to vertical privacy levels — a `private` or `admin_only` vertical is invisible to EA
- EA always sees at minimum `busy_only` blocks from all verticals (the EA floor rule) to prevent accidental double-booking
- A new `booking.request` permission applies to all roles — any member can request time from a vertical owner or EA

| Permission | `household_admin` | `ea` | `member` | `caregiver` | `child` | `elder` |
|---|---|---|---|---|---|---|
| See all accessible verticals | ✅ All | ✅ All non-blind | ✅ Own verticals | ✅ Assigned | ✅ Assigned | ✅ Assigned |
| See `busy_only` cross-vertical blocks | ✅ | ✅ Always (floor) | ✅ Per visibility rules | ❌ | ❌ | ❌ |
| Create / edit / delete events | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Submit booking request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / decline booking request | ✅ | ✅ (on accessible verticals) | ❌ | ❌ | ❌ | ❌ |
| Manage calendars | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage verticals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage properties | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.4 Vertical Privacy Levels

Each vertical has a `privacyLevel` field:

| Privacy Level | Who can see the vertical |
|---|---|
| `household` | All household members (default) |
| `admin_only` | Only `household_admin` members — EA and below are completely blind |
| `private` | Only the vertical's named owners |

When a vertical is blind to a member, they cannot see it in the calendar sidebar, cannot see events from it, and cannot receive `busy_only` blocks from it.

### 3.5 Cross-Vertical Visibility

The `vertical_visibility` table stores per-pair visibility settings. The `busyLabel` field (new) allows the owner to customise what the shadow block label says (e.g. "OOO", "Focus Time", "Personal", or any free-text string up to 50 characters). The default label is "Busy".

**Default cross-vertical visibility: `busy_only`** (updated from `none` on June 16, 2026). The `none` option remains available with a UI warning: "Members will see this time as available."

### 3.6 Household Page

The Household page (`/household`) allows `household_admin` members to:
- View and edit household name, timezone, and wake word
- View all household members with their roles and status
- Invite new members by email with role assignment
- View pending invitations with Resend Invite and Copy Link buttons
- **Review and approve/decline booking requests** (new — Phase 1 pull-forward)

### 3.7 Member Invite Flow

1. Admin fills in the invite dialog: display name, email, role, pronouns, relationship label, accessibility mode
2. Server generates a secure 48-hex-char invite token (192-bit entropy) with a 7-day expiry
3. Server attempts to send the invite email via the Gmail API using the admin's stored OAuth token
4. If Gmail API fails: the server returns the raw `joinUrl` and a `mailto:` link; the UI copies the join link to clipboard and shows a toast with an "Open Mail" action
5. The invitee visits `/join?token=...` — a standalone page showing the invite details and a Google sign-in button
6. On sign-in, the `claimInvite` procedure links the logged-in user to the member record

---

## 4. Master Calendar

### 4.1 Calendar Views

The calendar (`/calendar`) supports four views: Month, Week, Day, and 2-Day. The view toggle on desktop shows labelled buttons. On mobile, the toolbar is two rows: Row 1 (Today, prev/next, date label, Connect icon, New Event icon) and Row 2 (four equal-width view pills). Swipe left/right gesture navigation is supported on all views.

### 4.2 Event Management

Events are created and edited via a dialog that captures:
- Title, start/end time, all-day toggle
- Calendar selector (only calendars assigned to a vertical)
- Description
- **Location** — powered by Google Maps Places autocomplete (`LocationAutocomplete` component). Selecting a suggestion fills the location field and appends a 📍 Google Maps link to the description automatically.
- **Video call link** — supports Google Meet, Zoom, and Microsoft Teams with branded icons
- Visibility (default/public/private/confidential)
- Recurrence rule

### 4.3 Vertical Colour Coding (Updated June 16, 2026)

Calendar events now inherit the **vertical's colour** rather than the individual calendar's stored colour. The `CalendarView` component fetches all verticals and builds a `calendarId → verticalColor` lookup map. Calendars not assigned to any vertical fall back to their stored calendar colour.

### 4.4 Cross-Vertical Visibility Enforcement (Phase 1 Pull-Forward)

The `events.list` procedure now applies a three-layer filter:

1. **Vertical access filter** — determine which verticals the requesting member can see based on their role and the vertical's `privacyLevel`
2. **Cross-vertical visibility filter** — for accessible verticals, fetch real events; for inaccessible verticals where `busy_only` applies, synthesise shadow blocks using the configured `busyLabel`; for `none` visibility, show nothing
3. **EA floor rule** — EA always receives at least `busy_only` blocks from all verticals

### 4.5 Booking Request Flow (Phase 1 Pull-Forward)

Members (and any role without `calendar.edit`) can request time from a vertical owner or EA:

1. Member selects a free slot on the calendar
2. Member submits a booking request with an optional message
3. The vertical owner or EA receives a notification and sees the request in the Household page
4. On accept: the server creates a real event on the target calendar and propagates shadow blocks to all other verticals
5. On decline: the member receives a notification with the optional response note
6. Accepted external Google Calendar invites also trigger shadow block propagation on sync update

### 4.6 Google Calendar Write-Back

When an event is created, updated, or deleted in Geeves, the server attempts to write the change back to Google Calendar via the REST API. Write-back only applies to calendars with `accessLevel === "read_write"`. The local database operation always succeeds regardless of write-back success.

### 4.7 Google Calendar Sync

The sync service implements full sync, incremental sync (via `syncToken`), and webhook push notifications. Multi-account token routing handles Workspace service account impersonation and stored OAuth tokens for personal accounts.

### 4.8 Shadow Blocks (Privacy Masking)

When an event is created on a calendar belonging to a vertical, the server automatically creates shadow blocks on all sibling calendars in the same vertical. The `maskedTitle` field stores the configured `busyLabel` for cross-vertical blocks. Shadow blocks render as dashed-border entries in both TimeGridView and MonthView.

### 4.9 Real-Time Updates

Socket.io broadcasts `calendar:event:created/updated/deleted`, `calendar:shadow:updated`, and `calendar:sync:status` events to all household members in the same room.

---

## 5. Properties System (Phase 1 Pull-Forward)

### 5.1 Overview

The Properties system was extended on June 16, 2026 to include the calendar integration layer. The Phase 1 scope covers the iCal aggregation, booking timeline, prep rules, blackout dates, and outbound ICS hosting. Guest details and financial data (email scraping, revenue tracking, platform API integration) are Phase 2.

### 5.2 Property Types

| Type | Category | Platform Support |
|---|---|---|
| `rental_str` | Short-Term Rental | Airbnb, VRBO, Booking.com, Direct |
| `rental_ltr` | Long-Term Rental | Zillow, Apartments.com, Direct |
| `primary_residence` | Other | None |
| `commercial` | Other | None |
| `vacation` | Other | None |
| `investment` | Other | None |
| `other` | Other | None |

### 5.3 Multi-Platform iCal Architecture

Each property can have **multiple platform feeds** via the `property_platforms` table. Geeves acts as an iCal aggregator:

1. Polls all inbound iCal feeds for a property on a configurable schedule
2. Merges them into a single unified booking calendar per property
3. Detects conflicts (overlapping bookings from different platforms) and flags them as alerts
4. Assigns the merged calendar to the property's vertical

**Outbound ICS hosting:** The outbound ICS file is hosted at a stable URL (S3). Each platform subscribes to this URL. When Geeves applies a blackout date or prep rule, it regenerates the outbound ICS. Each blocked slot includes a `DESCRIPTION` field explaining the reason.

### 5.4 Prep Rules

Stored per property in `property_prep_rules`:
- **Block days before** — number of days to block before each booking (default 0)
- **Block days after** — number of days to block after each booking (default 1)
- **Block national holidays** — boolean; no check-in or check-out on US national holidays
- **Block Sundays** — boolean; no check-in or check-out on Sundays
- **Custom block days** — JSON array of specific dates to always block

### 5.5 Blackout Dates

Blackout dates can be set in three ways:
1. **Manual blackout** — set by a vertical owner or EA via the Properties page
2. **Rule-based blackout** — triggered automatically by prep rules
3. **Calendar-driven blackout** — when a calendar event is created on the property's vertical, Geeves optionally propagates a block to the outbound ICS (description: "Owner unavailable")

### 5.6 Long-Term Rental Features

Long-term rental properties support:
- Lease document storage (PDF uploaded to S3)
- Monthly rent amount and currency
- Tenant information stored in `property_bookings`

### 5.7 Properties Widget (Dashboard)

**Short-term rentals:** A horizontal booking timeline per property. Each booking block uses the **vertical's interior colour** with an **outline colour matching the platform** (Airbnb = coral, VRBO = blue, Booking.com = navy, Direct = teal). Revenue per booking shown on hover/tap (Phase 2 — requires email scraping).

**Long-term rentals:** A card per property showing tenant name, monthly rent, and next due date.

**Monthly revenue summary:** Phase 2 (requires email scraping for financial data).

### 5.8 Properties Page

The full Properties page (`/properties`) shows:
- A list/grid toggle
- Per-property booking timeline (full-width, showing 3 months)
- Platform feed management (add/remove platform feeds with iCal URLs)
- Prep rules editor
- Blackout date picker
- Lease document upload (long-term only)
- **Photos tab** — Upload property photos to S3, grid display with delete (Jul 8 2026)
- **Map tab** — Auto-loads Google Map centered on property address via geocoding (Jul 8 2026)
- **Financials tab** — Revenue summary, commission breakdown, net payout per platform

### 5.9 Property Management Email

Each property can have a dedicated management email address (`properties.propertyEmail`). This email is used in Phase 2 for email scraping to extract booking confirmation details (guest name, contact, revenue).

---

## 6. Notes

The Notes page (`/notes`) provides full CRUD for household notes with vertical filtering, completion toggling, and source badges (text, voice, tablet, phone).

---

## 7. Settings

The Settings page (`/settings`) is organised into tabs:

**Profile tab** — Edit display name, pronouns, gender identity, and relationship label (all free-text).

**Connected Calendars tab** — Lists all calendars grouped by Google account. Each section shows provider badges, sync status, last sync time, vertical assignment dropdown, and per-calendar delete. Per-account Discover and Disconnect buttons are available.

**Household tab** — Edit household name, wake word, and timezone. Editable only by `household_admin` members.

**Integrations tab** — Google account management with purpose picker (calendar_sync, email_scraping, notes, tasks, gmail_send).

**Notifications tab** — (Jul 8 2026) Per-alert-type cooldown duration sliders. Adjustable cooldowns for: Shadow Block Circuit Breaker, Shadow Block Rate Limit, Cancellation Pending, Booking Date Mismatch, Integration Health Check. Enable/disable toggle per alert. DB-backed via `notification_settings` table.

**Plan tab** — Subscription management (admin-only). Shows plan, status, seats, add-ons, billing.

---

## 8. Shopping System

**Shopping Lists** — Full CRUD with categories, recurring schedules, and inline item editing.

**Shop Agent** — Autonomous shopping sessions with lifecycle: `pending_credentials → ready → shopping → review → approved/cancelled`.

**Order Import** — 42 Walmart orders (Jul 2025–Feb 2026) imported from Gmail. 1,471 Amazon orders (2018–2025) imported from CSV export (Jul 8 2026).

**Product Mapping Cache** — Caches Walmart item IDs and Amazon ASINs. 50 Walmart product IDs seeded from purchase history.

**WhatsApp Import** — Copy-paste WhatsApp messages parsed by LLM to extract structured items.

**Scan List** — Handwritten shopping lists photographed and parsed by LLM vision API.

---

## 9. Financial Management

**Bank Accounts** — Manages bank and credit card accounts. Supported institutions: BofA, Amex, Scotiabank. Multi-currency: USD and JMD.

**Expenses** — Tracks all transactions with personal vs. business categorisation. LLM auto-tags expenses. Receipts uploaded to S3.

---

## 10. Verticals System

Verticals are the core organisational layer of Geeves. They represent life domains and act as containers that own calendars, email accounts, task apps, and future integrations.

### 10.1 New Fields (Phase 1 Pull-Forward)

- `verticals.privacyLevel` — `household` (default) | `admin_only` | `private`
- `vertical_visibility.busyLabel` — configurable label for `busy_only` shadow blocks (default: "Busy")

### 10.2 TJ Perkins Default Verticals

| # | Vertical | Brand Colour | Hex | Google Account | Account Type |
|---|---|---|---|---|---|
| 1 | Home & Family | Coral Red | `#E8624A` | tarik@tjperkinsfam.com | Workspace (service account) |
| 2 | Maxfield Bakery | Indigo Blue | `#4F7EC4` | tarik@maxfieldbakery.com | Workspace (service account) |
| 3 | Maxfield Market | Golden Yellow | `#D4A017` | tarik@maxfieldmarket.com | Workspace (service account) |
| 4 | Personal | Bold Violet | `#8B5CF6` | tarikp@gmail.com | Personal Gmail (OAuth) |
| 5 | StartOut | Amber Orange | `#E8943A` | tarik.perkins@startout.org | Third-party Workspace (OAuth) |

*Colours updated June 17, 2026 to match brand rainbow palette. Previous Tailwind colours were off-brand.*

---

## 11. Dashboard

The dashboard (`/`) is the life management command centre. As of Jul 2026, it uses a **personalised, draggable widget layout** powered by the `WidgetGrid` component (`client/src/components/WidgetGrid.tsx`) and the `widget_layouts` DB table.

Widgets: Calendar, Properties (carousel), Shopping, Financials, Constellation (member cards), Tasks (Phase 2 stub), Geeves Chat (floating pill). Each user's widget order and visibility is persisted server-side via `trpc.dashboard.getLayout` / `trpc.dashboard.saveLayout`. The Tasks widget is intentionally greyed out as a Phase 2 roadmap signal.

---

## 12. AI Layer — Geeves Chat

The Geeves chat agent uses `invokeLLM` with LLM tool calling — 12 tools covering calendar, shopping, finance, household, and orders. The agentic loop runs up to 5 rounds. Chat history is persisted in the `chat_messages` table.

**Visual update (June 16, 2026):** The agent is now presented as a compact branded pill button ("Ask Geeves") with the exact brand mark geometry. The previous large floating constellation has been replaced.

---

## 13. Test Coverage

| Test File | Tests | What is Covered |
|---|---|---|
| `features.test.ts` | 54 | Shopping lists CRUD, items CRUD, move items, orders, expenses, bank accounts, exchange rates, WhatsApp parsing, scan list, shop agent sessions, product mappings, auto-learn, chat history/send/commands |
| `household.test.ts` | 12 | Household create/get, member list/invite/update, role-based access, RBAC permission matrix |
| `calendar-sync.test.ts` | 16 | Google OAuth callback, service account JWT, calendar CRUD, event CRUD, sync service, webhook handler |
| `google-credentials.test.ts` | 6 | GOOGLE_CLIENT_ID format, GOOGLE_CLIENT_SECRET presence, service account email format, private key PEM format, JWT token generation |
| `listScanner.test.ts` | 5 | Image upload endpoint, LLM vision parsing, structured item extraction |
| `auth.logout.test.ts` | 1 | Auth logout clears session cookie |
| `verticals.test.ts` | 13 | Verticals CRUD, owners, integrations, visibility, seedDefaults |
| `calendar-management.test.ts` | 15 | Calendar management, vertical assignment, Google account linking, delete reachability |
| `settings-contracts.test.ts` | 20 | Settings page contracts, calendar/vertical cross-procedure invariants |
| **Total** | **142** | |

---

## 14. Known Gaps & Deferred Items

| Item | Target Phase |
|---|---|
| Recurring event expansion (show each occurrence) | Phase 2 |
| Attendee management (invite guests) | Phase 2 |
| RSVP / accept/decline for invited events | Phase 2 |
| Calendar sharing with external users | Phase 2+ |
| Reminders / push notifications | Phase 2 |
| Calendar event search | Phase 2 |
| Print / export calendar | Phase 2 |
| Properties guest details (email scraping, contact info) | Phase 2 |
| Properties revenue tracking (email scraping, financial data) | Phase 2 |
| Platform API integration (Airbnb, VRBO, Booking.com) | Phase 2 |
| Resend branded email service (`invites@geeves.life`) | Phase 2 |
| Task manager (Asana + Google Keep integration) | Phase 2 |
| Modular/resizable dashboard widgets | ✅ Phase 1 (Jul 2026) — `WidgetGrid` with drag-to-reorder, visibility toggles, server-side persistence |
| Household onboarding flow for new Google sign-ins | Phase 2 |
| 3-year purchase history analysis engine | Phase 2 |
| Child/elder interfaces (picture board, large text) | Phase 3 |
| Voice interface | Phase 3 |
| WhatsApp Business API direct integration | Phase 3 |
| Walmart/Amazon API integration | Phase 4 |
| Automated order workflow | Phase 4 |
| Transforming Constellation animation (nodes morph to domain icons) | Phase 2 |
| AI memory 24h heartbeat cron registration (via manus-heartbeat CLI) | Phase 1 cleanup |

---

## 15. Calendar Feature Status (Pre-Testing Review)

### Complete

| Feature | Status |
|---|---|
| Month / Week / Day / 2-Day views | ✅ Complete |
| Mobile 2-row compact toolbar | ✅ Complete |
| Swipe gesture navigation | ✅ Complete |
| Google Calendar full sync | ✅ Complete |
| Google Calendar incremental sync | ✅ Complete |
| Webhook push notifications | ✅ Complete |
| Workspace service account sync | ✅ Complete |
| Personal Gmail OAuth sync | ✅ Complete |
| Multi-account support | ✅ Complete |
| Add additional Google account | ✅ Complete |
| Calendar vertical colour coding | ✅ Complete (updated June 16, 2026 — now uses vertical colour) |
| Calendar sidebar with visibility toggles | ✅ Complete |
| Create event dialog | ✅ Complete |
| Edit event dialog | ✅ Complete |
| Delete event (with Google write-back) | ✅ Complete |
| Event detail view (tap to open) | ✅ Complete |
| Google Calendar write-back | ✅ Complete |
| Event deduplication (organiser copy wins) | ✅ Complete |
| Shadow blocks (privacy masking) | ✅ Complete |
| Real-time sync via Socket.io | ✅ Complete |
| TimeGridView overlap columns | ✅ Complete |
| Current time indicator | ✅ Complete |
| Pinch-to-zoom on mobile | ✅ Complete |
| Vertical assignment for calendars | ✅ Complete |
| Calendar picker filtered to assigned verticals | ✅ Complete |
| Location field with Google Maps autocomplete | ✅ Complete |
| Video call link (Meet/Zoom/Teams) | ✅ Complete |
| Recurrence rule field (stored) | ✅ Complete |
| Connect Calendar dialog | ✅ Complete |
| Settings > Calendars tab (grouped by account) | ✅ Complete |

### Phase 1 Pull-Forward (In Progress)

| Feature | Status |
|---|---|
| Vertical privacy levels (`privacyLevel` field on verticals) | 🔄 Schema + docs — not yet implemented |
| Cross-vertical visibility enforcement in `events.list` | 🔄 Schema + docs — not yet implemented |
| Configurable `busyLabel` for shadow blocks | 🔄 Schema + docs — not yet implemented |
| EA floor rule (always `busy_only` minimum) | 🔄 Schema + docs — not yet implemented |
| Booking request flow (member → owner/EA) | 🔄 Schema + docs — not yet implemented |
| Properties multi-platform iCal feeds | ✅ Complete (Jun 2026) |
| Properties booking timeline widget | ✅ Complete (Jun 2026) |
| Properties prep rules editor | ✅ Complete (Jun 2026) |
| Properties blackout date picker | ✅ Complete (Jun 2026) |
| Outbound ICS hosting (S3) | ✅ Complete (Jun 2026) |
| Properties photo upload + gallery | ✅ Complete (Jul 8 2026) |
| Properties map auto-load from address | ✅ Complete (Jul 8 2026) |
| Notification Settings panel (adjustable cooldowns) | ✅ Complete (Jul 8 2026) |
| Expense Categorisation Tool (Walmart/Amazon) | ✅ Complete — query fix Jul 8 2026 |

---

## 16. Checkpoint History

| Checkpoint | Date | Description |
|---|---|---|
| `1ca14ca8` | Feb 2026 | Initial project scaffold |
| `aed0af31` | Feb 2026 | Properties, Notes, Settings pages complete |
| `f5cf8d16` | Feb 2026 | Sidebar nav cleanup |
| `78b71237` | Feb 2026 | Mobile calendar toolbar redesign |
| `8c845ba2` | Feb 2026 | Dashboard redesigned as life management command centre |
| `e2f139ae` | Feb 2026 | Design docs added |
| `38462d8e` | Feb 2026 | Calendar discovery fix |
| `13c84ffc` | Feb 2026 | Multi-account calendar fix |
| `75c2d2f` | Feb 2026 | Verticals system |
| `f2...` | Feb 2026 | Calendar real-time sync + shadow blocks |
| `d303294c` | Jun 16, 2026 | Google Maps Places autocomplete for event locations |
| `00acfad3` | Jun 16, 2026 | Gmail fix + docs update + calendar gap analysis |
| `83fe779a` | Jun 16, 2026 | Branding overhaul (brand mark, favicon, AI bot) + calendar vertical colours + access model todo |
| `1d58e7e1` | Jun 17, 2026 | React #310 crash fix (setState-in-render in PrepRulesEditor) |
| `5083f145` | Jun 17, 2026 | Brand conformance NC-01–NC-10 + AI memory DB (49 entries) + updated docs |
| `ab73a742` | Jun 17, 2026 | Gantt redesign (8/15-day, sliding nav, platform fills, prep hatching, stale badge) |
| `1360753d` | Jun 17, 2026 | Mobile clock fix + upcoming events capped to 5 chronological items |
| `a0409504` | Jun 17, 2026 | Calendar widget rebuild (vertical colours, scrollable, duration) + Gantt conflict UI |
| `c92d119` | Jun 18, 2026 | Full codebase + knowledge DB audit; PERFORMANCE.md + SECURITY_ASSESSMENT.md created |
| `b86dae2` | Jun 18, 2026 | v1.8 security hardening + perf sprint (AES-256-GCM tokens, helmet, rate limiting, parallelisation) |
| `71c341a` | Jun 18, 2026 | HARDWARE_PHILOSOPHY.md + CONNECTIVITY_STRATEGY.md design docs |
| `f97ecba` | Jun 19, 2026 | Data integrity investigation — shadow_blocks constraint confirmed live, service account root cause |
| `7e24861` | Jun 19, 2026 | Google Workspace service account architecture fully removed; 48 DB rows migrated |
| `f009378` | Jun 19, 2026 | Performance: removed duplicate iCal fetch, added expiresAt token check |
| `cbc5937` | Jun 19, 2026 | Calendar loading skeletons (TimeGrid, Month, Gantt) + teal shimmer progress bar |
| `e8d20fa` | Jun 19, 2026 | Gantt ●/○ nodes, Morabeza gap fix, refresh button, 4h stale threshold |
| `ff1cad3` | Jun 19, 2026 | Booking.com iCal blocks → confirmed bookings; Gantt ●/○ nodes complete |
| `37456c4` | Jun 19, 2026 | Booking.com email scraper + financial fields on property_bookings |
| `9d1a60d` | Jun 20, 2026 | Sprint v2.12: MembersWidget removed, EA invite permission, eniola guide updated |
| `5742759` | Jun 20, 2026 | Sprint v2.13: MemberPermissions page, member_permission_overrides table, accessControl router |
| `0228fd7` | Jun 20, 2026 | Sprint v2.11: Settings Integrations tab, account purposes field, purpose picker |
| `135ba19` | Jun 20, 2026 | v2.10: Sunday/Holiday prep rule + ICS regeneration |
| `f72ee36` | Jun 20, 2026 | v2.9 security: household isolation helpers, property mutation guards, superAdmin reassign |
| `cd41797` | Jun 22, 2026 | Sprint v2.14: shadow block propagation fix (verticalId=null), 279 events backfilled |
| `1825bc4` | Jun 22, 2026 | 26 missing vertical visibility rules added (full N×(N-1) matrix) |
| `c212d89` | Jun 23, 2026 | Sprint v2.14 COMPLETE: non-destructive account reconnect flow |
| `e86f551` | Jun 24, 2026 | Legal pages: Privacy Policy + Terms of Service |
| `55cbf9e` | Jun 24, 2026 | Google-only authentication: Manus OAuth fully removed |
| `fbafdb6` | Jun 25, 2026 | OAuth 2.0 compliance sprint: incremental scopes, CSRF nonce, token hardening |
| `a4470c8` | Jun 25, 2026 | Landing page sprint: public landing, beta signup, contact form, Super Admin tabs |
| `7daa157` | Jun 25, 2026 | React #310 fix on /member-permissions (myPermsLoading guard) |
| `73b44d55` | Jun 25, 2026 | Subscription Management tab, TypeScript fix, Resend email stub, Walmart parsing fix |

| `a46131f4` | Jun 26, 2026 | Three Properties widget date/rendering bug fixes (upcoming list UTC offset, checkout circle) |
| `28657a1d` | Jul 7, 2026 | Property photos tab + map auto-load + notification flood fix (6h cooldowns) |
| `1e461d59` | Jul 8, 2026 | Notification Settings panel + duplicate booking dedup fix + expense categorisation query fix (MySQL ONLY_FULL_GROUP_BY) |
---

## 17. Phase 2 Planning Notes

*Recorded June 26, 2026*

Phase 2 design document created at `docs/PHASE_2.md`. Key decisions:

- **Shopping cart audit must precede all Phase 2 commerce work.** The Walmart AddToCart URL approach was already implemented in Phase 1 but not documented. Phase 2 begins with a full audit and `SHOPPING_CART_AUDIT.md` before any new shopping code is written.
- **Instacart Developer Platform** identified as highest-priority Phase 2 integration — 15% commission, covers Publix/Costco/Whole Foods/CVS/Walgreens through one API.
- **Affiliate revenue model** documented — 10 beta households at $1,500/month spend = ~$300–$450/month blended; scales to $30K+/month at 1,000 households.
- **Beta acceleration consideration** — if Phase 1 is stable by June 29, 2026, shopping cart + Instacart IDP may be pulled into Phase 1 Beta scope given revenue potential.
- **Resend activated** — `RESEND_API_KEY` added June 26, 2026. `geeves.life` domain verified. Invite emails now route through `invites@geeves.life`.

See `docs/PHASE_2.md` for full retailer research, commission rates, API capabilities, and logo usage guidelines.

---
*Last updated: June 26, 2026 by Manus AI*
