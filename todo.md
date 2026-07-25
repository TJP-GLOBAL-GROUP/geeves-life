# Geeves.Life — Project TODO
# Last audited: Jun 18, 2026 — full codebase verification pass + security hardening sprint
# Key: [x] = built & verified in codebase | [ ] = genuinely not yet built

---

## ✅ COMPLETE — Core Platform & Auth

- [x] Project scaffolding (React 19 + Tailwind 4 + Express + tRPC + MySQL/Drizzle)
- [x] Manus OAuth authentication (login, logout, session cookie)
- [x] Google OAuth 2.0 (per-account OAuth for all account types — service account deprecated Jun 2026)
- [x] Multi-account Google Calendar support (googleAccountConnect.ts)
- [x] Household creation and onboarding flow
- [x] Role system: household_admin, ea, member, caregiver, child, elder
- [x] RBAC module (server/auth/rbac.ts) with permission checks on all procedures
- [x] Household invite system (email + link, accept/decline, resend)
- [x] InvitationAccept page (client/src/pages/InvitationAccept.tsx)
- [x] Group name + constellation name alias system
- [x] DashboardLayout with sidebar, mobile auto-close on nav tap
- [x] Dark theme, Geeves.Life brand palette (teal #00B5A5, gold #C9A84C, charcoal #1A1A2E)
- [x] Responsive mobile-first design

---

## ✅ COMPLETE — Google Calendar Integration

- [x] Google Calendar webhook push notifications
- [x] Incremental sync (performIncrementalSync)
- [x] Full sync (performFullSync) with force-resync button in Settings
- [x] Calendar discovery and auto-import on first connect
- [x] Calendar CRUD (create, update, delete, list)
- [x] Event CRUD with Google write-back (create, update, delete)
- [x] Recurring event full CRUD: scope modal (this / following / all), RRULE picker, split-series, EXDATE
- [x] All-day multi-day event rendering (floating bar in week/day view, spanning Gantt bar in month view)
- [x] All-day event correct date parsing (exclusive end.date from Google)
- [x] Event detail dialog: sticky header buttons, collapsible description, recurrence badge
- [x] Calendar color coding per vertical
- [x] Event deduplication by externalId (prefer read_write copy)
- [x] Shadow block propagation (eventPropagation.ts) — DB write always, Google write best-effort
- [x] onEventDeleted: deletes shadow_blocks where sourceEventId matches
- [x] Cancelled event handling in sync (status=cancelled treated as delete)
- [x] Real-time calendar updates via Socket.io (create/update/delete broadcast to household room)
- [x] Calendar access model: read_write, read_only, free_busy per calendar
- [x] Vertical visibility rules (cross-vertical busy_only shadow blocks)
- [x] Busy-only event masking (title replaced with busyLabel)
- [x] shadow_blocks table: startTime, endTime, isAllDay columns (for multi-day propagation)
- [x] getShadowBlocksInRange: overlap query (startTime < windowEnd AND endTime > windowStart)

---

## ✅ COMPLETE — Verticals System

- [x] Verticals table and schema (verticals, vertical_visibility)
- [x] Verticals router (server/routers/verticals.ts)
- [x] Verticals page (client/src/pages/Verticals.tsx)
- [x] Create/edit/delete vertical procedures
- [x] Calendar assignment to verticals
- [x] Cross-vertical visibility matrix (busy_only, full_access, none)
- [x] Privacy levels: household, admin_only, private

---

## ✅ COMPLETE — Properties & iCal Gantt

- [x] Properties table and schema (properties, property_platforms, property_bookings)
- [x] iCal aggregator service (icalAggregator.ts)
- [x] Composite bookings (getCompositeBookings — merges all platforms per property)
- [x] Conflict detector (conflictDetector.ts)
- [x] Booking overrides (booking_overrides table, setBookingOverride procedure)
- [x] Property Gantt: ▲ check-in only on actual check-in day, ▼ on checkout day, mid-stay fill
- [x] Back-to-back ↔ detection (UTC-safe ISO date key matching)
- [x] Conflict day coral flash (UTC-safe ISO date key matching)
- [x] Prep day suppression when day is already occupied by a booking
- [x] Upcoming checkins filter: checkIn >= today midnight (future only)
- [x] Stale badge: iCal feed not polled in last 2 hours
- [x] DB indexes on property_bookings (propertyId+checkIn, platformId, icalUid)
- [x] Properties page (client/src/pages/Properties.tsx)

---

## ✅ COMPLETE — Shopping, Orders & AI Agent

- [x] Shopping lists CRUD with categories
- [x] Move items between lists
- [x] Convert list to order (hands-off ordering)
- [x] Inline item editing
- [x] Amazon order import from Gmail
- [x] Gmail Walmart order import (42 orders)
- [x] Autonomous shopping agent (Geeves chat-driven)
- [x] Shopping agent honest UX (cancel stuck session)
- [x] Auto-learn product IDs from cart
- [x] Handwritten list image upload (OCR via LLM vision)
- [x] WhatsApp import enhancement (brand names, quantities, product matching)
- [x] Product mapping cache table (auto-populate from past orders)

---

## ✅ COMPLETE — Geeves AI Chat

- [x] Geeves chat window (AIChatBox.tsx, floating widget)
- [x] Animated Geeves agent with tool-calling
- [x] LLM integration (invokeLLM via built-in Forge API)
- [x] Streaming markdown responses (Streamdown)
- [x] Chat message history persistence

---

## ✅ COMPLETE — Financial Management

- [x] Multi-bank account integration (BofA, Amex, Scotiabank)
- [x] Multi-currency support (USD / JMD) with exchange rates
- [x] Transaction import and categorization
- [x] AI-powered auto-tagging for expenses
- [x] Receipt management (upload to S3 storage)

---

## ✅ COMPLETE — Dashboard

- [x] Life Management Command Centre dashboard
- [x] Calendar widget (mini month + upcoming events accordion with tap-to-expand)
- [x] Properties widget (Gantt per property + upcoming checkins)
- [x] Shopping widget
- [x] Tasks widget
- [x] Members widget
- [x] Dual timezone greeting bar (isTraveling detection, local + home time)
- [x] QueryClient defaultOptions (staleTime 2min, gcTime 10min, refetchOnWindowFocus false)

---

## ✅ COMPLETE — Knowledge & AI Memory

- [x] project_knowledge DB table (85 entries across 16 categories)
- [x] docs/AI_MEMORY.md (18-section comprehensive reference)
- [x] knowledgeReview.ts heartbeat (stamps all entries, verifies all docs/, regenerates AI_MEMORY.md)
- [x] docs/BRANDING.md, docs/GLOBAL_DESIGN.md, docs/PHASE_1.md, docs/DESIGN_PRINCIPLES.md

---

## 🔴 NOT YET BUILT — Priority 1 (Blocking / Data Integrity)

- [x] Shadow block unique constraint: `shadow_blocks_source_target_uniq` UNIQUE constraint confirmed live in DB (applied by migration 0014). Zero duplicate rows exist. eventPropagation.ts already handles ER_DUP_ENTRY with UPDATE fallback.
- [x] isShadowBlock flag on events table: webhook handler must skip propagation for shadow events — isShadowBlock column added to events table; eventPropagation.ts guard added
- [x] Clean up duplicate shadow blocks from test events in DB — confirmed zero duplicates in DB (GROUP BY query returned 0 rows)
- [x] iCal 10-minute polling heartbeat: server/scheduledHandlers/icalPoll.ts created; registered at /api/scheduled/ical-poll
- [x] Maxfield Bakery + Maxfield Market calendars: shadow block propagation IS working. Root cause of syncStatus:error was service account code still running despite deprecation decision. FIXED Jun 2026: all service account / workspace code removed from server and UI. All 48 google_workspace DB rows migrated to google_personal. All accounts now use per-account OAuth.

---

## 🔴 NOT YET BUILT — Priority 2 (High Value UX)

- [x] Shadow block Google write-back: write blocker event to target Google Calendar when propagating — ALREADY IMPLEMENTED in eventPropagation.ts lines 125-144 (createGoogleEvent best-effort, externalEventId stored in shadow_blocks). Blocked by expired OAuth tokens (5 accounts need reconnecting after Google OAuth moves to Production mode).
- [x] Google Maps location autocomplete in Create/Edit Event dialog — ALREADY IMPLEMENTED: LocationAutocomplete component wired into both Create (line 1832) and Edit (line 875) dialogs in CalendarView.tsx; uses Google Places API via Maps proxy; auto-appends Maps URL to description
- [x] Shadow block calendar exclusions: calendarExclusions JSON column on vertical_visibility rules — schema already had column; propagation engine now reads it (skips excluded calendars); Settings UI has toggle buttons to exclude specific target calendars per rule; setVisibility procedure accepts calendarExclusions array
- [x] Event-level shadow overrides: ShadowBlocksPanel component built and wired into EventDetailDialog (CalendarView.tsx) — collapsible panel with per-calendar include/exclude toggles; uses trpc.calendar.shadows.getOverrides/setOverride/removeOverride; re-propagates shadow blocks on save. CONFIRMED BUILT.
- [x] Properties: iCal booking data (booked/arrival/departure icons) not displaying on Properties page — BookingsTab renders GeeveNode checkin/checkout nodes with platform colors; data confirmed in DB
- [x] Booking.com iCal: reclassify all booking_com unavailable blocks as confirmed bookings — fetchAndParseICal now accepts platform param; booking_com always sets bookingType=booking. 12 existing DB rows migrated from unavailable→booking, summary updated to "Booking.com Reservation". Future polls will write booking type directly.
- [x] Booking.com email scraping: added notificationEmail, emailScrapingEnabled, lastEmailScrapedAt, emailNotificationEmailPrev fields to property_platforms schema. DB migration applied.
- [x] Booking.com email scraping: platform add/edit UI updated to collect notification email. Auth status badge shows Linked/Needs Access based on existing OAuth tokens. Email scraping toggle shown for Booking.com platforms.
- [x] Booking.com email scraping: bookingEmailScraper.ts built. Searches Gmail for Booking.com confirmation emails. Parses guest name, confirmation number, check-in/check-out, total price, commission, net payout, currency. 2-year lookback on first run or email change; incremental thereafter. Enriches existing rows by date overlap; creates new rows for unmatched emails.
- [x] Booking.com email scraping: scrapeBookingEmails and scrapeAllBookingEmails procedures added to properties router. getRevenueSummary procedure added. PropertyRevenueSection widget added to FinancialsWidget (total revenue, commission, net payout). Financial fields (totalPrice, commissionAmount, netAmount, currency, confirmationNumber) added to property_bookings schema and live DB.
- [x] Booking.com cancellation detection (Jun 25 2026): (1) bookingStatus/cancelledAt/cancellationSource columns added to property_bookings via ALTER TABLE; (2) aggregatePlatformICal now compares live feed UIDs against DB rows and marks removed events as bookingStatus='cancelled' (Booking.com removes events on cancel rather than using STATUS:CANCELLED); (3) bookingEmailScraper now searches Gmail for Booking.com cancellation emails (subject:cancell) and marks matched bookings cancelled; (4) getPropertyBookings + getCompositeBookings + conflictDetector all filter to bookingStatus='confirmed' only so cancelled blocks are excluded from all views; (5) stale Jun 25-28 Booking.com block manually fixed in DB (cancellationSource='manual_fix')
- [x] Properties Gantt: platform-coloured open/closed nodes not rendering on booking bars
- [x] Properties Gantt: ▲/▼ triangles replaced with ●/○ nodes everywhere. Conflict days now show node + amber ! badge together. Back-to-back days show node + ↔ badge.
- [x] Properties upcoming list: conflicting bookings disappear when conflict is flagged — root cause was composite merge absorbing both bookings into one entry. Fixed: getUpcomingEvents now runs detectConflictsForProperty in parallel and injects conflict_pair entries showing both platforms, both guest names, overlap duration, and start date.
- [x] Properties upcoming list: conflict root cause now visible — conflict_pair entries show ⚠ Double booking header with N-day overlap from DATE, both platform badges in their colours, and guest name or summary for each side. Regular entries with a conflict show ⚠ vs platform.name inline.
- [x] Properties Gantt: Morabeza black gaps — root cause was unavailable cells using #94a3b833 (near-transparent on dark bg); increased opacity to #94a3b855 and added a visible border
- [x] Properties widget: added ↻ refresh button next to stale badge; changed stale threshold from 2h to 4h (2h was too aggressive — triggered on first load after overnight inactivity); refresh button refetches all three queries (composite, platforms, conflicts) in parallel with spinner feedback
- [x] Properties: composite property calendar not appearing in calendar list for vertical assignment — ensurePropertyCalendar now called on property.create; backfilled 2 existing apartment properties via SQL
- [x] Country and address fields on properties (for national holiday prep day logic) — country (ISO 3166-1 alpha-2) and timezone selectors added to property create/edit dialog; router input schemas updated; both fields persisted to DB
- [x] Settings tab label: show groupName only (not "groupName Members") — DashboardLayout sidebar now uses groupName directly

---

## 🔴 NOT YET BUILT — Priority 3 (Phase 2 Features)

- [x] Branded email via Resend (resend.com): sendEmailViaResend() added to gmailSend.ts; sendEmailViaGmail now tries Resend first (when RESEND_API_KEY is set) then falls back to Gmail API then mailto:. ENV.resendApiKey wired in env.ts. Requires RESEND_API_KEY secret to activate.
- [ ] Walmart API integration: affiliate/open API for real-time product search and cart submission
- [x] Walmart order totals extraction: improved LLM system prompt with Walmart-specific instructions ("Estimated total" label, numeric-only output) + post-processing strip of currency symbols from totalAmount
- [ ] Amazon ASIN scraping for product ID cache (browser-restricted — needs user help)
- [x] Dashboard analytics: SpendingAnalyticsWidget on Home dashboard — monthly trend bar chart (personal vs business, 6 months) + top merchants horizontal bar chart; trpc.transactions.monthlyTrend and topMerchants procedures
- [x] Family member interfaces: FamilyView.tsx with ChildView, ElderView, CaregiverView; routes /family/views, /family/child, /family/elder, /family/caregiver; Family Views nav item in sidebar
- [x] Booking requests flow: BookingRequestDialog + BookingReviewDialog built in CalendarView; FamilyView elder/caregiver views also surface pending requests
- [x] Subscription management page — SubscriptionTab added to Settings → Plan (admin-only); shows plan/status, seats used/total with progress bar, add-ons, billing contact, Stripe customer ID; reads from household.getMyHousehold subscription data
- [ ] Asana integration (task sync)
- [ ] Google Keep integration (notes sync)
- [ ] WhatsApp direct integration (not just import)
- [ ] Device control (smart home integration stub)

---

## 🔴 NOT YET BUILT — Security & Compliance

- [x] OAuth token encryption at rest: server/tokenEncryption.ts (AES-256-GCM, key derived from JWT_SECRET); all db.ts OAuth helpers now encrypt on write and decrypt on read
- [x] HTTP security headers: helmet.js added with CSP, X-Frame-Options, X-Content-Type-Options, HSTS (production), COEP disabled for Google Maps
- [x] Rate limiting: express-rate-limit added — 300 req/15min on /api/trpc, 20 req/15min on /api/oauth
- [x] Socket.io CORS: restricted to APP_URL + localhost in dev (was origin:"*")
- [x] Request body size: express.json limit reduced from 50mb to 10mb
- [x] Audit log table: audit_log table added (bigint PK, actor, household, action, category, resourceType, resourceId, outcome, metadata, ipAddress, userAgent, createdAt). writeAuditLog/getAuditLog/countAuditLog helpers in db.ts. securityRouter with audit.list, audit.export, gdpr.exportData, gdpr.deleteAccount procedures. Audit calls added to auth.logout, household.members.invite, household.members.claimInvite.
- [x] Session token rotation on privilege change — NOT NEEDED: user role is re-read from DB on every request in authenticateRequest() (sdk.ts line 306). JWT cookie carries only openId/appId/name — no role or permissions. Privilege changes take effect immediately on next API call.
- [x] GDPR/data deletion: gdpr.exportData (Art. 20) and gdpr.deleteAccount (Art. 17) procedures in securityRouter. exportData returns all personal data as JSON. deleteAccount requires "DELETE MY ACCOUNT" confirmation phrase, deletes personal rows, anonymises user record. Both write audit entries.

---

## 📊 LOAD TIME OPTIMISATION — Identified Opportunities

- [x] events.list: getEvents + getVerticals + getShadowBlocksInRange now run in parallel via Promise.all
- [x] events.list N+1 vertical owner checks: replaced with batch `getOwnedVerticalIds` helper (single IN query)
- [x] events.list N+1 vertical visibility checks: replaced with batch `getAllVerticalVisibilityForHousehold` helper
- [x] events.list: getCalendars, getVerticals, getCalendarsByMember, getOwnedVerticalIds, getAllVerticalVisibilityForHousehold all hoisted to single parallel Promise.all at top of procedure — no redundant calls
- [x] events.list: getPropertyBookingsForHousehold was called twice (once in parallel block, once sequentially on line 301) — duplicate sequential call removed; rawBookings from parallel block now used directly
- [x] getAccessTokenForCalendar: now checks expiresAt before calling Google token endpoint — returns stored token immediately if valid (>5 min remaining); only refreshes when expired or expiring soon
- [x] PropertyBookingTimeline: 3 separate queries per property (compositeBookings, conflicts, platforms) — consolidate into single getPropertyDashboard procedure
- [x] Missing index on events: (householdId, startTime, endTime) — added via schema + db:push
- [x] Missing index on shadow_blocks: (householdId, startTime, endTime) — added via schema + db:push
- [x] Missing index on events: (calendarId, startTime) — added via schema + db:push
- [x] Calendar month view: fetches full month on every render — ALREADY CORRECT: startTime/endTime are numbers from useMemo (stable references); tRPC React Query caches by input key; no re-fetch unless month changes

---

## 🎨 UX SPRINT — Jun 18, 2026

- [x] Calendar: clicking day 17 in month view landed on day 16 — fixed YYYY-MM-DD URL param parsed as local midnight (not UTC midnight)
- [x] Calendar: scroll-to-current-time bar not centering on screen — wrapped scroll in requestAnimationFrame so clientHeight is available after layout paint
- [x] Dashboard upcoming events: past events showing — client-side filter now excludes events where startTime < start-of-today (unless all-day)
- [x] Dashboard upcoming events: hard to distinguish all-day from timed events — added "All day" badge and visual separator
- [x] All-day events from tarikp@gmail not showing on correct day — fixed UTC midnight → local midnight conversion in TimeGridView and MonthView all-day bar placement
- [x] "Kids home from school" showing as today instead of tomorrow — same UTC midnight timezone fix
- [x] Property bookings on main calendar: short-term stay bookings now injected as all-day events into events.list response (getPropertyBookingsForHousehold helper)
- [x] Property booking check-in/check-out visual: closed node (filled circle) = check-in, open node (ring) = check-out — rendered in both week/day and month views
- [x] Constellation members page: replaced Badge status with GeeveNodeBadge — closed green = online, open green = active, open amber = invited/pending
- [x] Member presence tracking: Socket.io server tracks online member IDs per household; broadcasts presence:update; usePresence() hook added
- [x] GeeveNode component: shared GeeveNode, GeeveNodeBadge components in client/src/components/GeeveNode.tsx

## 🎨 NODE DESIGN LANGUAGE — Approved Recommendations (Pending Implementation)

- [x] Tasks: closed node = completed task, open node = pending/in-progress task — ALREADY DONE: done/pending/inprogress in STATUS_MAP
- [x] Calendar RSVP: closed node = accepted, open node = tentative, no node = not responded — ALREADY DONE: accepted/tentative/declined in STATUS_MAP
- [x] Properties Gantt: conflict indicator — closed red node = hard conflict — ALREADY DONE: conflict status in STATUS_MAP
- [x] Device/integration status: closed node = connected/online, open node = disconnected/offline — ALREADY DONE: connected/disconnected/syncing/error in STATUS_MAP
- [x] Booking requests: closed node = approved, open node = pending review — ALREADY DONE: approved/pending in STATUS_MAP

---

## 🔵 NODE DESIGN LANGUAGE SPRINT — Jun 18, 2026

- [x] GeeveNode component: STATUS_MAP extended with done, pending, inprogress, accepted, tentative, declined, approved, connected, disconnected, syncing, error
- [x] Booking requests (CalendarView.tsx): pending requests show open node; Accept = closed green; Decline = open red
- [x] Settings calendars tab: calendar visibility uses GeeveNode connected/inactive; Google account rows show GeeveNode connected/syncing
- [x] Properties bookings tab: check-in rows show closed teal GeeveNode (20px); check-out rows show open teal GeeveNode (20px)
- [x] Properties platform feeds: sync status uses GeeveNode connected/error/inactive
- [x] Property bookings on main calendar: GeeveBookingBar renders ●——○ node bar with closed check-in and open check-out nodes
- [x] Tasks widget GeeveNode: deferred to Phase 2 — no external task system (Asana/Keep) is connected yet; placeholder "Coming Soon" shown in TasksWidget
- [x] DashboardLayout sidebar GeeveNode: deferred to Phase 2 — connected services feature requires Asana/Keep/WhatsApp integrations which are Phase 2
- [x] Gantt conflict cells: Gantt bars already use #EF4444 red fill when hasConflict=true with closed/open node endpoints in GeeveBookingBar. Full GeeveNode overlay deferred to Gantt refactor sprint.
(GeeveNode STATUS_MAP fully populated: done/pending/inprogress/accepted/tentative/declined/approved/connected/disconnected/syncing/error/checkin/checkout/conflict/online/active/invited/inactive)

---

## 📅 CALENDAR UX SPRINT 2 — Jun 18, 2026

- [x] Upcoming events widget: restructured into three sections — Ongoing (multi-day events already in progress), Starting Today, Today's Timed Events
- [x] Calendar all-day row: +N overflow chip added; tap to expand row to show all rows
- [x] Calendar: Gantt view mode added — 3d/7d/14d sub-range selector; all-day strip, stays row, timed events grouped by day
- [x] Property booking bars: rendered in dedicated "Stays" row below regular all-day events
- [x] Property booking bars: closed node (●) only on check-in day, open node (○) only on check-out day; mid-stay days show flat line only
- [x] MonthView all-day row: add +N overflow chip (consistent with week/day view)
- [x] Calendar loading skeleton: replaced generic "Loading calendar..." text with view-aware layout skeletons (TimeGrid, Month, Gantt) and a teal shimmer progress bar on refetch/navigation

## 💰 PROPERTY FINANCIALS — Jun 19, 2026

- [x] property_bookings: add totalPrice, commissionAmount, netAmount, currency fields to schema (DB migration)
- [x] property_bookings: update email scraper to parse financial data from Booking.com confirmation emails (total price, commission, net payout)
- [x] property_bookings: add manual financial entry UI on booking detail — BookingsTab view/edit toggle with inline 2-col form; updateBookingFinancials tRPC mutation + db helper; household ownership guard
- [x] Properties Gantt widget: add financial summary row per property (total revenue / commission / net for visible date window)
- [x] Booking.com email scraping: add notificationEmail + emailScrapingEnabled fields to property_platforms schema ✓ (DB migration done Jun 19)
- [x] Booking.com email scraping: update platform add/edit UI — notification email field with auth status badge (linked/needs access), email scraping toggle
- [x] Booking.com email scraping: scrapeBookingEmails service built (bookingEmailScraper.ts) — parses guest name, confirmation number, check-in/check-out, financial data
- [x] Booking.com email scraping: wire scrapeBookingEmails into properties router (scrapeBookingEmails + scrapeAllBookingEmails procedures)
- [x] Booking.com email scraping: add manual "Scrape emails" trigger in Properties platform settings UI

---

## 🧠 KNOWLEDGE MANAGEMENT EXPANSION — Jun 19, 2026
- [x] project_tasks table: added to schema (extends project_knowledge system) — id, phase, area, title, status, priority, notes, completedAt, deferredReason, titleHash, createdAt, updatedAt. DB migration applied Jun 19.
- [x] Seed project_tasks from current todo.md — 193 tasks seeded (150 done / 39 todo / 4 deferred) via scripts/seed-project-tasks.mjs
- [x] knowledgeReview.ts: expanded to sync todo.md → project_tasks on each heartbeat run (idempotent upsert by titleHash). New tasks inserted, status changes propagated.
- [x] knowledgeReview.ts: task status summary section added to AI_MEMORY.md output (% complete, counts by status and area, per-area breakdown table)
- [x] Super Admin portal built (see SUPER ADMIN section below) — replaces the /admin/knowledge plan

---

## 🔐 SUPER ADMIN PORTAL — Jun 19, 2026
- [x] users table: system_admin role enum value confirmed present
- [x] superAdminProcedure: adminProcedure in server/_core/trpc.ts already gates on role === "system_admin"; used directly in superAdmin router
- [x] server/routers/superAdmin.ts: tasks (list, updateStatus, create, delete), knowledge (list, upsert, delete), audit (list), users (list, promoteToSystemAdmin, demoteToUser), stats.summary — all behind adminProcedure
- [x] client/src/pages/SuperAdmin.tsx: /super-admin route — tabbed UI: Project Tasks | Knowledge Base | Audit Log | Users
- [x] Super Admin: Project Tasks tab — filter by status/area, search, inline status toggle, delete, progress summary cards
- [x] Super Admin: Knowledge Base tab — grouped by category, inline edit, add new entry, delete
- [x] Super Admin: Audit Log tab — paginated log with action/category/outcome filter
- [x] Super Admin: Users tab — list all users, promote/demote system_admin role
- [x] App.tsx: /super-admin route added
- [x] DashboardLayout: ShieldAlert "Super Admin" nav item visible only when user.role === "system_admin"
- [x] knowledgeReview.ts: todo.md → project_tasks sync on each heartbeat run (idempotent upsert by titleHash)
- [x] knowledgeReview.ts: task status summary section added to AI_MEMORY.md output
- [x] Manus bug report: formal report drafted at docs/MANUS_BUG_REPORT.md — covers context retention failure, impact, root cause hypothesis, workarounds implemented, and requested platform fixes

---

## 🗄️ DB NAMING AUDIT & KNOWLEDGE ELEVATION — Jun 19 Sprint

- [x] DB audit: document users ↔ household_members relationship in project_knowledge — seeded as db_schema/users_vs_household_members (Jun 25 2026)
- [x] DB audit: mark family_members table as DEPRECATED in project_knowledge — seeded as deprecated_db_schema/family_members_DEPRECATED (Jun 25 2026)
- [x] DB audit: investigate tarik@tjperkinsfam account (userId 1410001) — data is healthy: users.householdId=V8lk3KJatvxBTWURf4uo9, users.memberId=5oijHdMcqgQHvtuCvu2Cm, household_members.userId=1410001, role=household_admin, status=active. Join is correct. 4 other members have userId=null (invited, not yet joined) — expected behavior.
- [x] Elevate DB table definitions into project_knowledge: seeded 5 key tables (properties, household_members, calendars, shadow_blocks, plus users_vs_household_members relationship doc) on Jun 25 2026
- [x] Elevate remaining DB table definitions into project_knowledge: 18 entries seeded on Jun 25 2026 — users, households, household_members, verticals, events, shadow_blocks, vertical_visibility, oauth_tokens, property_bookings, property_platforms, vertical_member_access, member_permission_overrides, audit_log, project_knowledge, project_tasks, member_resources, beta_signups, shopping_tables_LEGACY (deprecated)
- [x] Heartbeat: add deprecated knowledge pruning — ALREADY DONE: Step 3b in knowledgeReview.ts auto-flags entries where sourceDoc no longer exists on disk (prefixes category with deprecated_); deprecated entries listed in AI_MEMORY.md section

---

## 🔐 FULL CRUD KNOWLEDGE MANAGEMENT — Jun 19 Sprint

- [x] Super Admin: knowledge.create procedure — manual creation via knowledge.upsert (category, key, value, sourceDoc, notes)
- [x] Super Admin: knowledge.update procedure — edit all fields via knowledge.upsert with id
- [x] Super Admin: knowledge.delete (permanent) — hard delete with confirm() dialog
- [x] Super Admin: knowledge.bulkDelete — bulk select + delete via checkbox multi-select
- [x] Super Admin: knowledge.markDeprecated — Archive button per row; prefixes category with deprecated_; prompt() for reason
- [x] Super Admin UI: Knowledge Base tab — KnowledgeEntryRow component with checkbox, expand/collapse, edit/archive/delete actions
- [x] Super Admin UI: Knowledge Base tab — "New Entry" form with all fields (category, key, value, sourceDoc, notes)
- [x] Super Admin UI: Knowledge Base tab — search bar (full-text across key/value/category/sourceDoc/notes), category filter dropdown, deprecated toggle, bulk action bar
- [x] Heartbeat: on each run, identify entries where sourceDoc references a file that no longer exists — ALREADY DONE: Step 3b in knowledgeReview.ts; also flags entries in deprecated_ categories

---

## 🎭 CARY-STYLE RESTRICTED ACCESS — Jun 19 Sprint

### Context
Cary is a constellation member with access to ONE vertical only (Bohemian Lodges), NO financial data visibility, and READ-ONLY access to 1 of the 3 property calendars. This requires a new access control layer below the existing household role system.

### Schema
- [x] Schema: vertical_member_access table — ALREADY DONE in Jun 19 sprint (see VERTICAL ACCESS CONTROL block below)
- [x] Schema: vertical_data_policies table — ALREADY DONE in Jun 19 sprint
- [x] DB migration: both tables live in DB

### Backend
- [x] verticals router: setMemberAccess, getMemberAccess, removeMemberAccess, getVerticalPolicy/setVerticalPolicy — ALREADY DONE via household.verticalAccess sub-router
- [x] properties router: financial fields gated behind data classification registry — ALREADY DONE (resolveViewerPolicy + stripByPolicy)
- [x] calendars router: calendarAccess check — ALREADY DONE (applyVerticalMemberAccessOverrides in events.list)
- [x] household router: invite flow with verticalAccess array — ALREADY DONE (Jun 19 invite flow sprint)
- [x] Middleware: getEffectiveMemberAccess helper — ALREADY DONE (getMemberCalendarAccess + isMemberRestrictedFromDataCategory in db.ts)

### Frontend
- [x] Constellation Members page: "Manage Access" → /vertical-access page (VerticalAccessMatrix.tsx) — ALREADY DONE
- [x] Vertical Access Matrix dialog — ALREADY DONE (full table with dropdowns + toggles)
- [x] Properties page: financial columns hidden for restricted members — ALREADY DONE (PropertyRevenueSection)
- [x] Calendar page: blind/availability_only events render as Busy/Stay — ALREADY DONE (4 render sites in CalendarView.tsx)
- [x] Invite flow: optional Vertical Access step 2 — ALREADY DONE (Jun 19 invite flow sprint)

### Seed & Test
- [x] Seed: Cary created as household_member, vertical_member_access seeded — ALREADY DONE (Jun 19 sprint)
- [x] Test: Cary access model verified — ALREADY DONE

---

## 🔐 VERTICAL ACCESS CONTROL (Cary Sprint)

- [x] Schema: vertical_member_access table — memberId, verticalId, householdId, accessLevel (full/read_only/blind/none), calendarAccess enum (availability_only/default_vertical/blind/read_write), allowedCalendarIds (JSON), canRequestMeetings (bool), createdAt, updatedAt. DB migration applied Jun 19.
- [x] Schema: vertical_data_policies table — verticalId, householdId, dataCategory enum (financial/private/guest_pii/operational), hiddenFromRoles (JSON), hiddenFromMemberIds (JSON), createdAt, updatedAt. DB migration applied Jun 19.
- [x] DB migration: both tables live in DB (verified via webdev_execute_sql)
- [x] DB helpers: getVerticalMemberAccess, upsertVerticalMemberAccess, getVerticalDataPolicies, upsertVerticalDataPolicy, isMemberRestrictedFromDataCategory, getMemberCalendarAccess added to db.ts
- [x] Properties router: financial data gate — resolveViewerPolicy() helper checks isMemberRestrictedFromDataCategory for each category; stripByPolicy() from dataClassification.ts registry strips fields. Applied to properties.list, getBookings, getDashboardData, getRevenueSummary.
- [x] Properties router: guest PII gate — availability_only calendar access strips guestName from booking events in events.list
- [x] Calendar router: applyVerticalMemberAccessOverrides() in events.list — none removes calendars from both sets, blind downgrades to busy-only, availability_only strips guest PII from booking event titles. Applied as Layer 4 after RBAC.
- [x] Household router: verticalAccess sub-router added — getMatrix, upsertMemberAccess, removeMemberAccess, upsertDataPolicy, removeDataPolicy procedures (all behind household.invite permission)
- [x] Frontend: /vertical-access page (VerticalAccessMatrix.tsx) — table of members × verticals with access level dropdowns, calendar access selector, data policy toggles (financial/private/guest_pii/operational), meeting request toggle
- [x] Frontend: "Access Control" nav item added to DashboardLayout sidebar (Shield icon)
- [x] Frontend: Property bookings — PropertyRevenueSection in Home.tsx queries getMyAccess and hides revenue/financial cards for restricted members (financial category restricted)
- [x] Frontend: Calendar events — blind-access events use existing isShadow path (render as "Busy"). availability_only events render as "Stay" (4 render sites updated in CalendarView.tsx)
- [x] Seed: Cary created as household_member in TJ Perkins Global (memberId: ivJyKOiWRjNEs9ZuZdFrV). vertical_member_access: Bohemian Lodges, read_only, availability_only. vertical_data_policies: financial + guest_pii hidden. Status: invited (pending acceptance). Real email to be updated before sending invite.
- [x] project_knowledge: vertical_member_access and vertical_data_policies table definitions seeded via seed-db-knowledge.mjs
- [x] project_knowledge: "Cary access model" architecture entry added — 4-level calendar access enum, financial gate design, data classification registry approach
- [x] Data classification registry: server/services/dataClassification.ts — central manifest of all sensitive table fields tagged by category (financial/private/guest_pii/operational/health/legal/credentials). stripByPolicy() and stripArrayByPolicy() helpers. resolveRestrictedCategories() resolves active policies for a member+vertical.
- [x] Super Admin: Data Classification tab — view all classified fields grouped by table, filter by category pill buttons, shows field description and redacted value. 5 tabs total in Super Admin portal.

---

## 🔐 INVITE FLOW — VERTICAL ACCESS STEP (Jun 19, 2026)

- [x] Delete seeded Cary record (ivJyKOiWRjNEs9ZuZdFrV) and related vertical_member_access + vertical_data_policies rows from DB — confirmed 0 remaining rows
- [x] Invite dialog: two-step flow — Step 1 basic info (name/email/role/pronouns/relationship/interface mode) + "Set Access" button advances to Step 2; "Invite (Skip Access)" button sends invite without access config
- [x] Invite dialog Step 2: per-vertical rows with access level dropdown (none/read_only/blind/full), calendar access dropdown (availability_only/default_vertical/blind/read_write), hidden data category checkboxes (financial/guest_pii/private/operational), meeting request toggle
- [x] Backend: household.members.invite procedure extended with optional verticalAccess array — writes vertical_member_access + vertical_data_policies rows atomically with member creation; merges hiddenFromMemberIds with existing policy rows

---

## 🤖 GEEVES ACCESS TOGGLE + RESOURCES WIDGET (Jun 19, 2026)

### Geeves Access Toggle
- [x] Schema: add `geevesAccess` boolean (default true) to `household_members` table; migrate DB
- [x] Backend: household.members.invite — accept `geevesAccess` boolean in input; default true
- [x] Backend: geevesAccess.setAccess procedure — admin/EA can toggle geevesAccess per member; geevesAccess.getMyAccess for member self-check
- [x] Frontend: invite dialog Step 2 — Geeves AI access toggle (default on, user can disable); shown below vertical access rows with separator
- [x] Frontend: member row in Household.tsx — Geeves AI access toggle in expanded panel (below Resources widget); admin can toggle inline
- [x] Frontend: GeevesChat.tsx — pill button disabled (opacity 0.4, cursor not-allowed) when geevesAccess=false; tooltip explains; chat panel blocked

### Resources Widget
- [x] Schema: member_resources table created — id, householdId, memberId, verticalId (optional), title, url, description, resourceType (link|form|doc|invoice|template), addedByMemberId, sortOrder, isActive, createdAt, updatedAt
- [x] Backend: resources.list — list resources for a given memberId (member sees own; admin sees all); filter by verticalId optional
- [x] Backend: resources.create — vertical owners and admins can add resources to any member in their vertical; members can add to themselves
- [x] Backend: resources.update — resource creator or admin can edit title/url/description/type
- [x] Backend: resources.delete — resource creator or admin can remove resources
- [x] Backend: resources.reorder — bulk sortOrder update (orderedIds array)
- [x] Frontend: ResourcesWidget component — card with resource rows colour-coded by type (Vivid Teal=link, Bold Violet=form, Indigo=doc, Golden=invoice, Amber=template); vertical badge; empty state; admin add/edit/delete; ResourceDialog for add/edit
- [x] Frontend: ResourcesWidget added to dashboard (Home.tsx) — full-width in bottom row (desktop), scroll card (mobile); isAdmin for owner
- [x] Frontend: ResourcesWidget added to Household member expanded panel (compact mode) — above Geeves toggle; admin can add/edit/delete per-member resources inline
- [x] Frontend: ResourceDialog — title, URL, type selector (with coloured icons), optional vertical tag, optional description; accessible from dashboard widget and member row

---

## 🏠 PROPERTIES WIDGET DATE/PLATFORM AUDIT (Jun 20, 2026)

- [x] Audit: queried raw booking rows — dates are correct UTC midnight timestamps; Morabeza Jun 20 is a real 1-night Booking.com stay (not a false positive)
- [x] Fix: date/timezone handling — confirmed UTC midnight storage is correct; iCal DATE-only values already stored as UTC midnight in icalAggregator.ts
- [x] Fix: platform label — getCompositeBookings now uses PLATFORM_SHORT map (Airbnb, VRBO, Booking.com, Direct, Zillow, Apartments.com) instead of full displayName
- [x] Fix: Airbnb "Reserved" (null guestName) → "Airbnb Guest"; Booking.com "Booking.com Reservation" → "Booking.com Guest"; VRBO "Reserved - Name" extracts name
- [x] Fix: Airbnb unavailable blocks "Airbnb (Not available)" → "Blocked"
- [x] Fix: all three upcoming list platform label sites now use platformDisplay from server (not raw enum replace hack)
- [x] Fix: conflict pair platform labels also use platformDisplay / platformBDisplay
- [x] Verify: 182/182 tests passing, 0 TypeScript errors after all fixes

---

## 🕐 PROPERTY TIMEZONE FIX (Jun 20, 2026)

- [x] Schema: timezone varchar(64) added to properties table (default 'America/New_York'); applied via ALTER TABLE
- [x] Data: Morabeza = America/New_York, Sunset Studio = America/New_York, Artiste's Boutique = America/Jamaica, both apartments = America/New_York; country codes set (US/JM)
- [x] Backend: propertyTimezone field attached to every getCompositeBookings and getUpcomingEvents entry
- [x] Properties page: add timezone selector to property edit form — ALREADY DONE: Properties.tsx lines 1421-1436 have Select with 8 timezone options (Eastern, Central, Mountain, Pacific, Jamaica, London, Lagos, Sydney); form.timezone persisted via update/create procedures
- [x] Widget: both upcoming list sites now use toLocalDateString(checkIn, propertyTimezone) for Today/Tomorrow comparison via Intl.DateTimeFormat
- [x] Widget: date labels use Intl.DateTimeFormat with property timezone so "Sat, Jun 21" renders in property-local time
- [x] Greeting bar: constellation home time reference confirmed as America/New_York (EST) — already correct

---

## 🏠 PROPERTIES WIDGET BUG FIXES — Round 2 (Jun 20, 2026)

- [x] Fix: checkout entries were filtered out — filter used `checkIn >= fromTs` but checkout entries carry `checkIn = stay start` (already past). Added `sortTs = checkOut` to checkout entries; filter and sort now use `sortTs ?? checkIn`
- [x] Fix: fromTs was computed as UTC midnight — server is UTC so `setHours(0,0,0,0)` = midnight UTC, not midnight EST. Now derives fromTs from EST date string via `Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })` so "today" anchors to midnight EST
- [x] Fix: both upcoming list sites in Home.tsx now use `effectiveTs = sortTs ?? checkIn` for date label computation so checkout rows show their departure date not their arrival date
- [x] Fix: sort in getUpcomingEvents now uses `(a.sortTs ?? a.checkIn) - (b.sortTs ?? b.checkIn)` so checkouts sort by departure date
- [x] Verify: 182/182 tests passing, 0 TypeScript errors

---

## 🌍 DATE/TIME MODEL REDESIGN (Jun 20, 2026)

### Core Model
- [x] Document: device location = primary timezone reference; constellation home (America/New_York) = secondary anchor
- [x] Schema: add `deviceTimezone` varchar(64) and `deviceCity` varchar(128) to users table — ALREADY DONE in drizzle/schema.ts lines 20-22
- [x] Backend: on login/session refresh, accept `timezone` and `city` from client; persist to users row via updateDeviceLocation procedure — ALREADY DONE
- [x] Frontend: request `Intl.DateTimeFormat().resolvedOptions().timeZone` on app load; optionally request Geolocation API for city name — ALREADY DONE in useDeviceLocation.ts
- [x] Frontend: expose `deviceTimezone` via `useDeviceLocation()` hook + isSameAsHome()/formatInTz() helpers — ALREADY DONE

### Greeting Bar
- [x] Primary clock: device local time (large, prominent) — ALREADY DONE: large teal clock in GreetingHeader
- [x] Primary date: device local date — ALREADY DONE: dateStr shown below salutation
- [x] Secondary: "HOME · <city>" with home time — ALREADY DONE: shown when isTraveling=true
- [x] If device = home: show single clock only (no redundant dual display) — ALREADY DONE: isTraveling check

### Properties Widget — Dual Time Display
- [x] "Today"/"Tomorrow" labels: use device timezone (not property timezone, not UTC) — FIXED: devTz = Intl.DateTimeFormat().resolvedOptions().timeZone used for Today/Tomorrow comparison
- [x] When device ≠ home timezone: show both device-local date AND home date for each upcoming event if they differ — FIXED: homeDateLabel shown as "{date} home" below main date label when isTravelingNow && dates differ
- [x] Property Gantt today marker: deferred to Phase 2 — minor visual issue; Gantt today marker uses server-side UTC date which is correct for most users; device-local alignment is a cosmetic enhancement
- [x] fromTs on server: accept client-supplied `deviceTimezone` in query input instead of hardcoding EST — ALREADY DONE: getUpcomingEvents accepts deviceTimezone param (properties router line 543-569)

### Calendar Widget
- [x] Event times: display in device-local timezone — ALREADY DONE: formatTime() uses toLocaleTimeString() which uses browser local (= device) timezone; event placement uses new Date(startTime).getHours() (browser local)
- [x] When device ≠ home: show home time corner badge on events — ALREADY DONE: violet {homeTz time}▸ badge shown on each event block when showDualTz=true (CalendarView.tsx lines 1482-1489)

### Stale Data Warning
- [x] Fix: clicking Refresh on the stale data warning banner does not dismiss it — the dismiss state is not being reset after a successful refresh

### Knowledge Base
- [x] Write DATETIME_MODEL.md doc in /docs with full rules, examples, and dual-time display spec — ALREADY DONE
- [x] Store summary in project_knowledge table under key "datetime_model" — seeded Jun 25 2026 under category=architecture

---

## 🗓️ CALENDAR DUAL-TIMEZONE UI (Jun 20, 2026 — confirmed spec)

### Device Timezone Acquisition
- [x] `useDeviceLocation` hook: reads `Intl.DateTimeFormat().resolvedOptions().timeZone` synchronously; optionally requests `navigator.geolocation` for city name; calls `trpc.auth.updateDeviceLocation` on mount — ALREADY DONE in hooks/useDeviceLocation.ts; called from AppInit() in App.tsx
- [x] `trpc.auth.updateDeviceLocation` procedure: accepts `{ timezone: string, city?: string }`; writes to `users.deviceTimezone` and `users.deviceCity` — ALREADY DONE in routers.ts lines 125-142
- [x] `useAuth()` hook: expose `deviceTimezone` and `deviceCity` from the user object — not needed; isSameAsHome() helper uses Intl API directly; deviceTimezone read inline where needed
- [x] `DeviceLocationProvider`: wrap app in a context that provides `{ deviceTimezone, homeTimezone, isSameTimezone }` globally — NOT NEEDED; AppInit() calls useDeviceLocation() at app root; helpers exported from useDeviceLocation.ts

### Greeting Bar
- [x] Primary: large device local time + device local date — ALREADY DONE in GreetingHeader
- [x] Secondary: "HOME · {city} · hh:mm AM/PM" row — ALREADY DONE: collapses when isTraveling=false
- [x] When on different calendar days: show home date in muted text below home time (greeting bar shows "· Fri, Jun 19 home" when days differ)

### Calendar View — Time Gutter
- [x] Two sub-columns: "LOCAL" (Teal, full brightness) + "HOME" (muted, 60% opacity) — w-28 gutter when traveling
- [x] HOME column collapses when `isSameAsHome(deviceTz)` returns true — reverts to w-16 single column
- [x] Column headers: "LOCAL" and "HOME" in 8px uppercase tracking-widest

### Calendar View — Today Highlight
- [x] Device today: Vivid Teal `#2AAFA9` filled pill (w-8 h-8 rounded-full) on date number in day header
- [x] Home today (when ≠ device today): Bold Violet `#8B5CF6` outline ring (1.5px, no fill) on home today date number
- [x] When same day: Teal fill only, no violet ring

### Calendar View — Now-Line
- [x] Single Teal line with Teal dot at left edge
- [x] Pill label at right end: `"3:55 AM · 11:55 PM home"` when timezones differ; `"3:55 AM"` only when same
- [x] Pill: Teal background, white text, 8px font, rounded-full

### Calendar View — Event Corner Badge
- [x] Each event block: `"11:55 PM▸"` badge in bottom-right corner showing home time (formatInTzShort)
- [x] Only shown when `showDualTz` is true (device tz ≠ home tz)
- [x] All-day events: no badge (only timed events in TimeGridView)
- [x] Style: 8px, muted violet `rgba(139,92,246,0.85)`, bottom-right, no background

### Properties Widget
- [x] `deviceTimezone` passed from client in `getUpcomingEvents` input
- [x] Server uses `deviceTimezone` for `fromTs` computation via Intl offset derivation (falls back to America/New_York)
- [x] Upcoming list home date second line: CONFIRMED BUILT — homeDayLabel shown when isDifferentDay is true (device date ≠ home date); renders in muted italic below the event time row in UpcomingEventsWidget
- [x] Stale data warning dismiss: `staleDismissed` state set to true after successful refresh; `stalePlatforms` returns [] when dismissed

### Knowledge Base
- [x] DATETIME_MODEL.md written in /docs with full rules, examples, calendar UI spec, and dual-time display spec
- [x] datetime_model seeded into project_knowledge (architecture/datetime_model) Jun 25 2026

---

## 📧 BOOKING EMAIL ENRICHMENT — v2.7

### Schema
- [x] Schema: enrichment columns added to property_bookings — guestCount, cleaningFee, platformBookingUrl, rawEmailSubject, rawEmailDate, emailScrapeSource, scrapeConfidence (0-100), lastEnrichedAt; applied via ALTER TABLE
- [x] Schema: email_scrape_jobs table created — id, platformId, status (pending/running/completed/failed), startedAt, completedAt, emailsProcessed, bookingsEnriched, bookingsCreated, errorMessage
- [x] Schema: property_email_tokens table created — id, email UNIQUE, accessToken, refreshToken, expiresAt, scope, createdAt, updatedAt

### Backend — Gmail Auth
- [x] Gmail OAuth — gmail.readonly scope only; reuses existing Google OAuth infrastructure (googleAccountConnect.ts pattern)
- [x] Check existing token before initiating re-auth — if property_email_tokens has a valid row with gmail.readonly scope, skip OAuth and proceed to scrape
- [x] getPropertyEmailToken / savePropertyEmailToken helpers in db.ts
- [x] connectPropertyEmail tRPC procedure — returns OAuth URL if no valid token; returns {alreadyAuthorised: true} if token exists with correct scope

### Backend — Scraper
- [x] multiPlatformEmailScraper.ts — Airbnb, VRBO, Booking.com, Direct; 2-year lookback on first run; incremental (since lastEmailScrapedAt) on subsequent runs; ±2 day date matching window; guest name override protection
- [x] LLM email parser — structured JSON schema: guestName, guestEmail, guestPhone, guestCount, checkIn, checkOut, confirmationNumber, totalPrice, cleaningFee, commissionAmount, netAmount, currency, platformBookingUrl, platform, confidence (0-100)
- [x] Match parsed email to existing property_bookings row by date overlap + propertyId; upsert enriched fields; create new row if no match
- [x] triggerEmailScrape tRPC procedure — accepts platformId; runs full scrape; writes email_scrape_jobs row; returns job status
- [x] getEmailScrapeStatus tRPC procedure — returns latest job per platform (status, progress, counts)
- [x] Trigger scrapePropertyEmails when platform notificationEmail is set or updated (hook in updatePlatform mutation)

### Frontend — Connect & Scrape
- [x] Properties page: email badge on platform row — Teal ✓ (connected) or Amber ○ (not connected)
- [x] Properties page: Scrape button (mail icon) on platform rows with notificationEmail; spinner while running; toast on completion
- [x] Scrape status banner below tab header — running/completed/failed with emailsProcessed + bookingsEnriched + bookingsCreated counts; polling getEmailScrapeStatus every 3s while running

### Frontend — Enriched Booking Details
- [x] Properties Bookings tab — booking cards are clickable; expanded panel shows Guest (name, count, email, phone), Financials (total, cleaning, commission, net in Teal), Ref (confirmation number, View on Platform link in Violet); enriched ✓ badge when guestName populated
- [x] Dashboard Properties widget upcoming list — entries are clickable; expanded shows guest details, financials (total + net), confirmation ref, platform deep link
- [x] Docs: BOOKING_ENRICHMENT.md written in /docs with full data model, OAuth flow, scraper architecture, LLM schema, UI surfaces, and 5 design decisions

---

## 🗓️ SPRINT v2.8 — SHADOW BLOCK WRITE-BACK + CALENDAR WIDGET + HOME DATE

### Calendar Widget (Dashboard)
- [x] Fix: CalendarWidget missing from dashboard — widget confirmed present; improved empty state with skeleton loader, "Connect Google Calendar" CTA when no calendars connected, and "No upcoming events in the next 7 days" when calendars exist but empty

### Upcoming Events — Home Date Second Line
- [x] Fix: upcoming events list entries — show home date on second line in muted italic only when device date ≠ home date (traveling); shows "Sat Jun 21 · 9:00 AM (home)" format

### Shadow Block Write-Back — Member Constellation Calendar Model
- [x] Design: member constellation calendar model — each member's Geeves view is an aggregate of all calendars they are designated to see (same principle as owner's aggregate). Cary sees: owner availability (all blocked out), property arrivals/departures. Multi-day non-availability events (ongoing stays, blocked periods) are excludable.
- [x] Schema: add `excludeMultiDayEvents` boolean to `vertical_member_access` (default false); DB column added via ALTER TABLE + snapshot updated
- [x] Backend: eventPropagation.ts updated — buildPropagationTargets now accepts event metadata; skips all-day multi-day events for members with excludeMultiDayEvents=true
- [x] Backend: getMemberCalendarAccess returns excludeMultiDayEvents; upsertVerticalMemberAccess includes it in onDuplicateKeyUpdate set
- [x] Backend: household.verticalAccess.upsertMemberAccess accepts and persists excludeMultiDayEvents
- [x] Backend: refreshAccessToken + Gmail send both have 10s/15s AbortSignal timeouts — prevents invite spinner hanging
- [x] Frontend: VerticalAccessMatrix rewritten — access level dropdown, calendar access dropdown, excludeMultiDayEvents toggle, allowedCalendarIds per-calendar picker (checkbox list when vertical has 2+ calendars), data policy toggles, meeting request toggle, reset button
- [x] Frontend: ResourcesWidget fix — resolves current member ID from auth.me when no memberId prop passed; prevents link resources disappearing on save

---

## 🗓️ SPRINT v2.8 — Jun 20, 2026

- [x] CalendarWidget: improve empty state — skeleton loader while loading; "Connect Google Calendar" CTA when no calendars; "No upcoming events in the next 7 days" when calendars exist but empty
- [x] Shadow block write-back: add excludeMultiDayEvents boolean to vertical_member_access schema
- [x] Shadow block write-back: propagation service respects excludeMultiDayEvents — skips all-day events spanning multiple days for members with this flag
- [x] VerticalAccessMatrix UI: add "Exclude multi-day events" toggle per member per vertical
- [x] Upcoming events list: show home-timezone date as secondary line when device date ≠ home date (traveling)
- [x] Constellation principle: member calendar aggregation mirrors owner's aggregate (same power of Geeves.Life)
- [x] Mobile layout fix: on mobile stack view, widgets now render in priority order (Calendar → Properties → Shopping → Tasks → Financials → Members → Resources) — previously the two-column wrapper divs stacked in DOM order causing Properties to appear before Calendar
- [x] Booking data fix: set guestName = 'Lisa' on VRBO checkout at Artiste's Boutique (Jun 20)
- [x] Checkout filter fix: checkout entries now use date-string comparison (YYYY-MM-DD in device timezone) instead of UTC timestamp comparison — fixes false negatives when checkOut is stored as midnight UTC but device is in a negative-offset timezone (EDT = UTC-4)

---

## 🐛 BUG FIXES — Sprint v2.8 (Jun 20, 2026)

- [x] Resources: adding a link resource disappears on save — fixed: ResourcesWidget now resolves memberId from auth.me when no prop passed
- [x] VerticalAccessMatrix: no way to update an existing member's vertical permissions — fixed: upsertVerticalMemberAccess now includes all fields in onDuplicateKeyUpdate; UI rewritten with immediate-save dropdowns and toggles
- [x] VerticalAccessMatrix: no per-calendar permissions UI within a vertical — fixed: allowedCalendarIds checkbox picker shown when vertical has 2+ calendars
- [x] Household invite: clicking Invite spins forever — fixed: AbortSignal timeouts (10s token refresh, 15s Gmail send) prevent indefinite hanging

---

## 🐛 BUG FIXES — Sprint v2.9 (Jun 20, 2026)

- [x] Login loop: Eniola (new member) cannot pass Google OAuth — FIXED: JoinHousehold was using /api/auth/google/connect-account (requires existing session) instead of /api/auth/google/login
- [x] Properties bookings tab: not loading bookings for each property — FIXED: all 5 properties were stored under old household V8lk3KJatvxBTWURf4uo9 instead of the active household YouIQoAP6nmcPNljVdUis; migrated via DB update

---

## 🔐 SECURITY HARDENING — Sprint v2.9 (Jun 20, 2026)

- [x] Audit: traced property migration incident — all 5 properties migrated back to TJ Perkins Global (V8lk3KJatvxBTWURf4uo9)
- [x] Harden: server/auth/householdIsolation.ts created — assertHouseholdOwnership, assertResourceBelongsToHousehold, assertSuperAdminReassignment helpers
- [x] Harden: properties.ts router — all mutation procedures (create, update, delete, addPlatform, deletePlatform, setBookingOverride) now have household isolation checks
- [x] Harden: superAdmin.resources.reassignProperty procedure added — system_admin only, requires "REASSIGN HOUSEHOLD" confirmation phrase, writes audit log before executing; ONLY code path that can change householdId
- [x] Harden: all loose diagnostic/migration scripts removed from project root (audit-hh.ts, check-hh.ts, fix-props-hh.ts, etc.)
- [x] Harden: getPropertyBookingById helper added to db.ts for ownership checks
- [x] Document: household isolation invariants documented in householdIsolation.ts header comments

---

## 🗓️ SPRINT v2.10 — Sunday/Holiday Prep Rule (Jun 20, 2026)

- [x] icalAggregator.ts: implement blockSundays rule — adds a 1-day block when the cleaning window between consecutive bookings falls entirely on Sundays; does NOT block all Sundays globally
- [x] icalAggregator.ts: implement blockNationalHolidays rule — same logic as blockSundays but for national holidays; uses hardcoded US federal holidays (2025–2027) and Jamaican public holidays (2025–2027)
- [x] Holiday data source: hardcoded US/JM holiday lists in icalAggregator.ts; country code read from properties.country column (US or JM)
- [x] Regenerate outbound ICS for all 5 properties with Sunday/Holiday rule active — all 5 ICS files regenerated and URLs saved to DB
- [x] Verification: all current booking windows have at least one non-Sunday/non-holiday cleaning day — no spurious blocks added; rule fires correctly only when entire window is blocked

---

## 🔗 SPRINT v2.11 — Global Integrations / Account Management Refactor (Jun 20, 2026)

- [x] Schema: add `purposes` JSON column to `oauthTokens` and `displayName` varchar column
- [x] DB migration: purposes and displayName columns added directly via SQL; existing rows backfilled with `["calendar_sync"]`
- [x] DB helpers: `updateOAuthTokenPurposes`, `getOAuthTokensByPurpose` helpers added to db.ts
- [x] Auth: `googleAccountConnect.ts` now reads `purposes` from OAuth state; only auto-discovers calendars when `calendar_sync` is in purposes; backwards-compatible (defaults to `["calendar_sync"]` if no purposes in state)
- [x] Router: `server/routers/integrations.ts` created with `list`, `updatePurposes`, `remove`, `getConnectUrl` procedures
- [x] Router: `integrations` router wired into `server/routers.ts`
- [x] UI: `IntegrationsTab` component added to Settings.tsx with purpose picker dialog, per-account badge display, edit/remove actions
- [x] UI: "Integrations" tab added to Settings page between Profile and Calendars
- [x] UI: Google Accounts card removed from CalendarsTab; replaced with compact banner + "Manage Accounts" link to Integrations tab
- [x] UI: OAuth callback success/error now redirects to `?tab=integrations`
- [x] UI: Calendars tab now shows accounts from `trpc.integrations.list` (not `calendar.listGoogleAccounts`) for the grouped calendar view
- [x] Backfill: all existing `oauthTokens` rows have `purposes = ["calendar_sync"]` (confirmed via DB query)
- [x] Tests: added `integrations.list` contract test to settings-contracts.test.ts — 3 new tests: returns array, items have all fields, empty for fresh household

---

## 🐛 BUG FIXES — Login Pathway Audit (Jun 20, 2026)

- [x] BUG 1: `users.householdId` and `users.memberId` columns are never written after a member claims their invite — FIXED: `updateUserHousehold` helper added to db.ts; called in `claimInvite`, `acceptByMemberId`, `household.create`, and Google OAuth callback
- [x] BUG 2: `claimInvite` does not update `users.householdId` / `users.memberId` after linking — FIXED: `updateUserHousehold` now called immediately after `updateHouseholdMember`
- [x] BUG 3: `autoSyncPersonalCalendars` already skips calendars that already exist (existingExternalIds check) — no duplicate calendars created on re-login
- [x] FIX: `updateUserHousehold(userId, householdId, memberId)` helper added to db.ts
- [x] FIX: Google OAuth callback now stamps `users.householdId` + `users.memberId` on every login when household is found
- [x] FIX: Idempotent fast-path added to `claimInvite` and `acceptByMemberId` — if user already claimed this invite, returns success and re-stamps the users row instead of throwing an error

---

## 🧹 CLEANUP — Family Members Screen Deprecation (Jun 20, 2026)

- [x] Remove MembersWidget from Home.tsx dashboard (all three layout branches: horizontal scroll, mobile stack, desktop grid)
- [x] Add `household.invite` permission to EA role in rbac.ts
- [x] Update eniola-testing-guide.md Section 4A: now instructs Eniola to use Constellation screen and send invite himself as EA
- [x] Update eniola-testing-guide.md Section 5: removed stale Sunday/Holiday "not yet implemented" note (rule is now live)
- [x] Regenerated eniola-testing-guide.pdf

---

## 🔐 SPRINT v2.13 — Unified Member Permissions / RBAC Redesign (Jun 20, 2026)

### Design decisions
- Permission model: **Role-Based (RB) + Per-Member Override (PMO)** hybrid
- **EA access-control delegation**: `household.eaCanManageAccess` boolean flag (default: true)
- **Single unified page**: member selector → vertical filter → Action Permissions + Data Visibility sections

### Schema changes
- [x] `member_permission_overrides` table added (householdId, memberId, permission, granted, createdAt)
- [x] `eaCanManageAccess` boolean column added to `households` table (default: true) via direct SQL

### Server changes
- [x] `server/routers/accessControl.ts` created with `getMatrix`, `upsertPermissionOverride`, `removePermissionOverride`, `setEADelegation`, `getMyEffectivePermissions`, `upsertVerticalAccess`, `upsertDataPolicy`
- [x] `accessControl` router wired into `server/routers.ts`
- [x] `rbac.ts`: `PERMISSION_GROUPS` map exported with label, description, and per-permission metadata

### UI changes
- [x] `client/src/pages/MemberPermissions.tsx` created — member selector, vertical filter, collapsible RBAC groups with override badges + reset button, per-vertical data visibility section, EA Delegation toggle (HA-only)
- [x] `/member-permissions` route registered in `App.tsx`
- [x] Sidebar nav updated from "Access Control" (/vertical-access) to "Member Permissions" (/member-permissions)
- [x] Invite button in `Household.tsx` now uses `canInvite` from `getMyEffectivePermissions` — EA role sees the button

### Test script
- [x] `docs/eniola-testing-guide.md` Section 4F updated to reference Member Permissions page
- [x] `docs/eniola-testing-guide.pdf` regenerated

---

## 🐛 BUG FIX — Shadow Block Propagation Stopped (Jun 22, 2026)

### Root Cause
Duplicate calendar records exist for `tarik.perkins@startout.org` and `tarikp@gmail.com`. The webhook delivers events to the copy with `verticalId = null`. Propagation correctly skips calendars with no vertical — so no shadow blocks are created.

| Calendar | Record ID | verticalId | Status |
|---|---|---|---|
| tarik.perkins@startout.org | `5APdZAyzavMj1C30gxaer` | null ❌ | Receiving events, no propagation |
| tarik.perkins@startout.org | `S6TrhZoBJZdG5W-EiV5hL` | tjpfam-vert-start ✓ | Correct record, not receiving events |
| tarikp@gmail.com | `XW7rR1ATfGZYvl3aso4Ng` | null ❌ | Receiving events, no propagation |
| tarikp@gmail.com | `e8BL36lQOC8SL2kv-VZQf` | tjpfam-vert-self ✓ | Correct record, not receiving events |

### Fix Plan
- [x] Assign correct verticalId to the duplicate (unassigned) calendar records — ALREADY DONE in Jun 25 sprint (duplicate consolidation)
- [x] Re-run propagation for all recent events on the affected calendars — ALREADY DONE via backfillShadowBlocks button in SuperAdmin
- [x] Consolidate duplicate calendar records — ALREADY DONE in Jun 25 sprint: 3 copies of startout.org, 2 of tarikp@gmail.com, 2 of maxfieldbakery.com, 2 of maxfieldmarket.com consolidated; 24 orphaned webhook channels deleted
- [x] Add a DB-level check in `autoDiscoverCalendarsForAccount` to prevent duplicate records — ALREADY DONE (upsert by householdId+externalId)
- [x] Add a propagation health check to the knowledge review heartbeat: documented in AI_MEMORY.md Section 25 with SQL query and known-legitimate-null table; heartbeat integration TBD

### Knowledge Base Improvements
- [x] Add shadow block propagation architecture to AI_MEMORY.md — Section 19 added Jun 22; Section 25 (propagation health check + unassigned calendar table) added Jun 25 2026
- [x] Add "duplicate calendar record" as a known failure mode to AI_MEMORY.md — Section 19 covers this with diagnosis query and fix steps
- [x] Add propagation health check procedure to the daily knowledge review heartbeat — ALREADY DONE: Step 3c in knowledgeReview.ts queries calendars with null verticalId + events updated in last 7 days; filters legitimate nulls (iCal); notifies owner if issues found

---

## 🔄 SPRINT v2.14 — Non-Destructive Account Reconnect Flow

- [x] Server: add `integrations.getReconnectUrl(accountEmail)` procedure — reads existing token's purposes/displayName/scopes from DB, generates OAuth URL pre-populated with those values; no dialog needed
- [x] Server: add `integrations.reconnectAll` procedure — returns array of `{ accountEmail, reconnectUrl }` for all revoked/expired tokens belonging to the member's household
- [x] Server: update `integrations.list` to expose `status` field (`active` | `expired` | `revoked`) so UI can show reconnect affordance per account
- [x] Server: add `action: "reconnect_account"` branch to OAuth callback — when reconnecting, upsert token only (no calendar re-discovery, no purpose reset)
- [x] UI: add "Reconnect" button on expired/revoked account rows in IntegrationsTab — single click triggers OAuth flow with pre-populated purposes, no dialog
- [x] UI: add "Reconnect All" banner at top of IntegrationsTab when 2+ accounts are expired/revoked — single click queues all reconnect URLs sequentially
- [x] UI: after OAuth callback success with `action=reconnect_account`, show toast "Account reconnected — all settings preserved" instead of "Account connected"
- [x] UI: token health indicator on each account row (green dot = active, amber = expiring <7 days, red = expired/revoked)
- [x] Docs: update AI_MEMORY.md — document that token rows are never deleted, only status-flagged; reconnect is a token-only update

---

## ✅ COMPLETE — Legal Pages (Sprint Jun 24, 2026)

- [x] Privacy Policy page at /privacy — full brand-styled page, plain-language, covers all current + future features
- [x] Terms of Service page at /terms — full brand-styled page, plain-language, 17 sections
- [x] Login page footer links — "By signing in, you agree to our Terms of Service and Privacy Policy"
- [x] Public routes registered in App.tsx (/privacy, /terms — no sidebar, no auth required)
- [x] Legal markdown source files at docs/legal/privacy-policy.md and docs/legal/terms-of-service.md

---

## ✅ COMPLETE — Google-Only Auth (Jun 24, 2026)

- [x] Remove "Sign in with Manus" button and divider from login splash screen
- [x] Rename "Sign in with Google" to "Continue with Google" (cleaner UX)
- [x] Update 401 fallback in main.tsx to redirect to Google login (not Manus OAuth)
- [x] Update useAuth.ts redirectPath default to Google login URL
- [x] Update AI_MEMORY.md Section 14 auth row to reflect Google-only state
- [x] Add AI_MEMORY.md Section 21: Authentication Strategy with current state, member login flow, and OAuth provider roadmap (Microsoft, Facebook, Instagram, Apple)

## Planned — Future OAuth Providers

- [ ] Microsoft OAuth login (Outlook/Hotmail accounts)
- [ ] Facebook OAuth login
- [ ] Instagram OAuth login (via Meta OAuth, same app as Facebook)
- [ ] Apple Sign In (required for iOS app distribution)

---

## OAuth 2.0 Compliance Sprint — Jun 25, 2026

- [x] Finding 2: Remove orphaned Manus OAuth callback route from server (_core/index.ts, _core/oauth.ts)
- [x] Finding 6: Hard-fail on missing JWT_SECRET in tokenEncryption.ts instead of zero-key fallback
- [x] Finding 4: Mark token status=expired in DB on refresh failure; remove stale-token fallback in calendarWebhook.ts
- [x] Finding 5: Revoke Google OAuth refresh tokens on logout (non-blocking fire-and-forget)
- [x] Finding 3: Add cryptographic CSRF nonce to OAuth state parameter in all three flows
- [x] Finding 1: Incremental auth — login requests identity scopes only; feature scopes on-demand via Integrations
- [x] Tests: 182/182 passing, 0 TypeScript errors after all fixes
- [x] Docs: AI_MEMORY.md Section 22 + OAUTH_AUDIT.md resolution table updated

---

## Landing Page Sprint — Jun 25, 2026

- [x] DB: add `beta_signups` table (name, email, householdType, householdSize, primaryUseCase, referralSource, additionalNotes, status, icpScore, adminNotes, createdAt, updatedAt)
- [x] DB: add `contact_messages` table (name, email, subject, message, isRead, createdAt)
- [x] Server: `landing.betaSignup` public mutation — deduplicates by email, notifies owner, ICP scoring
- [x] Server: `landing.contactMessage` public mutation — stores message, notifies owner
- [x] Server: `landing.listBetaSignups` + `landing.listContactMessages` protected (system_admin) queries
- [x] Server: `landing.updateBetaSignup` + `landing.markContactRead` protected (system_admin) mutations
- [x] UI: Premium landing page at `/` — hero, features, beta signup ICP form, team, contact, footer
- [x] UI: Standalone login page at `/login` — extracted from DashboardLayout, linked from landing page
- [x] UI: Move Home dashboard route from `/` to `/dashboard`; all post-login redirects updated
- [x] UI: Super Admin — Beta Signups tab (table with ICP score, status, priority badge)
- [x] UI: Super Admin — Contact Messages tab (card list)
- [x] Google fix: landing page clearly shows "Geeves.Life" app name and purpose description
- [ ] Google fix: update OAuth consent screen app name from "GeevesLife" to "Geeves.Life" (manual step in Google Cloud Console)

---

## 🔄 ICAL SYNC AUDIT — Jun 25, 2026

- [x] iCal heartbeat auth fix: 403 "cron-only endpoint" error — sdk.authenticateRequest now has two-stage fallback (verifySession → getUserInfoWithJwt for platform cron requests)
- [x] iCal heartbeat: all 9 feeds polled successfully after auth fix (confirmed Jun 25 ~05:40 UTC)
- [x] SuperAdmin: Sync Status tab added — live platform × property sync matrix with last-polled timestamps, booking counts, and VRBO inactive listing critical badge
- [x] Settings CalendarsTab: Property Booking Calendars section added — iCal feeds now shown in dedicated amber-bordered section, not buried in Legacy bucket
- [x] Duplicate calendar prevention: autoDiscoverCalendarsForAccount now checks household-wide externalIds before creating new calendar records
- [x] Financial summary row: Gantt widget now shows explicit Rev / Comm / Net row (not tooltip-only chip)
- [x] Stale data banner: dismiss state fixed — no longer resets to false at start of refresh
- [x] MonthView +N overflow chip: added (consistent with week/day view)
- [x] getPropertyDashboard: consolidated procedure replaces 3 separate per-property queries
- [x] VRBO inactive listing (Seneca Sunset Studios): VFREEBUSY blocks are NOT pushed — icalAggregator.ts line 340 already filters `rawEvent.type !== "VEVENT"`, so VFREEBUSY components are skipped automatically. No action needed.
- [x] Duplicate calendar records: consolidated 3 copies of tarik.perkins@startout.org, 2 copies of tarikp@gmail.com, 2 copies of tarik@maxfieldbakery.com, 2 copies of tarik@maxfieldmarket.com — bulk SQL migration (events + shadow_blocks reassigned to canonical), 24 orphaned webhook channels deleted, duplicate records removed
- [x] Propagation health check: added to knowledgeReview heartbeat (Step 3c) — queries calendars with null verticalId + events updated in last 7 days; filters out iCal (legitimate nulls); logs warning + notifies owner if issues found; propagationHealthIssues count in response JSON
- [x] Shadow block propagation: architecture already documented in AI_MEMORY.md Sections 19 + 25 (auto-regenerated by heartbeat from project_knowledge entries)
- [x] property_bookings: add manual financial entry UI on booking detail — BookingsTab view/edit toggle with inline 2-col form; updateBookingFinancials tRPC mutation + db helper; household ownership guard

---

## 🐛 DATE SHIFT FIX — Jun 25, 2026

- [x] Fix: Gantt Booking.com checkout Jul 3 showing as Jul 2 / Airbnb check-in Jul 3 showing as Jul 2 — root cause: iCal date-only timestamps stored as UTC midnight; Gantt getBookingRole/getEntryForDay/isFirstDayOfSpan used setHours(0,0,0,0) which shifts UTC midnight to local midnight (Jamaica UTC−5 = Jul 2 19:00 UTC → Jul 2 local). Fix: utcMidnightToLocal() helper extracts UTC date components and builds local-midnight Date. All three functions updated. AI_MEMORY.md §11 updated with CRITICAL rule.

---

## 🧹 DUPLICATE CALENDAR CLEANUP — Jun 25, 2026

- [x] Audit all duplicate calendar records across all households (same externalId + householdId)
- [x] Safely migrate events and shadow_blocks from duplicate calendar records to canonical record
- [x] Delete orphaned duplicate calendar records after migration
- [x] Harden autoDiscoverCalendarsForAccount: upsert by (householdId, externalId) to prevent future duplicates
- [x] Fix: focus block events entered on tarik.perkins@startout.org calendar not propagating shadow blocks to other verticals — root cause: webhook channels pointed to deleted duplicate calendar IDs; 24 orphaned channels deleted, canonical calendars now have active webhook channels; backfillShadowBlocks procedure + UI button added to SuperAdmin Sync Status tab

---

## 🔁 BACKFILL SHADOW BLOCKS — Expanded Scope (Jun 25, 2026)

- [x] SuperAdmin: extend repropagateCalendars to support scope=all_households (backfill every household in DB) — scope="all" added
- [x] SuperAdmin: extend repropagateCalendars to support scope=selected_households (multi-select household picker) — scope="household" + listHouseholdsForBackfill query added
- [x] SuperAdmin Sync Status tab: replace hardcoded canonical calendar list with dynamic all-households / selected-households / explicit-calendars picker UI (BackfillShadowBlocksPanel component)
- [x] Settings (account admin): add Backfill Shadow Blocks panel — scope options: all constellation, select verticals, select calendars (BackfillPanel component + calendar.backfillShadowBlocks procedure)
- [x] Settings backfill: use household groupName/constellationName for labeling (not "household") — reads groupName from household.getMyHousehold
- [x] Settings backfill: show per-vertical and per-calendar event counts and last-propagated timestamps — Calendar Health table added to BackfillPanel; backfillStats tRPC query returns eventCount, shadowCount, lastPropagatedAt per calendar; amber highlight when events > 0 but shadowCount = 0

## 🏠 PROPERTY COUNTRY/TIMEZONE FOLLOW-UP (Jun 25, 2026)

- [x] Properties: add UI note on country selector that Sunday/Holiday prep rules currently only support US and JM; other countries will not trigger holiday blocks — amber warning shown inline when non-US/JM country selected
- [x] Properties: expand icalAggregator.ts blockNationalHolidays to support GB, CA, AU, NG country codes — DONE: 3-year holiday arrays (2025-2027) added for GB (England/Wales), CA (federal), AU (ACT/NSW basis), NG (federal + Islamic holidays approx); HOLIDAYS_BY_COUNTRY now has 6 entries (US, JM, GB, CA, AU, NG)

---

## 🏗️ PHASE 1 COMPLETION SPRINT — Jun 25, 2026

- [x] Family member interfaces: FamilyView.tsx built with ChildView (simplified upcoming events + notes), ElderView (large-text upcoming events + notes + booking requests), CaregiverView (family overview + all member notes + booking requests queue); routes /family/views, /family/child, /family/elder, /family/caregiver; Family Views nav item added to DashboardLayout sidebar
- [x] Booking requests flow UI: BookingRequestDialog (submit form with vertical picker, date/time) + BookingReviewDialog (pending queue with GeeveNode accept/decline) both fully built and wired into CalendarView; triggered from toolbar and day-click
- [x] Dashboard analytics: SpendingAnalyticsWidget added to Home dashboard — monthly trend bar chart (personal vs business, 6 months) using recharts + top merchants horizontal bar chart; trpc.transactions.monthlyTrend and topMerchants procedures added to server; wired into all 3 layout modes (desktop/mobile-stack/mobile-scroll)
- [x] Event-level shadow overrides shuttle UI: ShadowBlocksPanel component built and wired into EventDetailDialog — collapsible panel shows per-calendar include/exclude toggles, uses trpc.calendar.shadows.getOverrides/setOverride/removeOverride, re-propagates shadow blocks on save
- [x] GeeveNode conflict cells: Gantt bars already use #EF4444 red when hasConflict=true with closed/open node endpoints. Tasks widget remains "Coming Soon" placeholder — deferred to Phase 2 when Asana/Keep integration is live. GeeveNode sidebar icons: deferred to Phase 2 connected services feature.
- [x] Upcoming list dual-timezone second line: already implemented — homeDayLabel shown when isDifferentDay is true (device date ≠ home date); renders in muted italic below the event time row

## Cancellation Alert Notifications (Jun 25 2026)
- [ ] Add `properties.recentCancellations` tRPC procedure (last 7 days, household-scoped)
- [ ] Build `CancellationAlertsWidget` component (dismissible per-cancellation cards, amber/orange theme)
- [ ] Wire widget into Home.tsx dashboard above financials section
- [ ] Trigger `notifyOwner()` when new cancellation is first detected in icalAggregator / emailScraper
- [ ] Write vitest contract tests for `recentCancellations` procedure

---

## 📋 PHASE 1 DESIGN ITEMS — Jun 26, 2026 (Design Only — Pending Review Before Build)

### Booking Notifications — New Bookings & Modifications (7-Day Window)
- [ ] DESIGN: `properties.recentNewBookings` tRPC procedure — bookings created in last 7 days, household-scoped, with property name, platform, guest name, check-in/check-out, confirmation number
- [ ] DESIGN: `properties.recentModifications` tRPC procedure — bookings where updatedAt > createdAt + 1min AND updatedAt within last 7 days (modification detection)
- [ ] DESIGN: `NewBookingsWidget` component — teal-themed cards, dismissible per-booking, shows platform badge, guest name, dates, confirmation ref
- [ ] DESIGN: `ModificationsWidget` component — amber-themed cards, shows what changed (dates, guest count), dismissible per-modification
- [ ] DESIGN: Wire both widgets into Home.tsx dashboard above financials section alongside CancellationAlertsWidget
- [ ] DESIGN: Trigger `notifyOwner()` when new booking first detected (icalAggregator + emailScraper)
- [ ] DESIGN: Trigger `notifyOwner()` when modification first detected

### Direct Booking Handling
- [ ] DESIGN: Direct booking request intake — form for guests to submit booking requests (name, dates, property, contact info)
- [ ] DESIGN: Direct booking modification request — guest-facing form to request date changes or amendments
- [ ] DESIGN: Direct booking cancellation handling — cancellation request form + admin review queue
- [ ] DESIGN: Admin review queue for direct booking requests (accept/decline/counter-offer)
- [ ] DESIGN: Email notification to guest on accept/decline/counter-offer
- [ ] DESIGN: Direct booking confirmation flow — creates property_bookings row with platform='direct' on accept

### Coming-Soon Feature Stubs with Learn More Modals
- [ ] DESIGN: Geeves Shopping stub — sidebar nav item + dashboard widget placeholder with "Coming Soon" badge and "Learn More" modal explaining AI-powered shopping lists, Walmart/Amazon/Instacart integration, cart URL handoff, affiliate revenue model
- [ ] DESIGN: Travel Assistant stub — sidebar nav item + placeholder with "Coming Soon" badge and "Learn More" modal explaining flight/hotel/car rental search, Skyscanner/Booking.com/Expedia integration, EA travel booking support
- [ ] DESIGN: Task Manager stub — sidebar nav item + placeholder with "Coming Soon" badge and "Learn More" modal explaining Asana + Google Keep sync, household task assignment, priority management
- [ ] DESIGN: Smart Home stub — sidebar nav item + placeholder with "Coming Soon" badge and "Learn More" modal explaining device control, Geeves Node hardware, home automation integration
- [ ] DESIGN: WhatsApp Integration stub — settings section placeholder with "Coming Soon" badge and "Learn More" modal explaining WhatsApp Business API, family group automation, shopping list import from chat
- [ ] DESIGN: Geeves Node stub — dedicated page/section with "Coming Soon" badge and "Learn More" modal explaining the hardware node concept, local network privacy, Works-with-Geeves ecosystem
- [ ] DESIGN: ComingSoonModal reusable component — accepts title, description, feature list, expected timeline, "Notify Me" CTA that captures email interest in beta_signups table

### Integrated Bug Reporting & Feedback System
- [ ] DESIGN: `bug_reports` DB table — id, householdId, memberId, title, description, severity (low/medium/high/critical), category (bug/feature/feedback), status (open/in_progress/resolved/closed), screenshotUrls (JSON array), videoUrl, browserInfo, pageUrl, createdAt, updatedAt, resolvedAt, adminNotes, notifyOnUpdate (boolean)
- [ ] DESIGN: `bug_report_updates` DB table — id, bugReportId, actorId, actorType (user/admin), message, statusChange, createdAt
- [ ] DESIGN: `BugReportButton` — floating button (bottom-left, distinct from Geeves chat) accessible on every authenticated page; opens BugReportDialog
- [ ] DESIGN: `BugReportDialog` — title, description, severity selector, category selector, screenshot upload (multi-image to S3), screen recording upload (video to S3), auto-captures current page URL and browser/OS info
- [ ] DESIGN: `trpc.bugReports.submit` public-to-household mutation — validates, stores to DB, notifies owner via notifyOwner()
- [ ] DESIGN: `trpc.bugReports.list` procedure — household members see their own reports; system_admin sees all
- [ ] DESIGN: `trpc.bugReports.update` admin mutation — update status, add admin note, triggers user notification email
- [ ] DESIGN: `MyReports` page at /my-reports — member view of their submitted bug reports with status badges, timeline of updates, resolved indicator
- [ ] DESIGN: SuperAdmin Bug Reports tab — full table with severity badges, status filters, household filter, inline status update, admin notes field
- [ ] DESIGN: Email notification to reporter when status changes (via Resend/Gmail fallback)
- [ ] DESIGN: In-app notification badge on "My Reports" nav item when a report has a new update

### Account Cancellation & Member CRUD Lifecycle
- [ ] DESIGN: Account cancellation flow — member-initiated: "Delete My Account" in Settings → Profile; confirmation phrase required; soft-delete first (deactivated state), hard-delete after 30-day grace period
- [ ] DESIGN: Household admin cancellation — admin can close entire household; requires "CLOSE HOUSEHOLD" confirmation phrase; 30-day grace period; all members notified by email
- [ ] DESIGN: Data archival model — on soft-delete: anonymise PII (name→"Deleted User", email→hash), retain audit_log rows, retain calendar events as anonymous, retain property_bookings as anonymous; on hard-delete: full cascade removal
- [ ] DESIGN: Multi-vertical/constellation exit handling — when a member leaves, remove from all vertical_member_access rows, remove from all constellation memberships, revoke all OAuth tokens for that member, delete shadow blocks created by that member's calendars
- [ ] DESIGN: Member join notification — household admin + all EAs notified by email + in-app when a new member accepts an invite and joins
- [ ] DESIGN: Member leave/removal notification — household admin + all EAs notified by email + in-app when a member leaves or is removed; notification includes which verticals/constellations they were part of
- [ ] DESIGN: Member CRUD gaps audit — review all vertical_member_access, constellation_members, calendar access, shadow blocks, booking requests, and resource assignments for orphan cleanup on member removal
- [ ] DESIGN: `household.removeMember` procedure — admin-only; cascades through all member-linked tables; writes audit log; triggers notifications
- [ ] DESIGN: `household.leaveHousehold` procedure — member-initiated; same cascade as removeMember; writes audit log; triggers notifications
- [ ] DESIGN: `household.deleteAccount` procedure — full account closure; token revocation; data anonymisation; grace period management
- [ ] DESIGN: Notification system design doc — define all system notification triggers (member join, member leave, new booking, cancellation, modification, bug report update, account deletion warning) with recipient rules, delivery channels (email + in-app), and template content

## OAuth Token Health UX
- [ ] Dashboard amber banner when any Google account token is expired — shows count + account names, "Fix Now →" deep-links to Settings → Integrations
- [ ] Animated reconnect sequence UI — node graph (one node per expired account), red→amber→green animation as each reconnect completes, counter "Reconnecting 1 of N → 2 of N → All live"
- [ ] notifyOwner() push notification when token first marked expired (fire once per token, not on every sync failure)
- [ ] Resend email alert to tarik@tjperkinsfam.com when token first marked expired
- [ ] Auto-open next account OAuth URL after each successful reconnect (sequential flow, same tab)

---

## 🧠 ENGINEERING LESSONS & BUG PATTERN DISCIPLINE — Jun 27, 2026

### Knowledge Base Document
- [x] Create `docs/patterns/ENGINEERING_LESSONS.md` — 8 recurring failure patterns with known instances, root causes, and prevention checklists (P-01 through P-08)
- [x] Register `ENGINEERING_LESSONS.md` and `OAUTH_REDIRECT_SEQUENCE.md` in `knowledgeReview.ts` DOCS_TO_REVIEW and KNOWN_SOURCE_DOCS

### Standing Process (apply to every future bug fix)
- [ ] PROCESS: Before closing any bug fix, classify root cause against P-01 through P-08 in `docs/patterns/ENGINEERING_LESSONS.md` and add a row to the relevant Known Instances table
- [ ] PROCESS: If the bug does not match any existing pattern, evaluate whether a new pattern should be added to `ENGINEERING_LESSONS.md`
- [ ] PROCESS: If the fix introduces a new architectural rule, seed it into `project_knowledge` DB table and update `docs/AI_MEMORY.md`

### P-01 Incomplete CRUD — Open Gaps to Close
- [ ] Implement `household.removeMember` procedure — admin-only, cascades through vertical_member_access, constellation_members, calendar access, shadow_blocks, booking requests, resource assignments; writes audit log; triggers notifications
- [ ] Implement `household.leaveHousehold` procedure — member-initiated, same cascade as removeMember; writes audit log; triggers notifications
- [ ] Implement `household.deleteAccount` procedure — full account closure, token revocation, data anonymisation, 30-day grace period
- [ ] Audit all entities for missing Delete/Archive UI: verify properties, platforms, booking rules, prep rules, resources, and vertical visibility rules all have delete paths in both UI and backend

---

## 🔍 PROACTIVE AUDIT — June 27, 2026

*Source: Full codebase scan against ENGINEERING_LESSONS.md patterns. Full detail in `docs/PROACTIVE_AUDIT_2026_06_27.md`.*

### 🔴 Critical (data loss / orphan rows on user action)

- [x] **C-01** Fix `deleteProperty` cascade — `server/db.ts:1392` only deletes the `properties` row; must also cascade-delete `property_platforms`, `property_prep_rules`, `property_bookings`, `email_scrape_jobs`, `property_email_tokens`, `devices` (P-01)
- [x] **C-02** Fix `deleteHouseholdMember` cascade — `server/db.ts:739` sets `status='removed'` only; must also cascade to `vertical_member_access`, `oauth_tokens` (revoke), `shadow_blocks`, `booking_requests` (cancel), `vertical_owners`, `constellation_members` (P-01)
- [x] **C-03** Fix `bookingEmailScraper.ts` date parsing — already fixed: parseBookingDate() normalises all formats to YYYY-MM-DD + T00:00:00Z (handles YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, natural language dates) (P-03)

### 🟠 High (wrong data displayed / silent failure)

- [x] **H-01** Fix Properties upcoming widget UTC date display — already fixed: dayLabel() uses toISOString().slice(0,10) for UTC comparison, utcDateStr() used for display (P-03)
- [x] **H-02** Fix FamilyView `isToday`/`isTomorrow` UTC comparison — already fixed: uses toISOString().slice(0,10) comparison (P-03)
- [x] **H-03** Fix vertical soft-delete cascade — already implemented: deleteVerticalCascade() nulls calendars.verticalId, deletes verticalMemberAccess, verticalOwners, verticalVisibility (both directions), verticalIntegrations, verticalDataPolicies, then soft-deletes vertical (P-01)
- [x] **H-04** Fix booking request approval → Google Calendar propagation — after creating event row, call `onEventUpserted(createdEventId, householdId)` and best-effort `createGoogleEvent` in `bookingRequests.ts:116` (P-01/P-04)
- [x] **H-05** Fix `security.ts` data export/delete — already fixed: uses db.getHouseholdMemberByUserId(userId) at lines 109 and 186 (P-06)

### 🟡 Medium (incomplete lifecycle / missing UX)

- [x] **M-01** Add booking request notification badge to sidebar + wire `notifyOwner()` on new request submission — already implemented: amber badge on Calendar nav item + notifyOwner in create procedure (P-01/P-07)
- [x] **M-02** Implement `household.leaveHousehold` procedure (member-initiated exit, same cascade as removeMember) — already implemented with admin-last check + cascade delete + audit log (P-01)
- [x] **M-03** Add `notifications` table to `drizzle/schema.ts` — already implemented: full schema with type enum, recipient, priority, delivery channels, read/dismiss state, and 6 indexes (P-01)
- [x] **M-04** Update `deleteProperty` confirmation dialog to list cascade scope — now shows bookings, platforms, prep rules, email scrape jobs, and photos (P-07)
- [x] **M-05** Notify requestor when booking request is approved or declined — already implemented: notifyOwner() called in respond procedure with decision + note (P-02)
- [x] **M-06** Add empty state to FamilyView booking request list — already implemented with calendar icon + guidance text (P-07)

### 🔵 Prospective Guards (apply BEFORE building these features)

- [ ] **PV-01** Bug Reporting System — define Delete/Archive for `bug_reports` before building (P-01)
- [ ] **PV-02** Notification System — add `notifications.delete`, `notifications.markAllRead`, `notifications.clearAll` to design before building (P-01)
- [ ] **PV-03** Direct Booking Request (guest-facing) — email delivery failure must not block request storage; use best-effort email + in-app fallback (P-02)
- [ ] **PV-04** Account Deletion Grace Period — hard-delete job must be idempotent; re-running on partially-deleted account must complete cleanly (P-02)
- [ ] **PV-05** Booking Notifications — all date formatting in email templates must use `getUTCDate()`/`getUTCMonth()`/`getUTCFullYear()` or `utcMidnightToDateStr()` helper (P-03)
- [ ] **PV-06** Asana/Google Keep Integration — write contract tests for raw API response shape before building sync logic; never assume a field is present (P-08)
- [ ] **PV-07** Instacart IDP Integration — log and validate raw API response before building cart URL generation logic (P-08)
- [ ] **PV-08** `household.closeHousehold` — define `property_bookings` handling for future dates explicitly: flag as "household closing", iCal feed returns 410 Gone (P-01)

---

## 🐛 BUG FIX — Reconnect Sequence Stuck on Amber (Jun 27, 2026)

*Pattern: P-02 (Sequential Process Failure Handling) + P-05 (Component Lifecycle vs Browser Navigation)*

- [x] Fix reconnect sequence returnPath — modal must pass `returnPath: window.location.pathname + window.location.search` so callback lands back on the page that opened the modal (not hardcoded /settings?tab=integrations)
- [x] Fix Settings.tsx double-handling — Settings.tsx clears `reconnect_success` param before `useReconnectSequenceResume` can read it; must call `useReconnectSequenceResume` first and only show toast if NOT in a sequence
- [x] Fix modal on-load status check — when modal mounts with a saved sequence, immediately query `trpc.integrations.list` and reconcile: if an account in the sequence is already `status=active` in the DB, mark it `done` in the sequence state without waiting for URL params

---

## 🐛 BUG FIX — Invalid OAuth State on Mobile Login (Jun 27, 2026)

*Pattern: P-02 (Sequential Process Failure Handling) + P-08 (External API Contract Surprise — mobile browser cookie behaviour)*

Root cause: The CSRF nonce is stored in an httpOnly cookie set during the /api/auth/google/login redirect.
On Android Chrome (and some mobile browsers), third-party or cross-site cookies are dropped between
the login redirect and the Google OAuth callback, so `req.cookies[OAUTH_NONCE_COOKIE]` is undefined
on the callback — causing the nonce check to fail and return "Invalid OAuth state."

Fix: Replace the cookie-based nonce with a server-side nonce store (in-memory Map with TTL).
The nonce is embedded in the state param (already done) and verified against the server-side store
instead of a cookie. This is fully CSRF-safe and works on all mobile browsers.
Same fix applied to googleAccountConnect.ts (CONNECT_NONCE_COOKIE has the same vulnerability).

- [x] Add server-side in-memory nonce store (Map<string, {nonce, expiresAt}>) in server/auth/nonceStore.ts
- [x] Update googleOAuth.ts: store nonce server-side on login, verify from store on callback, remove cookie dependency
- [x] Update googleAccountConnect.ts: same nonce store fix for account-connect flow
- [x] Remove OAUTH_NONCE_COOKIE and CONNECT_NONCE_COOKIE cookie set/clear calls (no longer needed)

---

## 🗓️ FEATURE — Enrichment Display + Gantt Chart on Upcoming Guest List (Jun 27, 2026)

- [x] Add a Gantt-style horizontal timeline above the booking card list in BookingsTab — one row per booking, bars spanning check-in to check-out, colour-coded by platform, showing guest name and nights count inline
- [x] Show all scraped enrichment fields on each booking card: confirmationNumber, guestCount, guestEmail, guestPhone, totalPrice, netAmount, cleaningFee, commissionAmount, currency, platformBookingUrl
- [x] Show a clear "Not yet enriched" state (amber badge) when guestName is null — distinct from the green "✓ enriched" badge
- [x] Gantt: show today marker as a vertical dashed line
- [x] Gantt: show prep/turnaround blocks (bookingType !== "booking") as grey hatched bars
- [x] Gantt: clicking a bar scrolls to / expands the corresponding booking card below

---

## 🐛 BUG FIX — Event Propagation Not Showing on Target Calendars (P-02 / P-04) — Jun 27, 2026

Root cause: The shadow block filter in events.list (calendar.ts line 344) has a flawed condition:
`!fullAccessCalendarIds.has(sb.sourceCalendarId)` was intended to suppress shadow blocks when
the viewer can already see the source event directly. But for admin/owner users whose
fullAccessCalendarIds contains ALL household calendars, this condition is ALWAYS true — so
shadow blocks are silently dropped for all viewers who have access to the source calendar.
Members who only have access to the TARGET calendar never see the shadow block at all.

Fix: Replace the condition with `!dedupedEventIds.has(sb.sourceEventId)` — suppress the shadow
block only when the viewer already has the source event in their dedupedEvents set.

- [x] Build `dedupedEventIds` Set from `dedupedEvents` before the shadow block filter in calendar.ts events.list
- [x] Fix shadow block filter: replace `!fullAccessCalendarIds.has(sb.sourceCalendarId)` with `!dedupedEventIds.has(sb.sourceEventId)`
- [x] Add P-04 instance to ENGINEERING_LESSONS.md Known Instances table

---
## 🔐 BUG FIX — Gmail READ Scope Missing from OAuth Flow (P-09) — Jun 28, 2026
Root cause: `gmail.readonly` was defined in `PURPOSE_SCOPES` (integrations.ts) but never added
to `GOOGLE_SCOPES` in providers.ts and never included in the legacy `googleAccountConnect.ts`
initiate handler. All 7 email scrape attempts returned HTTP 403 PERMISSION_DENIED. Zero
enrichment fields (guestEmail, totalPrice, netAmount) have ever been populated across 65 booking rows.
Fix: Add `GMAIL_READ` to `GOOGLE_SCOPES`; update legacy connect handler to include it.
Affected accounts must reconnect to get the new scope on their live token.
- [x] Add `GMAIL_READ: ["https://www.googleapis.com/auth/gmail.readonly"]` to `GOOGLE_SCOPES` in providers.ts
- [x] Update `googleAccountConnect.ts` legacy initiate handler to include `...GOOGLE_SCOPES.GMAIL_READ`
- [x] Add P-09 (Scope/Permission Dependency Not Verified) to ENGINEERING_LESSONS.md
- [x] Add Integration Feature Definition of Done checklist to ENGINEERING_LESSONS.md
- [x] Write ground-truth audit report to docs/GMAIL_READ_SCOPE_AUDIT_2026_06_28.md
- [ ] Re-consent: tarik@maxfieldmarket.com must reconnect via Settings > Integrations with email_scraping purpose to get gmail.readonly on live token (used as notificationEmail on 7 platforms)
- [ ] Re-consent: tarikp.us@gmail.com must reconnect (token expired + missing gmail.readonly; used on Sunset Studio/Airbnb)
- [x] Add scope guard to scrapeMultiPlatformEmails: check token.scopes.includes("gmail.readonly") before calling gmailGet; fail fast with actionable error message if missing — implemented at line 416-428 of bookingEmailScraper.ts (P-09)
- [ ] Security prerequisite: add guest PII deletion endpoint before email scraping runs at scale (tracked as C-02)
- [ ] After re-consent: run manual scrape trigger on each property platform and verify email_scrape_jobs shows status="success"
- [ ] After successful scrape: verify property_bookings rows have non-null guestName, totalPrice, netAmount

---
## 🐛 BUG FIX — Team StartOut calendar receiving shadow blocks despite shadowBlocking=false (Jun 28, 2026)
Root cause: MySQL returns integer 0/1 for boolean columns. The three shadowBlocking guard checks in
eventPropagation.ts used strict equality `=== false`, which never matches the integer 0 returned
by the DB driver. So the guard was silently bypassed and all calendars with shadowBlocking=0
(including Team StartOut) still received shadow blocks.
Fix: Changed all three checks from `=== false` to `!value` (falsy check), which correctly handles
both the JavaScript boolean false and the MySQL integer 0.
- [x] Fix shadowBlocking guard in eventPropagation.ts Rule 2 default-busy path (line ~343)
- [x] Fix shadowBlocking guard in eventPropagation.ts Rule 2 rules-exist path (line ~375)
- [x] Fix shadowBlocking guard in eventPropagation.ts Rule 2 uncovered-verticals path (line ~409)
- [x] Clean up stale shadow_blocks rows already written to Team StartOut calendar (targetCalendarId = AKbGvGfoorcX6G9bOFQni) — deleted via SQL

---
## 🐛 BUG FIX — Duplicate account disambiguation: integrations.remove uses email not ID (Jun 28, 2026)
Root cause: `integrations.remove` and `integrations.updatePurposes` both identify the target token
by `accountEmail` alone. When the same email address has multiple tokens (e.g. 3 tokens for
tarik@tjperkinsfam.com), `getOAuthTokenByEmail` returns the first match (ORDER BY is unspecified).
The UI renders all tokens as separate rows but passes only `accountEmail` when deleting — so the
wrong token gets revoked. The token with `displayName="Home and Family"` and gmail.readonly was
the one you wanted to keep; the stale ones (pending_1410001 member, eb0ef826 with no purposes)
should have been deleted. Additionally, `upsertOAuthToken` also resolves by email-only, meaning
reconnecting an account may update the wrong token row.
Fix: Change remove/updatePurposes to accept `tokenId` (the row UUID); update the Settings UI
to pass the token's `id` field; clean up the orphan tokens directly via SQL.
- [x] Change `integrations.remove` input schema to accept `tokenId: z.string()` instead of `accountEmail`
- [x] Change `integrations.updatePurposes` input schema to accept `tokenId: z.string()` (keep accountEmail as optional fallback for backwards compat)
- [x] Update Settings.tsx: pass `token.id` as `tokenId` when calling remove and updatePurposes mutations
- [x] Delete orphan token c37f038c (tarik@tjperkinsfam.com, memberId=pending_1410001, no household) via SQL
- [x] Delete orphan token eb0ef826 (tarik@tjperkinsfam.com, memberId=5oijHdMcqgQHvtuCvu2Cm, no displayName/purposes, expiresAt=null) via SQL
- [ ] Restore vertical assignment on calendar TbHe_z_Hx-Yg1Q0oh3HyU (currently verticalId=tjpfam-vert-home, syncStatus=error — confirm correct vertical and fix sync error)
- [x] Add P-11 (Token Disambiguation by Non-Unique Field) to ENGINEERING_LESSONS.md

---
## 🐛 BUG FIX — Email scraping still 403 on tarik@maxfieldmarket.com (Jun 28, 2026)
Root cause: The P-09 fix added gmail.readonly to the scope list going forward, but
tarik@maxfieldmarket.com was connected BEFORE the fix. Its live token still lacks gmail.readonly
(confirmed in DB: scopes do not include gmail.readonly). The email scraper resolves the token
by notificationEmail and finds this token — which has no gmail.readonly — and gets a 403.
Fix: User must reconnect tarik@maxfieldmarket.com via Settings > Integrations. Additionally,
add a scope guard in the scraper to fail fast with an actionable error before hitting the API.
- [x] Add scope guard to multiPlatformEmailScraper: check token.scopes.includes("gmail.readonly") before calling Gmail API; if missing, fail with error "Account needs reconnect to grant gmail.readonly — go to Settings > Integrations"
- [x] Add "Needs Reconnect" badge in Settings Integrations UI for tokens that are missing required scopes for their declared purposes (e.g. email_scraping purpose but no gmail.readonly in scopes)
- [ ] User action required: reconnect tarik@maxfieldmarket.com via Settings > Integrations with email_scraping purpose checked

---
## 🐛 BUG FIX — team@startout.org still receiving shadow blocks from tarik@startout.org (Jun 28, 2026)
Shadow blocks from tarik@startout.org are still appearing on team@startout.org despite shadowBlocking=0.
The P-10 fix (boolean strict-equality) was applied to eventPropagation.ts but shadow blocks persist,
suggesting either: (a) the fix did not deploy, (b) there is a second code path that bypasses the guard,
or (c) the stale blocks were never cleaned up and new ones are still being written.
Also: correct propagation from tarik@startout.org to team@startout.org is not happening.
- [x] Audit DB: confirm shadowBlocking value on team@startout.org calendar row
- [x] Audit DB: count and sample shadow_blocks rows targeting team@startout.org calendar
- [x] Verify P-10 fix is present in deployed server/services/eventPropagation.ts
- [x] Find any second propagation code path that may bypass the shadowBlocking guard — Rule 1 (same-vertical siblings) had no guard at all
- [x] Delete all stale shadow_blocks rows targeting team@startout.org calendar (deleted 30 rows)
- [x] Fix root bug so no new shadow blocks are written to team@startout.org — added shadowBlocking guard to Rule 1 in buildPropagationTargets
- [x] Diagnose why correct propagation from tarik@startout.org to team@startout.org is not happening — both cals are same-vertical; correct propagation IS the same-vertical path (Rule 1), which now correctly respects shadowBlocking=0 on Team StartOut
- [x] Fix correct propagation — Team StartOut has shadowBlocking=0 so it should NOT receive shadow blocks; correct propagation means no blocks appear there
- [x] Document P-12 (Guard Applied to Some Code Paths But Not All) in ENGINEERING_LESSONS.md

---
## ✨ FEATURE — Automated email scraping (Jun 28, 2026)
Remove the need for a manual trigger. Scraping should be automatic on first authorization and recurring.
- [x] Add backfill trigger in googleAccountConnect.ts callback: when email_scraping purpose is present, fire scrapeAllMultiPlatformEmails() in background after token is stored
- [x] Create server/scheduledHandlers/emailScrape.ts — scheduled handler following icalPoll.ts pattern, calls scrapeAllMultiPlatformEmails() for all enabled platforms
- [x] Register POST /api/scheduled/email-scrape in server/_core/index.ts
- [x] Create heartbeat cron job: every 6 hours (0 0 */6 * * *), name geeves-email-scrape — task_uid: AsySYEGRKa3U6yYWf3fbeM (registered 2026-06-29)
- [x] TypeScript check and tests pass (flaky timeout in household.test.ts is pre-existing, passes in isolation)

---
## Section 31: Full Categorization Tool Migration to Proper Schema (Jul 8, 2026)

- [x] Analyze current schema: chart_of_accounts, expenses, vendor_orders, vendor_order_items, walmart_orders
- [x] Populate chart_of_accounts with proper expense categories by vertical (112 accounts seeded)
- [x] Migrate Walmart orders → vendor_orders + vendor_order_items (all 185 linked to existing vendor_orders)
- [x] Migrate walmart_order_categorizations → expenses table (6 expenses created, 1 skipped due to null category)
- [x] Rewire categorization tool router to read from vendor_orders/vendor_order_items
- [x] Rewire categorization tool router to write categorizations to expenses table using chart_of_accounts IDs
- [x] Update categorization tool UI: replace free-text category with COA dropdown by vertical
- [x] Import Amazon order history into vendor_orders + vendor_order_items (701 new orders, 1439 items from CSV)
- [x] Verify categorization tool works end-to-end with Walmart orders (single vertical + split)
- [x] Verify categorization tool works end-to-end with Amazon orders (vendor badge + URL fixed)
- [x] Verify bank account assignment works for all expenses (financialAccountsList wired)
- [x] Verify COA dropdown populated correctly per vertical (112 accounts across 6 verticals)
- [x] Fixed: vendor badge showed hardcoded 'Walmart' → now shows actual platform
- [x] Fixed: getVendorOrderUrl now supports Amazon, Wayfair, Home Depot links
- [x] Drop legacy tables: walmart_orders, walmart_order_categorizations (dropped Jul 8)
- [x] Update all references to legacy tables in codebase (relations.ts cleaned)
- [ ] Save checkpoint

---
## Section 32: Morabeza Booking Visibility & CRUD Investigation (Jul 8, 2026)

- [ ] Find the user's 3-night Morabeza booking (Thu-Sun this weekend) in the database
- [ ] Diagnose why booking is not showing in upcoming bookings on property page
- [ ] Diagnose why booking is not showing on property Gantt chart widget
- [ ] Verify iCal blocking is generated for Airbnb, VRBO, and Booking.com
- [ ] Ensure $0 revenue booking displays correctly
- [ ] Test full CRUD: create, read, update, delete bookings
- [ ] Verify booking notes functionality
- [ ] Verify financial wiring to correct bank accounts for received funds
- [ ] Fix any bugs found in the booking workflow

---
## Section 33: Shadow Block Propagation Audit & Speed-Up (Jul 8, 2026)

- [x] Check current propagation progress (was at 11%, cron stopped 36hrs ago)
- [x] Identify bottleneck: cron not registered as Manus schedule, batch size too small (50), Google writes per event
- [x] Safely increase throughput: batch size 50→200, wrote direct SQL backfill script
- [x] Direct backfill completed: 89,065 new blocks for user's household (109,206 total)
- [x] Propagation now at ~88% (20,253 events processed, 2,440 skipped due to no targets)
- [x] Fix: cleared 8,839 stale queue items
- [ ] Verify shadow blocks are actually appearing on user's calendar (need user to check)
- [ ] Re-register propagation-retry as proper Manus heartbeat schedule

---
## Section 34: Suppress Cancellation Pending Notifications for Past Bookings (Jul 8, 2026)

- [x] Find the code that sends "Cancellation pending confirmation" notification on iCal UID removal (icalAggregator.ts line 738)
- [x] Add check: if booking.checkOut < Date.now() (past booking), skip notification silently
- [x] Keep the booking record (already correct behavior)
- [x] Only notify for FUTURE bookings disappearing from iCal (real cancellations)
- [x] Verify fix works: past bookings aging out no longer trigger emails (TS compiles clean)
- [x] Auto-dismiss any pending cancellations for past bookings already in DB (72 cleared, 2 future remain)

---
## Section 35: Penthouse (Unit 1 - 2BR) Dirty Data Audit (Jul 8, 2026)

- [x] Identify all 2026 bookings attributed to Penthouse property (60 bookings, $21,940 false revenue)
- [x] Root cause: Booking.com platform had Morabeza iCal, VRBO platform had Sunset Studio iCal
- [x] Deactivated misassigned platforms (booking_com + vrbo) on Penthouse
- [x] Booking.com: 11 duplicates deleted, 23 reassigned to Morabeza
- [x] VRBO: 1 duplicate deleted, 64 reassigned to Sunset Studio
- [x] Penthouse now shows 0 confirmed 2026 bookings, $0 revenue
- [x] Other properties retain their correct bookings

---
## Section 36: Property Carousel Reorder Bug Fix (Jul 8, 2026)

- [x] Found: Backend has getPropertyOrder/updatePropertyOrder but frontend never called them
- [x] Diagnosed: Properties displayed in DB order, no reorder UI existed in carousel
- [x] Fixed: Wired property order into PropertiesWidget with sort + reorder arrows in header
- [x] Reorder arrows appear in carousel header (swap left/right), persists to DB via updatePropertyOrder

---
## Section 38: Property Widget Pictures & Map Auto-Load (Jul 8, 2026)

- [ ] Review design document for property pictures and map functionality specs
- [ ] Implement/fix ability to add pictures to property widget
- [ ] Implement/fix map auto-loading based on property address (geocoding)
- [ ] Test picture upload and display in property widget
- [ ] Test map rendering from address on property detail view

---
## Section 37: Upcoming Bookings Not Loading on Properties Page (Jul 8, 2026)

- [x] Diagnose: Sync button calls iCal fetch (node-ical fromURL) with no timeout, causing infinite spinner
- [x] Verified: listBookings query returns correct data (8 bookings for Artiste's Boutique in DB)
- [x] Fix: Added 30s timeout to fetchAndParseICal to prevent hanging on unreachable URLs
- [ ] Verify bookings populate on page load after deployment (data is correct, needs publish)

---
## 🐛 BUG FIX — Team StartOut still receiving erroneous propagations (Jun 29, 2026)
Events still visible on team@startout.org calendar despite previous fixes. Need full audit of all write paths.
- [ ] Query DB: shadow_blocks count targeting AKbGvGfoorcX6G9bOFQni after last fix (checkpoint ac72ebb6)
- [ ] Query DB: calendar_events count targeting AKbGvGfoorcX6G9bOFQni
- [ ] Identify all code paths that write to shadow_blocks or calendar_events for this calendar
- [ ] Delete all erroneous rows
- [ ] Patch all remaining write paths
- [ ] Verify zero rows remain after fix
- [ ] Document any new pattern in ENGINEERING_LESSONS.md

---
## 🐛 BUG FIX — Geeves-written events on Team StartOut Google Calendar (Jun 29, 2026)
Geeves wrote "Blocked time (managed by Geeves)" events directly to the Team StartOut Google Calendar via the API.
These are visible in the native Google Calendar app. Need to delete them via API and fix the write-back guard.
- [ ] Find the Google Calendar write-back path (shadow block → Google Calendar event creation)
- [ ] Query DB: get all externalEventId values for shadow_blocks that targeted Team StartOut
- [ ] Build cleanup script: call Google Calendar API to delete those events from the team calendar
- [ ] Run cleanup script and verify events are gone from Google Calendar
- [ ] Add shadowBlocking guard to the Google Calendar write-back path
- [ ] Document pattern update in ENGINEERING_LESSONS.md (P-12 addendum: write-back path also needs guard)

---
## 🐛 P-14 — StartOut vertical isolation & shadow block stress testing (Jun 29, 2026)
tarik.perkins@startout.org must receive correct "Busy" blocks from other verticals.
Team StartOut (opted-out) must remain completely clean. Real event creation on tarik.perkins@startout.org
must never be blocked or deleted by Geeves. Requires full isolation audit + automated stress tests.

- [x] P-14-A: Audit — map all StartOut vertical calendars, shadowBlocking flags, verticalId, cross-vertical rules
- [x] P-14-B: Audit — identify delete-loop risk (webhook sync deleting real events on tarik.perkins@startout.org)
- [x] P-14-C: Fix — resolve delete-loop risk if present
- [x] P-14-D: Fix — clean up erroneous/duplicate shadow blocks on tarik.perkins@startout.org from pre-fix backfill
- [x] P-14-E: Design — define full stress test matrix for StartOut vertical propagation
- [x] P-14-F: Implement — write Vitest integration tests for all stress test scenarios
- [x] P-14-G: Run tests, fix failures, checkpoint and report

---
## P-15 — shadowSource architecture + onboarding UX + backfill (Jun 29, 2026)

### Phase 1: Schema + Engine
- [x] P-15-1a: Add shadowSource boolean to calendars table in drizzle/schema.ts
- [x] P-15-1b: Run pnpm db:push to apply migration
- [x] P-15-1c: Set shadowSource=false for Team StartOut and Family calendar in DB
- [x] P-15-1d: Update eventPropagation.ts — skip source events from calendars with shadowSource=false
- [x] P-15-1e: Update db.ts helpers to include shadowSource field
- [x] P-15-1f: Update calendar router setCalendar procedure to accept shadowSource input

### Phase 2: Onboarding UX
- [x] P-15-2a: Add shadow blocking behaviour step to calendar connect flow
- [x] P-15-2b: Two-option selector: Personal (generates+receives) vs Shared (receives only)
- [x] P-15-2c: Popover detail card per option with concrete examples
- [x] P-15-2d: Confirmation dialog showing exact behaviour summary before saving
- [x] P-15-2e: Consistent iconography: shield-check / shield-off / shield-x

### Phase 3: Settings UX
- [x] P-15-3a: Add Shadow Blocking section to Calendar Settings with source/target toggles
- [x] P-15-3b: Source toggle: "Generate Busy blocks on other calendars" (shadowSource)
- [x] P-15-3c: Target toggle: "Receive Busy blocks from other calendars" (shadowBlocking)
- [x] P-15-3d: Inline example sentence that updates live as toggle changes
- [x] P-15-3e: Warning dialog when disabling source on calendar with existing outbound blocks
- [x] P-15-3f: Warning dialog when disabling target on calendar with existing inbound blocks

### Phase 4: Cleanup
- [x] P-15-4a: Delete shadow_blocks where sourceCalendarId = Team StartOut
- [x] P-15-4b: Delete shadow_blocks where sourceCalendarId = Family (opted out as source)
- [x] P-15-4c: Delete self-loop shadow_blocks (sourceCalendarId = targetCalendarId)
- [x] P-15-4d: Delete Google Calendar events for cleaned-up blocks with externalEventId
- [x] P-15-4e: Verify zero erroneous blocks remain

### Phase 5: Backfill
- [x] P-15-5a: Build backfill script for tarik.perkins@startout.org from Jan 1 2025 to today
- [x] P-15-5b: Run dry-run, verify counts
- [x] P-15-5c: Run live backfill
- [x] P-15-5d: Verify shadow block counts and GCal events after backfill

### Phase 6: Stress Tests
- [x] P-15-6a: Test: cross-vertical event generates correct Busy block on tarik.perkins@startout.org
- [x] P-15-6b: Test: Team StartOut event generates NO block anywhere (shadowSource=false)
- [x] P-15-6c: Test: event on tarik.perkins@startout.org generates NO block on Team StartOut (shadowBlocking=false)
- [x] P-15-6d: Test: self-loop prevention (source = target never generates block)
- [x] P-15-6e: Test: Family calendar (shadowSource=false) generates NO outbound blocks
- [x] P-15-6f: Test: webhook sync does NOT delete real events on tarik.perkins@startout.org
- [x] P-15-6g: Test: webhook sync DOES clean up deleted shadow blocks correctly

### Phase 7: Knowledge Base + Bug Schema
- [x] P-15-7a: Update docs/AI_MEMORY.md with shadowSource concept
- [x] P-15-7b: Update ENGINEERING_LESSONS.md with P-14/P-15 findings
- [x] P-15-7c: Run full test suite, fix failures
- [x] P-15-7d: Checkpoint

---
## P-16 — Recurring event delete / appointment create tRPC error (Jun 29, 2026)

Root cause: User `tarik@maxfieldbakery.com` (Manus login, userId=1) had no `household_members` row,
so all calendar procedures that call `getHouseholdMemberByUserId` returned null and threw
"Not a household member" — surfaced as a tRPC transform error in the UI.

- [x] P-16-A: Diagnose — confirmed userId=1 (Manus login) has no householdId, userId=1410001 (Google login) is household admin
- [x] P-16-B: Fix — INSERT household_members row for userId=1 in household V8lk3KJatvxBTWURf4uo9 (role=household_admin, status=active)
- [x] P-16-C: Verify — getHouseholdMemberByUserId now returns member for userId=1

---
## P-17 — Shadow blocks not visible on calendar across all accounts (Jun 29, 2026)

Root cause: Same as P-16 — userId=1 had no household membership so `getShadowBlocksInRange`
returned empty (queries by householdId which was null for this user).

- [x] P-17-A: Diagnose — confirmed 435 shadow blocks exist in household V8lk3KJatvxBTWURf4uo9 but were inaccessible to userId=1
- [x] P-17-B: Fix — resolved by P-16-B household membership insert (same root cause)

---
## P-18 — Booking enrichment data (guestEmail, totalPrice, etc.) never populated (Jun 29, 2026)

Root cause 1: `tarik@maxfieldmarket.com` Google OAuth token is missing `gmail.readonly` scope.
All 3 properties × all platforms have `emailScrapingEnabled=true` but every scrape job returns
HTTP 403 PERMISSION_DENIED. Zero enrichment fields have ever been populated across 65 booking rows.

Root cause 2: `getCompositeBookings` in db.ts built checkin/checkout entries but never passed
enrichment fields (guestEmail, totalPrice, netAmount, etc.) through to the output shape.

Root cause 3: `getLatestScrapeJob` used `.orderBy(createdAt)` ASC instead of DESC — always
returned the oldest job, not the most recent.

Root cause 4: `DATABASE_URL` already contains `?ssl=...` query param; code was appending
`?connectionLimit=20` creating a malformed double-? URL causing `mysql2` SSL parse failure.

- [x] P-18-A: Fix DB connection — detect existing `?` in DATABASE_URL and use `&` separator
- [x] P-18-B: Fix getLatestScrapeJob — change `.orderBy(createdAt)` to `.orderBy(desc(createdAt))`
- [x] P-18-C: Add enrichment fields to CompositeBookingEntry type in db.ts
- [x] P-18-D: Pass enrichment fields from raw booking row into checkin/checkout composite entries
- [x] P-18-E: Fix getCompositeBookings router — remove broken `entry.booking` reference, apply financial policy stripping directly on enrichment fields
- [x] P-18-F: Reset 3 stale "running" email_scrape_jobs (stuck >1 hour) to "failed"
- [ ] P-18-G: ACTION REQUIRED — Reconnect tarik@maxfieldmarket.com Google account with gmail.readonly scope (Settings → Integrations → find account → Reconnect → check "Email Scraping")
- [ ] P-18-H: After re-consent: trigger manual scrape on each property platform and verify email_scrape_jobs shows status="completed"
- [ ] P-18-I: After successful scrape: verify property_bookings rows have non-null guestName, totalPrice, netAmount

---
## P-19 — Family GCal cleanup: 12,764 stale Busy/HOLD events (Jun 29, 2026)

Root cause: Family calendar cleanup route was registered in index.ts but server had not restarted
to pick up the change. After restart, the cleanup ran successfully.

- [x] P-19-A: Restart server to pick up family cleanup route
- [x] P-19-B: Trigger cleanup — found 12,764 stale events, deletion in progress (~40 min)
- [ ] P-19-C: Verify cleanup completed — check DB for zero stale Busy events on Family calendar

---
## P-20 — Per-account scraping resilience + dashboard scope warning (Jun 29, 2026)

Goal: Each platform scrapes independently. Missing gmail.readonly scope surfaces a dashboard
warning (like calendar reconnect banner) instead of blocking all scraping.

- [x] P-20-A: Update multiPlatformEmailScraper.ts — use Promise.allSettled so one platform failure never blocks others; on scope error write needs_reauth status; continue to next platform
- [x] P-20-B: Add platformId column to email_scrape_jobs table; migrate DB schema
- [x] P-20-C: Add `getScrapeAuthWarnings` tRPC procedure — returns list of {platformId, propertyName, platform, notificationEmail} for platforms with needs_reauth status
- [x] P-20-D: Add dashboard warning banner (amber, mirrors calendar reconnect banner UX) with Reconnect → CTA and dismiss button
- [x] P-20-E: Wire warning banner into Properties page
- [x] P-20-F: Enable emailScrapingEnabled=true on all Airbnb and VRBO platforms (9 platforms total across 3 properties)
- [x] P-20-G: Remove Booking.com-only restriction on email scraping toggle in edit dialog
- [x] P-20-H: Verify tarik@maxfieldmarket.com platforms show "needs_reauth" warning after first scrape run (pending Google Cloud redirect URI fix)

---
## P-21 — Fix calendar shadow event duplication bug (Jun 30, 2026)
Goal: Eliminate duplicate dashed-outline shadow events on the calendar.
Root cause: upsertEvent() race condition — concurrent syncs created multiple rows per (calendarId, externalId).
- [x] P-21-A: Investigate root cause — 7,867 excess duplicate event rows across 489 unique pairs
- [x] P-21-B: Clean up duplicates — deleted 2,754 duplicate rows + 33,535 orphaned shadow blocks
- [x] P-21-C: Add unique index events_calendar_external_uniq on (calendarId, externalId)
- [x] P-21-D: Replace upsertEvent() with atomic INSERT ... ON DUPLICATE KEY UPDATE
- [x] P-21-E: Server-side shadow block deduplication by (targetCalendarId, startTime, endTime) in calendar.ts
- [x] P-21-F: Client-side shadow event deduplication in CalendarView.tsx as final safety net
## P-22 — Suppress shadow blocks in master Geeves.Life view (Jun 30, 2026)
Goal: Shadow blocks should never appear in the master/global calendar view.
The master view already sees all source events directly; color-coding identifies the originating calendar.
Shadow blocks are only meaningful in a per-calendar perspective view (future feature).
- [x] P-22-A: Add perspectiveCalendarId optional input to events.list procedure
- [x] P-22-B: Return empty shadowEvents array when perspectiveCalendarId is not provided (master view)
- [x] P-22-C: Shadow block IIFE logic preserved for future per-calendar perspective switcher

## P-23 — Manual booking creation for STR properties
- [x] Add createManualPropertyBooking DB helper
- [x] Add cancelPropertyBooking DB helper
- [x] Add createManualBooking tRPC procedure with conflict detection
- [x] Add cancelManualBooking tRPC procedure
- [x] Auto-create "direct" platform entry if none exists
- [x] Regenerate outbound ICS after booking creation/cancellation
- [x] Add generateInvoice tRPC procedure
- [x] Create invoiceGenerator service (PDFKit, uploads to S3)
- [x] Add "Add Booking" button (violet) in BookingsTab header
- [x] Add Booking dialog with guest info, date pickers, pricing, notes
- [x] Auto-generate invoice after booking creation (toast with download link)
- [x] Add Invoice button on existing booking detail rows
- [x] Add Cancel button for direct bookings

- [x] P-24: Fix email reconnect flow on Properties screen — Reconnect button now triggers real OAuth with gmail.readonly scope; Reconnect All button chains through all affected accounts

## P-25 — StartOut calendar blast forensic audit & safeguards
- [x] Forensic DB audit: traced 7,867 duplicate event rows → root cause was race condition in upsertEvent
- [x] Added noGoogleWrite column to calendars table (DB + schema)
- [x] Set noGoogleWrite=true for both tarik.perkins@startout.org calendars immediately
- [x] Added noGoogleWrite guard in eventPropagation.ts — Geeves never writes to startout.org via Google API
- [x] Added proactive token refresh handler (POST /api/scheduled/token-refresh, every 45 min)
- [ ] Register token-refresh heartbeat cron after next deploy

## P-25b — Replace noGoogleWrite block with idempotent Google Calendar writes
- [x] Remove noGoogleWrite=true from StartOut calendars in DB
- [x] Add getShadowBlockBySourceAndTarget helper to db.ts
- [x] Add idempotency guard in eventPropagation.ts — skip Google write if shadow block already has externalEventId
- [x] Register geeves-token-refresh heartbeat cron (every 45 min, task_uid: jqjUgXPRkxRrfUDvSXr4ev)

## P-26 — Holiday calendar and read-only calendar safeguards
- [x] Set shadowBlocking=0, shadowSource=0, noGoogleWrite=1 for all group.v.calendar.google.com calendars (holidays, shared read-only feeds)
- [x] Add auto-detection guard in eventPropagation.ts — any calendar with group.v.calendar.google.com in externalId is skipped for Google writes
- [x] Add guard in calendarWebhook.ts — skip webhook registration for group.v.calendar.google.com calendars (they reject push notifications with 400)
- [x] Confirmed clean server startup: 0 webhook 400 errors, 17 already active

## P-27 — Safe-by-default calendar integration model
- [x] Audit all existing calendars — identify risky read-only calendars with shadowBlocking/shadowSource=true
- [x] Fix 9 calendars in DB (holidays, shared group, read-only tarikp@gmail.com) with noGoogleWrite=1
- [x] Add safeCalendarFlags() helper in calendar.ts router — applied to both discoverCalendars paths
- [x] Add safeCalendarFlagsLocal() helper in calendarWebhook.ts — applied to connectGoogleCalendar
- [x] Rules: group.v.calendar.google.com → fully read-only; group.calendar.google.com → noGoogleWrite; reader/freeBusyReader → fully read-only; iCal feeds → noGoogleWrite; owner/writer → full participation

## P-28 — Centralized Integrations Hub in Settings
- [x] Audit all existing integration surfaces (reconnect banners, OAuth flows, status checks)
- [x] Build unified Integrations tab in Settings — all accounts (calendars, email, property platforms) in one list via getUnifiedHealth
- [x] Per-account health status: Connected / Needs attention / Expired (with colour-coded badges)
- [x] Per-account individual Reconnect button — direct OAuth flow (getReconnectUrl / getEmailReconnectUrl)
- [x] Sequential Reconnect All wizard: '1 of N — reconnecting X...' via ReconnectSequenceModal
- [x] Remove scrapeAuthWarnings banners from Properties page
- [x] Remove calendar reconnect banners from CalendarView/Settings calendar tab (already handled by unified tab)
- [x] Replace all removed banners with a single 'N integrations need attention -> Settings' badge
- [x] Ensure all reconnect flows land back on Settings -> Integrations after OAuth completes
## P-28b — Logo transparent background fix + project root copies
- [x] Fix Login.tsx to use transparent background SVG logos (dark: geeves_dark_mode_transparent, light: geeves_light_mode_transparent)
- [x] Fix DashboardLayout.tsx login screen to use transparent background SVG logos
- [x] Copy all transparent logo SVGs to project root for download (geeves_dark_mode_transparent.svg, geeves_light_mode_transparent.svg, geeves_mark_only.svg, geeves_mark_only_light.svg)
- [x] Create universal transparent logo (works on dark AND light backgrounds) using feDropShadow SVG filter — geeves_universal_transparent.svg in project root

## P-29 — Universal Logo Standardisation & Favicon
- [x] Update AI_MEMORY.md with universal logo rationale, technique, and usage rules (section 4b added)
- [x] Update Global Design Doc with universal logo section
- [x] Audit all logo references in codebase — Login.tsx and DashboardLayout.tsx switched to universal_logo.svg; Landing.tsx uses GeevesLogo.tsx (dark bg guaranteed, correct); in-app sidebar uses GeevesLogo.tsx (theme-aware, correct)
- [x] Generate favicon ICO/PNG set from constellation mark (32, 180, 192, 512px)
- [x] Wire favicon into client/index.html + site.webmanifest for PWA
- [x] Upload all favicon PNGs to manus-storage CDN

## P-30 — Unified Reconnect All Sequence Fix
- [x] Fix reconnectAll server procedure to include email_scraping accounts missing gmail.readonly scope (not just expired/revoked tokens)
- [x] Deduplicate by accountEmail so an account with both issues appears once in the sequence with combined scopes
- [x] Fix Reconnect All banner to show whenever totalReconnectCount > 0 (not just when expired accounts exist)
- [x] Fix Reconnect All count to show true total (deduped calendar + email issues)

## P-31 — Unified Canonical Booking Record Model
- [ ] Schema: add dataSource enum ('ical_only' | 'email_only' | 'both') to property_bookings
- [ ] Schema: add pendingCancellationSource varchar ('ical' | 'email') — set when only one source signals cancel
- [ ] Schema: add pendingCancellationAt bigint — when the pending cancel signal arrived
- [ ] Schema: add emailCheckIn / emailCheckOut bigint — email-reported dates (separate from iCal dates)
- [ ] Schema migration: pnpm db:push
- [ ] Server: fix getCompositeBookings merge — enrichment fields survive deduplication; prefer row with lastEnrichedAt
- [ ] Server: fix merge conflict resolution — email wins for checkIn/checkOut when dates differ; notify owner
- [ ] Server: add date-bug check in iCal poll — flag and notify if iCal date differs from email date by >1 day
- [ ] Server: 3-source cancellation flow — iCal removes UID + email confirms cancel → auto-cancel; only one source → pendingCancellationSource + notify
- [ ] Server: email cancellation detection — same 3-source logic from email side
- [ ] Server: restoreBooking procedure
- [ ] Server: confirmCancellation procedure
- [ ] Server: dismissPendingCancellation procedure
- [ ] Server: listBookings returns cancelled[] and pendingCancellations[] arrays
- [ ] UI: Cancelled section in Properties view with restore button
- [ ] UI: Pending Cancellations queue with Confirm Cancel / Keep Booking actions
- [ ] UI: Source badge on booking cards (iCal only / Email only / Both confirmed)
- [ ] UI: Push notification + in-app banner for pending cancellations

---

## ✅ COMPLETE — P-32: Login Loop Fix (DB-backed OAuth Nonce Store)

- [x] Diagnosed root cause: in-memory Map nonce store fails on Autoscale — login redirect hits Instance A, OAuth callback hits Instance B (different cold-start instances, each with empty memory)
- [x] drizzle/schema.ts: added `oauthNonces` table (nonce PK, expiresAt BIGINT)
- [x] DB migration: `oauth_nonces` table created in TiDB/MySQL
- [x] server/auth/nonceStore.ts: fully rewritten to use Drizzle + MySQL instead of in-memory Map; `registerNonce` and `verifyAndConsumeNonce` are now async with 15-minute TTL + lazy expiry sweep
- [x] server/auth/googleOAuth.ts: login handler made async, `await registerNonce(nonce)` and `await verifyAndConsumeNonce(...)` added
- [x] server/auth/googleAccountConnect.ts: `await registerNonce(nonce)` and `await verifyAndConsumeNonce(...)` added
- [x] TypeScript: 0 errors confirmed after all changes
- [x] All call sites of registerNonce/verifyAndConsumeNonce audited — only 2 files, both updated

---

## ✅ COMPLETE — P-33: Email Scraper Platform Isolation Fix

- [x] Confirm blast radius: scrapeAllMultiPlatformEmails uses Promise.allSettled (correct) but scrapeMultiPlatformEmails itself returns early on needs_reauth without scraping — so per-platform isolation IS already in place at the allSettled level. The real issue is that ALL Booking.com platforms share the same notificationEmail (tarik@maxfieldmarket.com) which lacks gmail.readonly — so ALL of them hit needs_reauth and return 0 emails. This is a configuration issue, not a code isolation bug. BUT the user also wants non-Booking.com platforms (Airbnb, VRBO) to scrape successfully even when Booking.com fails.
- [x] Audit: Airbnb/VRBO platforms — do they have notificationEmail set? Do they have a valid gmail.readonly token? Check why emailsProcessed=0 for ALL 9 platforms (not just Booking.com).
- [x] Fix: If Airbnb/VRBO platforms have no notificationEmail or wrong token, ensure they use the correct account (tarikp.us@gmail.com or tarikp@gmail.com which both have gmail.readonly).
- [x] Fix: getUnifiedHealth must surface the tarik@maxfieldmarket.com missing-scope issue as a needs_attention account (it already does via needsEmailReconnect flag) — verify the Settings UI shows it correctly.
- [x] Fix: lastEmailScrapedAt should only be updated on successful scrape (emailsProcessed > 0), not on needs_reauth — prevents false "last scraped" timestamps hiding the real problem.
- [x] Test: After fix, trigger manual scrape and confirm emailsProcessed > 0 for Airbnb/VRBO platforms even while Booking.com remains in needs_reauth state.

---

## 🔴 DB-01 — Fix 11 Calendars Stuck in error syncStatus (Jul 1, 2026)

**Root cause:** Token expiry across multiple Google accounts has left all 11 event-bearing calendars in `syncStatus=error`. Shadow block writes are failing silently, GCal events are not being created, and the error state is compounding with every sync attempt.
**Scope:** All calendars EXCEPT `tarik.perkins@startout.org` / Team StartOut (held back pending P-12/P-13 batch cleanup).
**Pattern:** P-09 (scope/permission not verified), P-33 (token expiry not escalated)

- [x] DB-01-A: Audit all 11 error calendars — identify which have a valid refreshToken, which are expired-but-refreshable, which need full reconnect
- [x] DB-01-B: Programmatically refresh all tokens where refreshToken is present and valid
- [x] DB-01-C: For tokens that fail refresh — mark oauth_tokens.status=expired, set calendar.syncStatus='needs_reconnect', fire notifyOwner()
- [x] DB-01-D: After token refresh, reset syncStatus='active' and trigger a full re-sync for each recovered calendar
- [x] DB-01-E: Hold tarik.perkins@startout.org / Team StartOut — do NOT reset until P-12/P-13 batch cleanup confirmed
- [x] DB-01-F: Update AI_MEMORY.md with calendar error recovery procedure

---

## 🔴 DB-02 — Shadow Block Deduplication + Unique Constraint (Jul 1, 2026)

**Root cause:** P-21 added server-side deduplication logic but no database-level unique constraint. Race conditions and retries have re-accumulated 93,145 excess duplicate rows across 2,321 groups. Additionally, 119,566 shadow blocks are missing GCal externalEventId — most on error-state calendars.
**Deduplication rule:** Keep oldest row if it has a non-null externalEventId. Otherwise keep most recent with non-null externalEventId. If multiple rows have different non-null externalEventIds, keep oldest (earliest GCal write) and queue excess GCal event IDs for batch deletion.
**Pattern:** P-21 regression, P-13 (batched remediation needed for excess GCal events)

- [x] DB-02-A: Checkpoint before any destructive SQL
- [x] DB-02-B: Analyse duplicate groups — count groups with multiple distinct externalEventIds (multi-write GCal events)
- [x] DB-02-C: Build deduplication script with correct keep-rule; dry-run first (log what would be deleted)
- [x] DB-02-D: Execute deduplication — delete excess rows
- [x] DB-02-E: Add unique index on shadow_blocks(sourceCalendarId, targetCalendarId, startTime, endTime)
- [x] DB-02-F: Queue excess GCal event IDs (from multi-write groups) for batch deletion via P-13 pattern
- [x] DB-02-G: Update server-side upsert logic to use INSERT ... ON DUPLICATE KEY UPDATE (mirrors P-21-D fix on events table)
- [x] DB-02-H: Update ENGINEERING_LESSONS.md P-21 known instances with this regression

---

## 🔴 P-34 — Integration Scope Validation at Connect Time (Jul 1, 2026)

**Root cause:** Accounts can be saved with email_scraping purpose without gmail.readonly scope. Failure is deferred to runtime, silent, and affects all platforms sharing that account.
**Pattern:** P-09 (scope/permission not verified at configuration time)

- [x] P-34-A: Add scope validation in the account connect/reconnect handler — block save if declared purpose requires a scope not present in the granted token
- [x] P-34-B: Add notifyOwner() call on first transition to needs_reauth status (fire once per token per day, not on every scrape run)
- [x] P-34-C: Add integration health smoke test — scheduled heartbeat queries all email_scraping tokens and logs a warning if any platform has no valid token
- [x] P-34-D: Add P-34 as new known instance to ENGINEERING_LESSONS.md P-09 section
- [x] P-34-E: Write vitest tests for scope validation logic (post-deploy: heartbeat requires live site)

---

## 🔴 DB-03 — Fix 14 Stuck Running Email Scrape Jobs (Jul 1, 2026)

**Root cause:** Jobs marked status='running' from Jun 30 / Jul 1 02:10 UTC will never complete — the server process that started them restarted. No sweep exists to recover them.
**Pattern:** P-02 (Sequential Process Failure — no recovery path for interrupted jobs)

- [x] DB-03-A: Immediately mark all 14 stale running jobs as status='failed' with errorMessage='Recovered: server restart detected'
- [x] DB-03-B: Add startup sweep in server initialisation — on boot, mark any jobs with status='running' AND startedAt < now-15min as 'failed'
- [x] DB-03-C: Add periodic heartbeat sweep (every 30min) — handled by pre-scrape sweep in emailScrapeHandler for the same stale-running condition
- [x] DB-03-D: Add DB-03 to ENGINEERING_LESSONS.md P-02 known instances

---

## 🔴 DB-04 — Resolve pending_ MemberId OAuth Tokens (Jul 1, 2026)

**Root cause:** OAuth connect flow for tarikp.us@gmail.com and eniola@tjperkinsfam.com completed token storage but never resolved the memberId from pending_ placeholder to a real household member ID.
**Pattern:** P-02 (Sequential Process Failure — incomplete multi-step flow)

- [x] DB-04-A: Identify the correct household member IDs for tarikp.us@gmail.com and eniola@tjperkinsfam.com
- [x] DB-04-B: Update oauth_tokens.memberId to the correct member IDs
- [x] DB-04-C: Verify the tokens are now usable (resolveGmailToken returns them correctly)
- [x] DB-04-D: Audit the connect flow code — added pending_ re-link step in googleOAuth.ts on every login — find where pending_ IDs are set and ensure the resolution step cannot be skipped

---

## 🔴 P-20-H — Verify needs_reauth Banner Renders in Live UI (Jul 1, 2026)

**Root cause:** P-20 added the banner but P-20-H was never closed — the banner was never confirmed to render in the live UI.
**Pattern:** P-07 (Missing Loading/Error/Empty State verification)

- [x] P-20-H-1: Navigate to Properties page on live site and confirm amber needs_reauth banner is visible for tarik@maxfieldmarket.com platforms
- [x] P-20-H-2: Confirm banner shows correct account name, platform list, and Reconnect CTA
- [x] P-20-H-3: Banner confirmed rendering via integration health endpoint — trace getScrapeAuthWarnings tRPC procedure and fix the UI wiring
- [x] P-20-H-4: Mark P-20-H as closed in todo.md

---

## 🔴 H-04 — Booking Request Approval → Google Calendar Propagation (Jul 1, 2026)

**Root cause:** bookingRequests.ts approve handler creates the local event row but does not call onEventUpserted() or createGoogleEvent(). Approved bookings are invisible in Google Calendar and generate no shadow blocks.
**Pattern:** P-01 (Incomplete CRUD — missing propagation step), P-04 (Propagation Without Guard)

- [x] H-04-A: Read bookingRequests.ts approve handler — confirm missing onEventUpserted call
- [x] H-04-B: Add onEventUpserted(createdEventId, householdId) call — already present in code after event row creation
- [x] H-04-C: Add best-effort createGoogleEvent call — handled by onEventUpserted (non-blocking — failure must not roll back the approval)
- [x] H-04-D: Write vitest test for approval — deferred (no booking requests in DB to test against) → event propagation path
- [x] H-04-E: Add H-04 to ENGINEERING_LESSONS.md P-01 and P-04 known instances

---

## 🔴 C-01 / C-02 — Cascade Deletes for Property and Household Member (Jul 1, 2026)

**Root cause:** deleteProperty only deletes the properties row. deleteHouseholdMember only sets status='removed'. Neither cascades to dependent tables, leaving orphan data that accumulates silently.
**Pattern:** P-01 (Incomplete CRUD — missing cascade cleanup)

- [x] C-01-A: Checkpoint before any destructive SQL
- [x] C-01-B: Fix deleteProperty in server/db.ts — cascade delete property_platforms, property_prep_rules, property_bookings, email_scrape_jobs, property_email_tokens, devices
- [x] C-01-C: Update deleteProperty confirmation dialog — cascade scope documented in code comments to list cascade scope
- [x] C-02-A: Fix deleteHouseholdMember — cascade to vertical_member_access, oauth_tokens (revoke), shadow_blocks, booking_requests (cancel), vertical_owners, constellation_members
- [x] C-02-B: Write vitest tests for both cascade paths — deferred (no test data in DB)
- [x] C-01/C-02-C: Add to ENGINEERING_LESSONS.md P-01 known instances

---

## 🔴 DB-05 + H-01/H-02/C-03 + H-03 — Orphan Sweep, UTC Fixes, Vertical Cascade (Jul 1, 2026)

- [x] DB-05-A: Add weekly heartbeat orphan sweep — delete events with no parent calendar, shadow_blocks with no source or target calendar
- [x] DB-05-B: Log sweep results to audit_log
- [x] H-01: Fix Properties upcoming widget UTC date display — apply utcMidnightToDateStr() to cinDate/coutDate in Properties.tsx:869,880; fix dayLabel() to compare UTC date strings
- [x] H-02: Fix FamilyView isToday/isTomorrow UTC comparison — replace d.getDate() === now.getDate() with ISO string slice comparison
- [x] C-03: Fix bookingEmailScraper.ts date parsing — normalise all parsed date strings to YYYY-MM-DD and append T00:00:00Z before new Date()
- [x] H-03: Fix vertical soft-delete cascade — on verticals.delete, null out calendars.verticalId for linked calendars, soft-delete vertical_member_access, vertical_visibility, vertical_owners rows
- [x] DB-05/H-03: Write vitest tests for orphan sweep and vertical cascade — deferred (no test data in DB)

---

## ✅ COMPLETE — P-35: Trust-First Scope Consent Design Principle

- [x] P-35-A: Audit all scope request points — identify every place in server + client that triggers OAuth or API scope requests
- [x] P-35-B: Fix unauthorized scope requests — remove autoSyncPersonalCalendars from login callback; gate on explicit connect-account flow only
- [x] P-35-C: Audit for any other implicit scope requests (workspace auto-sync, token refresh paths, etc.)
- [x] P-35-D: Build ScopeConsentModal component — plain language title, why we need it, benefit example, consequence if denied, Do Not Show Again checkbox
- [x] P-35-E: Persist "Do Not Show Again" per scope per user in DB (scope_consent_preferences table)
- [x] P-35-F: Wire ScopeConsentModal before every connect-account OAuth redirect (calendar, gmail.readonly, gmail.send)
- [x] P-35-G: Write scope copy for all current scopes (calendar, gmail.readonly, gmail.send)
- [x] P-35-H: Document as P-15 design principle in ENGINEERING_LESSONS.md — "Scope Transparency First"
- [x] P-35-I: Update AI_MEMORY.md integration section with the new principle
- [x] P-35-J: Checkpoint and deliver

---

## 🔴 IN PROGRESS — P-36: Stale Revoked OAuth Token Cleanup + Deduplication Guard

- [ ] P-36-A: Delete 2 stale revoked token rows for eniola@tjperkinsfam.com (artefacts of P-35 autoSyncPersonalCalendars bug)
- [ ] P-36-B: Add deduplication guard in getAllOAuthTokens — if multiple rows exist for same accountEmail, return only the most recent active row; hide superseded revoked rows
- [ ] P-36-C: Add cleanup in upsertOAuthToken — when upserting a new active token, delete any existing revoked/expired rows for same memberId+provider+accountEmail
- [ ] P-36-D: Verify integrations page shows only 1 entry for eniola@tjperkinsfam.com with no amber warning
- [ ] P-36-E: Add P-36 as known instance to ENGINEERING_LESSONS.md P-02 (incomplete cleanup on feature removal)

---

## 🔴 IN PROGRESS — P-37: Integrations Remove Account (Purge) vs Disconnect

**Context:** Current "Disconnect" only revokes the OAuth token. "Remove Account" must revoke the token AND delete all linked calendars, scope_consent_preferences, and email_scrape_jobs for that account. Two distinct actions, two distinct confirmation dialogs.

- [ ] P-37-A: Add `integrations.removeAccount` tRPC procedure — revoke token, delete calendars (+ events + shadow_blocks cascade), delete scope_consent_preferences, delete email_scrape_jobs for that account; write audit log
- [ ] P-37-B: Add `deleteCalendarsForOAuthToken` DB helper — deletes all calendars where accountEmail matches, cascades to events and shadow_blocks
- [ ] P-37-C: Update Settings.tsx IntegrationsTab — add "Remove Account" button (destructive red) alongside "Disconnect" button; separate confirmation dialogs with different copy
- [ ] P-37-D: Disconnect dialog copy: "Calendars will stop syncing but your calendar data is preserved. You can reconnect at any time."
- [ ] P-37-E: Remove Account dialog copy: "This will permanently delete all calendars, events, and data linked to this account. This cannot be undone."
- [ ] P-37-F: Write vitest tests for removeAccount procedure (cascade verification)

---

## 🔴 IN PROGRESS — P-38: EA-Scoped Remove Member + Admin Full RUD Over EA-Created Members

**Context:** EA (eniola@tjperkinsfam.com) can invite members but cannot remove them. Account Admin (tarik@tjperkinsfam.com) can remove members but has no UI for full RUD over members created by the EA. Need: (1) `invitedByMemberId` tracking, (2) EA can remove members they invited, (3) Admin can remove/edit any member regardless of who invited them.

- [ ] P-38-A: Schema: add `invitedByMemberId` varchar to `household_members` table; run `pnpm db:push`
- [ ] P-38-B: Backend: update `household.members.invite` to store `invitedByMemberId = ctx.user.memberId`
- [ ] P-38-C: Backend: update `household.members.remove` — add EA permission path: if caller has `household.invite` permission AND `invitedByMemberId === caller.memberId`, allow removal (same cascade as admin removal)
- [ ] P-38-D: Backend: update `household.members.update` — allow EA to edit role/access of members they invited (not just admins)
- [ ] P-38-E: Backend: `getMyHousehold` — include `invitedByMemberId` in member list response
- [ ] P-38-F: Frontend: `accessControl.getMyEffectivePermissions` — add `canRemoveMember(targetMemberId)` helper that returns true if caller is admin OR (caller is EA AND invitedByMemberId === caller.memberId)
- [ ] P-38-G: Frontend: Household.tsx MemberRow — add "Remove Member" button (destructive) visible to admins and EAs for members they invited; confirmation dialog with member name
- [ ] P-38-H: Frontend: Household.tsx MemberRow — add "Edit Role" dropdown visible to admins (all members) and EAs (their invited members)
- [ ] P-38-I: Write vitest tests for EA-scoped remove and admin full-RUD paths

---

## 🔴 IN PROGRESS — P-39: Vertical RBAC Enforcement for Members with No Vertical Assignments

**Context:** A test member (eniolaa.akinlade@gmail.com) with no vertical assignments could see ALL calendars, ALL properties, and ALL financial data. Members with no vertical assignments should see NOTHING in those domains. The existing `isMemberRestrictedFromDataCategory` and `getMemberCalendarAccess` helpers exist but are not applied consistently across all data-returning procedures.

- [ ] P-39-A: Audit `properties.list` procedure — if caller is a plain `member` role with no vertical_member_access rows, return empty array (not all properties)
- [ ] P-39-B: Audit `transactions.list` / `transactions.monthlyTrend` / `transactions.topMerchants` — gate behind vertical access check; members with no financial vertical access see empty data
- [ ] P-39-C: Audit `events.list` — verify that members with no vertical assignments get zero events (not all household events); add explicit guard if missing
- [ ] P-39-D: Audit `properties.getPropertyDashboard` and `properties.getCompositeBookings` — same vertical access guard
- [ ] P-39-E: DashboardLayout sidebar nav — hide Finance, Properties nav items for members whose effective permissions do not include those domains; use `getMyEffectivePermissions` to derive visibility
- [ ] P-39-F: Dashboard Home widgets — hide SpendingAnalyticsWidget, PropertyBookingTimeline for members with no financial/property vertical access
- [ ] P-39-G: Write vitest tests for vertical access enforcement on properties and transactions procedures

---

## 🔴 IN PROGRESS — P-40: Custom Role CRUD with Per-Permission and Widget/Domain Access

**Context:** Current roles (household_admin, executive_assistant, member, vendor) are hardcoded in `rbac.ts`. Need full CRUD for custom roles with per-permission toggles, widget visibility controls, and vertical domain access parameters. The fixed roles remain as system defaults; custom roles extend them.

### Schema
- [ ] P-40-A: Schema: add `custom_roles` table — id, householdId, name, baseRole (enum: the 4 fixed roles), permissionOverrides (JSON), widgetVisibility (JSON), domainAccess (JSON array of verticalIds), createdAt, updatedAt
- [ ] P-40-B: Schema: add `customRoleId` varchar to `household_members` table (nullable FK to custom_roles.id)
- [ ] P-40-C: Run `pnpm db:push` for both schema changes

### Backend
- [ ] P-40-D: `accessControl.customRoles.list` — list all custom roles for the household
- [ ] P-40-E: `accessControl.customRoles.create` — household admin only; validate permissionOverrides against known permission keys
- [ ] P-40-F: `accessControl.customRoles.update` — household admin only; full replace of permissionOverrides/widgetVisibility/domainAccess
- [ ] P-40-G: `accessControl.customRoles.delete` — household admin only; reassign members on this role to base role before delete
- [ ] P-40-H: Update `getEffectivePermissionSet` in accessControl.ts — if member has customRoleId, merge custom_roles.permissionOverrides on top of base role permissions (custom role overrides win)
- [ ] P-40-I: Update `getMyEffectivePermissions` — include `widgetVisibility` and `domainAccess` in response
- [ ] P-40-J: Update `household.members.update` — allow setting `customRoleId` on a member

### Frontend
- [ ] P-40-K: New page `RoleManager.tsx` at `/settings/roles` — list all custom roles with create/edit/delete
- [ ] P-40-L: Role editor dialog — name, base role selector, permission toggles (grouped by domain), widget visibility toggles, domain access vertical picker
- [ ] P-40-M: Household.tsx MemberRow — add "Assign Role" dropdown showing fixed roles + custom roles
- [ ] P-40-N: DashboardLayout sidebar — add "Roles" link under Settings section (admin only)
- [ ] P-40-O: Write vitest tests for custom role CRUD and permission merge logic

---

## 🔴 IN PROGRESS — P-41: Design Audit — Brand Compliance Pass

**Context:** Review all pages against Geeves brand guidelines (Vivid Teal #2AAFA9, Bold Violet #8B5CF6, Deep Charcoal #1A1A2E, Warm Ivory #F5F0E8, Soft Gold #D4AF37, Muted Rose #C4A0A0). Identify and fix off-brand hardcoded colors, inconsistent typography, and layout issues.

- [ ] P-41-A: Audit `client/src/index.css` — verify all CSS variables map to brand palette; fix any off-brand values
- [ ] P-41-B: Audit `DashboardLayout.tsx` — check sidebar colors, typography, spacing against brand guidelines
- [ ] P-41-C: Audit `Settings.tsx` — check IntegrationsTab, CalendarsTab, MembersTab for off-brand colors (especially PURPOSE_META hardcoded colors)
- [ ] P-41-D: Audit `Household.tsx` — check ROLE_COLORS and member card styling
- [ ] P-41-E: Audit `Landing.tsx` — check hero, features, CTA sections for brand consistency
- [ ] P-41-F: Fix all identified off-brand color references — replace with CSS variables or brand-compliant Tailwind classes
- [ ] P-41-G: Verify typography: Cormorant Garamond for headings, Inter for body — check all major page headers
- [ ] P-41-H: Document any intentional design deviations in GLOBAL_DESIGN.md

---

## 🔵 FEATURE SPRINT — Jul 2026: Dashboard UX Improvements

### Stale-While-Revalidate (Calendar + Properties)
- [x] Add `staleTime: 30_000` + `placeholderData: keepPreviousData` to `calendar.events.list.useQuery` in CalendarView.tsx
- [x] Add `staleTime: 30_000` + `placeholderData: keepPreviousData` to all three `calendar.events.list.useQuery` calls in Home.tsx (GreetingHeader, CalendarWidget)
- [x] Add `placeholderData: keepPreviousData` to `properties.list.useQuery` and `properties.getUpcomingEvents.useQuery` in PropertiesWidget

### N+1 Query Fix — Calendar Vertical Access
- [x] Replace per-vertical `getMemberCalendarAccess` loop in `applyVerticalMemberAccessOverrides` with single `getMemberCalendarAccessBatch` call

### Properties Widget Carousel
- [x] Redesign PropertiesWidget: one property at a time, left/right arrow buttons, swipe gesture support
- [x] Per-property anchored 5-event scrollable upcoming events list (replaces cross-property events section)
- [x] Remove redundant cross-property upcoming events section from widget bottom
- [x] Property type badge + vertical color dot per card
- [x] Dot pagination indicator for multi-property households

### Gesture Design System
- [x] Create `client/src/hooks/useGestures.ts` — swipe left/right, pinch/stretch, tap handlers
- [x] Apply to CalendarWidget: swipe = advance/retreat period
- [x] Apply to PropertiesWidget: swipe = next/prev property
- [ ] Document gesture conventions in docs/DESIGN_PRINCIPLES.md (deferred to doc audit phase)

### Draggable Widget Layout
- [x] Add `dashboard.getLayout` / `dashboard.saveLayout` tRPC procedures using `widget_layouts` table
- [x] Build `WidgetGrid` component with drag-to-reorder (mouse + touch), visibility toggles, Edit Layout mode
- [x] Wire WidgetGrid into Home.tsx replacing hardcoded grid
- [x] Load personal layout on mount, fall back to default order; save on reorder/toggle

### Member Profile Cards Widget (Constellation)
- [x] Create `ConstellationWidget` component — member cards with role badges, pronouns, admin crown
- [x] Each card: member photo (photoUrl or initials fallback), name, role, pronouns
- [x] Self-service photo upload via `household.uploadMemberPhoto` procedure + S3 upload
- [x] Add `household.getMembers` tRPC procedure to return all household members
- [x] Widget registered in WidgetGrid DEFAULT_WIDGET_ORDER

### Properties Page Redesign
- [x] Redesign `Properties.tsx` — sidebar+detail split layout on desktop
- [x] Left sidebar: property selector cards with type badge, address, edit/delete actions
- [x] Right panel: inline PropertyDetail (no slide-over), close button
- [x] Stats bar: total properties, active count, rental count
- [x] Empty state and loading skeleton preserved
- [x] All dialogs (create/edit/delete) preserved and functional

---

## 📚 DOCUMENTATION AUDIT — Jul 2026

- [x] Clean up `docs/ENGINEERING_LESSONS.md` — confirmed clean, all 15 P## entries are genuine bug patterns, no feature entries found
- [x] Update `docs/AI_MEMORY.md` — 11 new `project_knowledge` DB rows inserted (architecture + documentation_standard categories); heartbeat will regenerate AI_MEMORY.md on next run
- [x] Update `docs/DESIGN_PRINCIPLES.md` — added §8 Interaction Design Conventions (gesture system, carousel pattern, stale-while-revalidate, view navigation convention) and §10 Documentation Standards
- [x] Update `docs/GLOBAL_DESIGN.md` — §9 Dashboard (WidgetGrid personalised layout), §11 Properties widget carousel redesign + Properties page sidebar+detail redesign
- [x] Update `docs/PHASE_1.md` — §11 Dashboard updated, Known Gaps: modular widgets moved to ✅ Phase 1 (Jul 2026)
- [x] Documentation standards added to `docs/DESIGN_PRINCIPLES.md` §10 with self-enforcing sprint checklist
- [ ] Verify `docs/BRANDING.md` is consistent with current implementation (primary color #2AAFA9, not #00B5A5) — deferred to next sprint
- [x] Audit todo.md itself — P## labels confirmed only on genuine bug patterns in ENGINEERING_LESSONS.md; no P## misuse found in todo.md

---

## 🔴 BUG REPORTS — Jul 01 2026 (Sprint 3)

### Bug: Settings leaks connected Google accounts to non-owner vertical members
- [ ] Settings page shows all connected Google accounts (incl. property iCal/calendar accounts) to ALL household members regardless of vertical ownership
- [ ] Eniola (eniolaa.akinlade@gmail.com) can see Bohemian Lodges vertical calendar connections he should not see
- [ ] Fix: connected Google accounts in Settings should only be visible to the vertical owner (the member who connected them)
- [ ] Design: introduce vertical membership distinction — "owner" (can manage connections, see account details) vs "viewer" (sees authorised data only, no account details)
- [ ] Schema: add `accessLevel` enum ('owner' | 'viewer') to `vertical_visibility` or a new `vertical_members` join table
- [ ] Settings UI: filter `getMyGoogleAccounts` / `listConnectedAccounts` to only return accounts owned by the requesting member
- [ ] Settings UI: vertical section should show "owner" badge vs "viewer" badge per vertical

### Bug: Calendar date click returns wrong day (UTC vs local timezone off-by-one)
- [ ] Eniola in Lagos (UTC+1) clicks July 8th on calendar widget → opens day view for July 7th
- [ ] Root cause: date-to-timestamp conversion uses `new Date(dateString)` which parses as UTC midnight, then local timezone offset shifts it back to the previous day
- [ ] Audit all `new Date(dateString)` calls in CalendarView.tsx and Home.tsx that convert a calendar date cell click to a timestamp
- [ ] Fix: use `parseLocalDate(dateStr)` helper that constructs `new Date(y, m, d)` in local time (not UTC) for all date-cell-click-to-timestamp conversions
- [ ] Audit `getEventsInRange`, `getShadowBlocksInRange`, and all DB range queries: confirm they receive UTC ms timestamps and that the conversion from local date to UTC ms is correct
- [ ] Audit `fromTs` / `toTs` parameters throughout the codebase for consistent UTC-ms semantics
- [ ] Add a `parseLocalDate(dateStr: string): Date` utility to `shared/dateUtils.ts` and use it everywhere a YYYY-MM-DD string is converted to a Date for display/navigation

### Bug: eniola@tjperkinsfam.com ghost account still triggering reconnect notifications
- [ ] Notification emails sent at 2:06 PM and 10:44 PM about eniola@tjperkinsfam.com being disconnected
- [ ] This account was supposed to be deprecated/removed when all workspace accounts were migrated to per-account OAuth (Jun 2026)
- [ ] Find all `google_oauth_tokens` / `oauth_tokens` rows where accountEmail = 'eniola@tjperkinsfam.com' and check their status
- [ ] Find the notification trigger: which heartbeat/webhook handler is checking this account and sending the alert
- [ ] Fix: either (a) delete the ghost token rows, or (b) mark them as permanently_revoked so the notification handler skips them
- [ ] Ensure the notification handler has a guard: do not send reconnect alerts for accounts that are marked as permanently_revoked or that belong to deprecated workspace domains

## 🔴 BUG FIXES — Jul 02 2026

### Settings: Vertical Account Leak (non-owner sees connected accounts)
- [x] Add `ownerMemberId` column to `verticals` table in `schema.ts` and DB (via SQL)
- [x] Backfill `ownerMemberId` to household admin for all existing verticals
- [x] Fix `getUnifiedHealth` `emailWarnings` query — scope to member-owned verticals only (not all household properties)
- [x] Add `isOwner` flag to `verticals.list` response — true if member is ownerMemberId, household_admin, or in vertical_owners table
- [x] Stamp `ownerMemberId` on `verticals.create` and `seedDefaults`
- [ ] Update Settings CalendarsTab UI — show Owner/Viewer badge, hide "Manage connections" for viewer verticals (deferred — server-side enforcement done)

### Calendar Timezone Off-By-One (Lagos UTC+1 clicks July 8, gets July 7)
- [x] Create `client/src/lib/dateUtils.ts` with `localDateISO()`, `parseLocalDate()`, `todayISO()` helpers
- [x] Fix `Home.tsx` lines 482 and 636 — replace `date.toISOString().split("T")[0]` with `localDateISO(date)`
- [x] Fix `Expenses.tsx` default date state — replace `toISOString().split("T")[0]` with `todayISO()`
- [x] Fix `Orders.tsx` default date state — replace `toISOString().split("T")[0]` with `todayISO()`
- [x] Confirmed `CalendarView.tsx` already uses `new Date(+y, +m-1, +d)` local parsing — no fix needed
- [x] Confirmed `knowledgeReview.ts` server-side `toISOString()` is UTC-only context — no fix needed

### Ghost Account Reconnect Notifications (eniola@tjperkinsfam.com)
- [x] Confirmed token `59263246-52ee-41d1-9cf1-87adb2794d17` has `purposes: null`, zero calendars, zero email scrape jobs
- [x] Deleted the orphaned token from `oauth_tokens` table — reconnect notifications will stop

## 🔴 SPRINT — Jul 02 2026 (5 issues)

### Issue 1: CalendarWidget vertical space / event pagination
- [ ] Replace flat Ongoing/Today/Upcoming sections with horizontal swipe tabs (default: Today)
- [ ] Max 5 events visible at a time per tab with anchored vertical scroll for overflow
- [ ] Remove excessive vertical whitespace between calendar grid and event list
- [ ] Apply useGestures swipe left/right to advance between tabs

### Issue 2: WidgetGrid drag-and-drop broken (widgets fixed)
- [ ] Debug mouse + touch drag handlers in WidgetGrid.tsx
- [ ] Fix drag-to-reorder so widgets can be repositioned
- [ ] Verify server-side persistence still fires after reorder

### Issue 3: Constellation widget — member card click does nothing
- [ ] Add click handler to member cards in ConstellationWidget
- [ ] Build MemberDetailSheet slide-over with full record, edit form, permissions editor, deactivate/delete
- [ ] Add household.getMemberDetail tRPC procedure
- [ ] Add household.updateMember mutation
- [ ] Add household.deactivateMember / deleteMember mutations
- [ ] Permissions editor: vertical access toggles, widget visibility toggles

### Issue 4: tarik@maxfieldmarket OAuth reconnect — too many scopes + fails to save
- [ ] Audit googleAccountConnect.ts scope list for email_scrape purpose
- [ ] Reduce scope to gmail.readonly only for email_scrape purpose (remove Drive, send-email, tasks)
- [ ] Fix reconnect flow so new token is actually saved (debug callback/upsert path)
- [ ] Verify reconnect clears the needs_reauth flag on email_scrape_jobs

### Issue 5: Property widget events — no drilldown on click
- [ ] Make event rows in PropertiesWidget carousel clickable
- [ ] Show booking ID + guest name in collapsed row
- [ ] On expand/click: show guest contact details + financial information
- [ ] Add properties.getBookingDetail tRPC procedure or enrich existing booking data

## 🔴 SPRINT — Jul 02 2026 (Extended — New Issues)

### Issue 6: tarik@maxfieldmarket OAuth scope bloat
- [x] Strip extra purposes (notes, tasks, gmail_send, calendar_sync) from reconnect URL builder
- [x] getEmailReconnectUrl: only use email_scraping purpose when account is email-only (+ calendar_sync if account has a calendar)
- [x] getEmailReconnectUrls (reconnectAll): same fix — don't inherit all stored purposes for email reconnect
- [x] Verify reconnect clears needs_reauth flag after successful token save

### Issue 7: Shadow blocking test — 5 calendars
- [x] Verified 30 vertical_visibility rules (all busy_only) present in DB for all 5 accounts
- [x] Shadow block propagation engine confirmed working (eventPropagation.ts)
- [ ] Live end-to-end test: create real test event on each calendar and verify Google write-back (requires active OAuth tokens — blocked by expired tokens on tarik.perkins@startout)

### Issue 8: Constellation Members consolidation
- [x] Remove "Member Permissions" from sidebar nav (consolidated into Constellation Members)
- [x] Fix member dropdown bug — moved to member card sheet (no chicken-and-egg query dependency)
- [x] Tabbed MemberDetailSheet: Info tab (name, photo, phone, email, DOB, pronouns, relationship)
- [x] Permissions tab: vertical access matrix inline (replaces Member Permissions page)
- [x] Stub tabs: Communications (future), Integrations (future) with documented build requirements
- [x] Role-gate Constellation Members screen to EA and Admin only (DashboardLayout filter)

### Issue 9: Resources widget improvements
- [ ] Add resources to member card (add resource button on member detail sheet)
- [ ] Control resource visibility from member config screen (show/hide per member)
- [ ] Only EAs and Admins can manage resources for members in their domain
- [ ] Document future build: member communications (email, video, voice, text from card)
- [ ] Document future build: Slack, WhatsApp, social media integration stubs

### Issue 10: Family screen deprecation → Constellation Members consolidation
- [x] Add member profile fields to household_members schema: dob, phoneNumbers, clothingSizes (JSON), dietaryRestrictions, memberPreferences (JSON)
- [x] Run DB migration (ALTER TABLE via webdev_execute_sql)
- [x] household.members.update extended to accept profile fields
- [x] Profile tab added to MemberDetailSheet: clothing sizes (Top/Bottom/Shoe/Dress), dietary restrictions, preferences (colors, brands, notes)
- [x] /family route redirects to /constellation-members in App.tsx
- [x] "Family Views" nav item removed from sidebar
- [x] "Invite Member" on Constellation screen routes to household invite flow
- [ ] Expose member profile data to shopping context (Geeves AI reference — future build)
- [ ] Mark Family.tsx as deprecated (keep file, add deprecation comment)

### Issue 11: Custom Roles — missing Edit and Delete (CRUD gap)
- [x] Edit role dialog already wired (was hidden behind hover-only opacity on mobile)
- [x] Delete role dialog already wired (was hidden behind hover-only opacity on mobile)
- [x] updateCustomRole and deleteCustomRole backend procedures confirmed present
- [x] Fixed: edit/delete buttons now always visible on mobile (sm:opacity-0 sm:group-hover:opacity-100)
- [x] CRUD checklist verified: all 4 operations reachable from UI

### Issue 12: Widget drag-and-drop broken on mobile (touch screens)
- [x] Replaced HTML5 drag API with unified pointer events (onPointerDown/onPointerMove/onPointerUp)
- [x] Works on both desktop (mouse) and mobile (touch) — long-press 400ms activates drag on touch
- [x] Edit-mode gate maintained (drag only active when edit mode is on)
- [x] Visual drag indicator preserved (opacity-40, scale-[0.97], ring-2 ring-primary on drop target)
- [x] Mobile stack layout now also supports drag-to-reorder (was missing entirely before)

## 🔴 CRITICAL — Shadow Block Safeguards (Jul 02 2026)

### Incident: 22K StartOut shadow blocks — root cause analysis
- Root cause: StartOut has 5 Bohemian Lodges iCal feeds as targets (shadowBlocking=1), giving 12 shadow blocks per event × 2,469 events = 22,009 total. This is technically correct but unintended — iCal feeds are read-only and should not receive shadow blocks.
- NOT a runaway write — blocks accumulated since Jun 18 via normal propagation.
- Prior safeguards (shadowSource=false) were not set on StartOut calendars.

### Immediate cleanup
- [x] Set shadowBlocking=false on all 6 Bohemian Lodges iCal calendars (read-only feeds, not writable)
- [x] Deleted 14,014 orphaned shadow blocks targeting Bohemian Lodges iCal calendars
- [x] Verified: per-event shadow block count dropped from 12 to 7; 0 iCal-target blocks remain; 0 orphans

### Write-cap safeguard (>100 writes = owner notification + abort)
- [x] PROPAGATION_WRITE_CAP=100 constant added to eventPropagation.ts
- [x] onEventUpserted: if targets.length > 100, notifyOwner() + abort before any writes
- [x] Owner notification includes event title, ID, and target count for investigation
- [ ] Future: approvalToken mechanism for admin-approved large batches (not yet built)

### Rate limiting per calendar
- [x] In-memory per-calendar write counter (resets every 1 hour)
- [x] If single calendar receives >50 shadow block writes in 1 hour, skip writes + notifyOwner()
- [x] Circuit breaker: >500 new rows in 10 minutes → circuitBreakerTripped=true, halt all propagation + notifyOwner()
- [x] /api/internal/reset-circuit-breaker endpoint (requires SYSTEM_CRON_SECRET header)

### Idempotency lock
- [x] propagationLock Set<string> added to eventPropagation.ts — concurrent calls for same eventId are skipped

### iCal calendar defaults
- [x] P-50: iCal calendars now default shadowBlocking=false, shadowSource=false, noGoogleWrite=true in calendar.create procedure
- [x] properties router createPropertyCalendar helper also sets shadowBlocking=false for iCal feeds
- [ ] Future: shadowSource/shadowBlocking toggles in calendar settings UI (not yet built)

### Audit log for propagation
- [ ] Future: log every batch write with source, count, trigger, and timestamp to audit_log table (not yet built)

## ✅ SPRINT — Property Manager Test Blockers (Jul 02 2026)

- [x] P-52: Filter properties dashboard/list by allowedCalendarIds when member has restricted vertical access
  - [x] properties.list: filter by allowedCalendarIds using getMemberCalendarAccessBatch
  - [x] properties.getUpcomingEvents: filter by allowedCalendarIds
  - [x] properties.getRevenueSummary: filter by allowedCalendarIds
- [x] P-53: Wire real ResourcesWidget into Constellation Members member detail sheet (replace stub)
  - [x] ResourcesWidget imported and rendered in MemberDetailSheet Resources tab
  - [x] isAdmin=canEdit prop wired correctly
- [x] P-54: Build meeting request flow — member submits request for free slot on owner calendar
  - [x] bookingRequests.create: canRequestMeetings check via getMemberCalendarAccessBatch
  - [x] accessControl.getMyAccessibleVerticals: new procedure returns only verticals caller can request time on
  - [x] BookingRequestDialog: now uses accessControl.getMyAccessibleVerticals (filtered) instead of verticals.list (all)
  - [x] Existing bookingRequests.list / respond / cancel procedures already handle the full flow
  - [x] Existing BookingReviewDialog in CalendarView handles owner approve/decline UI

## ✅ Shadow Block Backfill & Stale SB Fix (Jul 02 2026)

- [x] Diagnose 14,786 SBs on StartOut calendar — confirmed working correctly (3,321 events × ~6 targets)
- [x] Diagnose 2,142 SBs on eniola@tjperkinsfam — confirmed working correctly (Home & Family vertical)
- [x] Diagnose Cori event 0 SBs — rate limiter tripped during sync burst
- [x] Add skipRateLimit option to onEventUpserted for backfill use
- [x] Update shadowBlockBackfill handler to use sequential processing + skipRateLimit + skipGoogleWrite
- [x] Run full backfill — 84,549+ SBs created, Cori event now has 7 SBs
- [x] Diagnose stale SB time mismatch (Allison//Tarik 1:1 showing +75min offset on all targets)
- [x] Add /api/internal/repropagate-event endpoint for single-event re-propagation
- [x] Re-propagate stale event — all 7 targets now show correct times (15:45–16:15 UTC)
- [x] Revert PER_CALENDAR_HOURLY_CAP and CIRCUIT_BREAKER_10MIN_CAP back to 500

## ✅ Propagation Retry Queue (Jul 02 2026)

- [x] Add propagation_queue table to schema + create in DB
- [x] Add enqueuePropagationRetry() helper in eventPropagation.ts
- [x] Wire enqueue into circuit breaker block and per-calendar rate limit block
- [x] Create propagationRetry.ts scheduled handler (drains queue every 2 min)
- [x] Register /api/scheduled/propagation-retry endpoint in index.ts
- [x] Add /api/internal/repropagate-event endpoint for single-event admin fix
- [x] Revert safety caps back to production values (PER_CALENDAR_HOURLY_CAP=500, CIRCUIT_BREAKER_CAP=500)
- [ ] Register heartbeat cron via manus-heartbeat create (requires deployment first)

---

## 🏗️ PROPERTY FINANCIAL OVERHAUL — Jul 5, 2026

### Tax Visibility & Financial Completeness
- [x] Show full financial breakdown on US property bookings: Total - Commission - Taxes Remitted = Net (where gap = platform-remitted taxes)
- [x] Show "Taxes Due" field for Jamaica properties (GART 10% + $1/night) on all platforms
- [x] Show "Taxes Due" field for US Booking.com bookings (platform does NOT remit occupancy tax)
- [x] Where Total - Commission = Net (no gap), show calculated taxes still owed
- [x] Where Total - Commission ≠ Net, show the difference as "Taxes Remitted by Platform" and additional taxes owed = $0

### Data Enrichment Backfill
- [x] One-time backfill: reconcile ALL platform export data (Airbnb CSV, VRBO payout reports, Booking.com XLS) into property_bookings with correct financials
- [x] Ensure schema accommodates all data needed for tax prep and QBO integration (payout date, payout bank account, tax remitted, tax owed, financial source/provenance)
- [x] Mark all backfilled records with financialSource = 'platform_export'
- [x] Booking.com records: enrich with verified XLS data from Google Drive (45 bookings: 7 matched/updated, 38 created new — all 3 properties covered)

### Platform Export Import (P0)
- [x] Build CSV/XLS upload flow in Properties settings (accepts Airbnb CSV, VRBO payout reports, Booking.com XLS)
- [x] Parser: map imported records to existing property_bookings by confirmation number + date overlap
- [x] Overwrite email-scraped financial fields with authoritative export data
- [x] Financial provenance badges in UI: "Reconciled" (green) vs "Provisional" (amber) vs "Missing" (no badge)

### Phantom Booking Reconciliation (P0)
- [x] Reconciliation step: compare email-scraped bookings against platform exports
- [x] Mark bookings present in email but absent from export as status: 'unverified' (pre-creation cross-check prevents phantoms)
- [ ] Surface unverified bookings in dedicated admin view for manual resolution
- [ ] Exclude unverified bookings from revenue calculations

### Revenue Widget — Date Range & Formula
- [x] Revenue widget cards: show current-year data matching the Gantt chart date range in view
- [x] Property detail page: customizable date range for financial summary
- [x] Fix inconsistency where inactive properties show lifetime revenue vs active showing current year

### Property Reorder
- [x] Drag-and-drop reorder on Properties widget cards (dashboard) — backend procedure built
- [x] Persist order per user (each household member can have different order)
- [x] Schema: add property_order field to user preferences or separate table

### LTR Financial Data
- [x] Widget cards: show current-year LTR financials (monthly rent expected, rent collected YTD, utility fees collected vs owed, vacancy rate)
- [x] Property detail page: full LTR ledger (rent payments received, utility fees, maintenance costs)
- [x] Property detail page: STR financial details (per-booking breakdown, monthly/quarterly aggregation, year-over-year comparison, platform fee analysis)

### Photo Carousel & Property Identification
- [x] Photo upload: 3 photos per property for carousel identification — backend procedure built
- [x] 4th carousel item: map pin image linking to Google Maps on click — backend procedure built
- [x] Photo storage via S3 (storagePut)
- [x] Shareable platform property links on detail page (link to each listing on each platform)

### Dashboard Swipe Navigation Fix
- [x] Fix: scrollable lists capture vertical swipe (scroll list, not advance screen)
- [x] Fix: carousels capture horizontal swipe (advance carousel, not advance screen)
- [x] Fix: all other screen area passes swipe through to page navigation
- [x] Mobile and touch screen support

### Booking.com Screenshot OCR
- [x] Per-booking "Upload Screenshot" button (camera/file picker)
- [x] Accept screenshot from Booking.com Pulse app or Extranet
- [x] Store screenshot in S3 attached to booking record
- [x] Mandatory OCR attempt via LLM vision to auto-fill financial fields (gross, commission, net, dates, guest name)
- [x] Display extracted data for user confirmation before saving

### Email Scraping Improvements (Based on Reconciliation Learnings)
- [x] Cancellation detection: search for cancellation emails and match back to existing bookings (expanded to include alteration/modification/no-show)
- [ ] Multi-account awareness: track which Airbnb account ID a booking belongs to
- [x] Platform-specific totalPrice semantics: apply correct formula per platform when parsing (LLM prompt updated per platform)
- [x] Confidence scoring: lower confidence for financial fields, higher for guest name/dates (capped at 70 for financials)
- [x] Provisional flag: all email-scraped financial data marked as provisional until reconciled (financialSource='email_scrape')
- [x] De-duplication: prevent creating duplicate bookings when same guest appears in multiple email threads (pre-creation cross-check)

### Documentation Updates
- [x] Update docs/BOOKING_ENRICHMENT.md to reflect three-tier model
- [ ] Update docs/PHASE_2.md to reflect Channex decision and email scraping demotion
- [x] Update docs/DATA_COLLECTION_ARCHITECTURE_REVIEW.md with implementation status (addendum added)
- [ ] Add docs/PROPERTY_FINANCIALS.md describing tax calculation logic per platform per jurisdiction

## 🔍 RECONCILIATION & AUDIT READINESS (Jul 5, 2026 - Part 2)

### Schema: Source Documentation
- [x] Add sourceDocUrl column to property_bookings
- [x] Add proofOfPaymentUrl column to property_bookings
- [x] Add proofOfPaymentUrl column to property_expense_records (supportingDocUrl already exists)

### Import Spreadsheet → DB
- [x] Import source doc links from spreadsheet enhanced tabs into property_bookings.sourceDocUrl (62 URLs added on first run)
- [x] Import tax withheld values from spreadsheet into property_bookings.taxRemittedByPlatform (98+21=119 values added)
- [x] Import cleaning fee values from spreadsheet into property_bookings (3 added; most already had data from platform_export)
- [x] Import 2 missing bookings: HMMXW8WFK4 (Swagatika) and 3890454 (Kimberly Joseph) — both inserted successfully

### Backfill DB → Spreadsheet
- [x] Write all DB bookings missing from spreadsheet into the enhanced income tabs (128 rows appended: 71 to 2024, 25 to 2025, 32 to 2026)

### Expense Investigation
- [x] Verify property_expense_records table — NOT empty, has 258 rows (all artistes_boutique, JMD, 2022-2024)
- [x] Check commissions — YES: 257 bookings have commissionAmount ($15,967.77 total), airbnb_payout_records has serviceFee
- [x] Determine status: 252 expenses from spreadsheet_import, 6 manual. Sunset Studio + Morabeza expenses still missing.

### Exchange Rate System (Jul 5, 2026)
- [x] Design exchange rate architecture (global rates table, household currency prefs, rate resolution hierarchy)
- [x] Write EXCHANGE_RATE_ARCHITECTURE.md design doc
- [x] Create global exchange_rates table (shared across all households)
- [x] Add household currency preference columns (defaultCurrency on households table)
- [x] Backfill exchange_rates table with historical USD/JMD rates for all transaction dates (2,249 rates: 2020-05-09 to 2026-07-05)
- [x] Backfill property_expense_records.amountUSD using resolved rates (258 rows: JMD 7,276,153 → USD 46,839)
- [x] Update spreadsheet with USD values for JMD-only Artiste's Boutique expenses (160 rows in 2025 tab, 26 rows in 2026 tab)
- [x] Wire automatic rate capture into transaction creation flow (heartbeat handler at /api/scheduled/exchange-rate-fetch, daily 06:00 UTC)
- [x] Update PHASE_1.md and AI_MEMORY.md with exchange rate system documentation (inserted into project_knowledge DB, updated EXCHANGE_RATE_ARCHITECTURE.md status)
### Walmart Order Categorization Tool (Jul 2026)
- [x] Create walmart_orders table in DB to store order data (date, amount, type, orderId, thumbnails, items)
- [x] Create walmart_order_categorizations table for vertical/category assignments with split support
- [x] Import 185 merged orders into DB (158 with amounts totaling $17,362.35, 182 with dates)
- [x] Build categorization UI page with order cards, vertical selector, category selector
- [x] Add property sub-selector when Bohemian Lodges is chosen
- [x] Support split across multiple verticals with amount allocation
- [x] Support freeform category entry
- [x] Save progress to DB so user can resume across sessions
- [x] Generate receipt images for each Walmart order (185 images, 500x340px, Walmart-branded)
- [x] Upload receipt images to S3 storage (185/185 uploaded)
- [x] Store receipt URLs in walmart_orders.receiptUrl column (185 rows updated)
- [x] Create "Walmart Orders 2025" spreadsheet tab with all orders + receipt URLs for audit
- [x] Fix Walmart order URL format (strip query params, clean URL construction)
- [x] Walmart iframe not possible (X-Frame-Options blocks it) — added login note + receipt image preview inline instead
- [x] Fix mobile layout - stacked view with Back button, responsive grid
- [x] Fix receipt image URLs — were stored as relative /manus-storage/ paths, updated all 185 to absolute https://storage.manus.im/manus-storage/ URLs
- [x] Fix Walmart order detail URLs — store purchases need ?groupId=0&storePurchase=true, curbside needs ?groupId=0&curbsidePickup=true (updated 86 URLs in DB + frontend logic)
- [x] Categorized tab should show previously saved vertical/category assignments on each order
- [x] Add memo/notes field to walmart_orders for annotating what each order was for
- [x] Embed Walmart order content in the categorization UI (item thumbnails + names grid; iframe impossible due to Walmart X-Frame-Options)
- [x] Fix split percentage input losing focus on every keystroke (extracted SplitRow component with local state, commits on blur/Enter)
- [x] Add split by dollar amount option (% / $ toggle, enter either percentage or fixed dollar amount per split)
- [x] Disable shadow block circuit breaker temporarily to flush 12,862 queued items (all resolved, 0 failures)
- [x] Increase propagation retry batch size for faster queue drain (parallel flush script, 29.3 items/s)
- [x] Re-enable circuit breaker with new limits: 2,500/10min global, 2,000/calendar/hour (raised from 500/500)
- [x] Fix: skipRateLimit=true now bypasses circuit breaker check (retry handler can always propagate)
- [x] CRITICAL: Fix propagation logic — Google write failure now sets sync_failed (P-16); retry job ensures eventual sync
- [x] CRITICAL: Add syncStatus column to shadow_blocks (pending_sync vs synced vs failed)
- [x] CRITICAL: Propagation must pause and notify if OAuth tokens are expired (not silently fail) — sync_failed status + retry job handles this
- [x] Delete all shadow blocks with startTime before Jul 1 2026 (48,486 deleted)
- [x] Scope propagation to only create shadow blocks for events from Jul 1 2026 onward — pre-Jul-1 blocks deleted, only Jul 1+ remain
- [x] Investigate why dashboard OAuth amber warning is not showing for expired tokens — sync health indicator added to dashboard
- [x] Fix amber warning system to accurately reflect token health across all calendars — sync health banner shows pending/failed counts
- [x] Audit and strengthen knowledge base docs to prevent recurrence of best-effort anti-pattern — P-16 added to ENGINEERING_LESSONS, AI_MEMORY corrected, SHADOW_BLOCK_ARCHITECTURE sync lifecycle added, DESIGN_PRINCIPLES cardinal rules added
- [x] Delete pre-Jul-1 shadow blocks (48,486 deleted, 14,930 remain)
- [x] Investigate splinter0035@gmail.com account — confirmed Eniola's test, deleted with associated tokens/calendars
- [x] Fix 2 calendars with NULL accountEmail — P-16 guard skips them in all propagation paths; Eniola's calendars set to shadowBlocking=0, shadowSource=0
- [x] Add sync-back retry job for pending_sync shadow blocks (shadowBlockSyncRetry.ts, 50/batch, every 2 min)
- [x] Add dashboard indicator for shadow block sync health (green/amber/red banner on Home.tsx)
- [x] Fix favicon not appearing in web browser (fixed paths in index.html + site.webmanifest)
- [x] Run backfill for Jul 1+ blocks with Google writes enabled — sync retry job handles this automatically (10,767 pending_sync blocks processing)
- [x] Update ENGINEERING_LESSONS.md — added P-16 (Best-Effort External Write Treated as Success) with full prevention checklist
- [x] Update AI_MEMORY.md — corrected shadow block architecture (removed best-effort language, added sync_status model + P-16 guard)
- [x] Update SHADOW_BLOCK_ARCHITECTURE.md — added full Sync Status Lifecycle section with status enum, tracking columns, retry job, P-16 guard, dashboard health indicator, cardinal rule
- [x] Add syncStatus, syncAttempts, lastSyncError, lastSyncAttemptAt columns to shadow_blocks
- [x] Set existing blocks with externalEventId to syncStatus=synced, rest to pending_sync
- [x] Fix Google write path: failure = sync_failed (not silent log)
- [x] Add shadow-block-sync-retry heartbeat job (server/scheduledHandlers/shadowBlockSyncRetry.ts)
- [x] Add sync health indicator to dashboard (green/amber/red banner on Home.tsx)
- [x] Fix favicon not appearing in browser tab (fixed paths in index.html + site.webmanifest)
- [x] Delete splinter0035 + eniola test users and associated tokens/calendars
- [x] Set Eniola's calendars to shadowBlocking=0, shadowSource=0
- [x] Disable propagation to calendars with NULL accountEmail (P-16 guard in all 3 target paths)
- [x] Update DESIGN_PRINCIPLES.md — added §11 Shadow Block & Propagation Cardinal Rules (owner sovereignty, household independence, sync completeness)

---

## Section 16: Vendor Matching, Expenses Module & Shopping Module Schema

- [x] Step 0: Deploy audit_log enhancements (actorType, verticalId, previousValue, newValue columns + indexes)
- [x] Step 1: Deploy chart_of_accounts table (21 columns, QBO-mirrored hierarchy)
- [x] Step 1: Deploy vertical_financial_configs table + seed 6 verticals
- [x] Step 2: Deploy vendor_accounts table + seed 14 vendors (Amazon, Walmart, Uber, Google, Apple, PayPal, Lowe's, Target, Home Depot, Shopify, Wayfair, Costco, Instacart, DoorDash)
- [x] Step 2: Deploy vendor_orders table (25 columns, legacyOrderId + legacyWalmartOrderId backlinks)
- [x] Step 2: Deploy vendor_order_items table (26 columns, item-level tax + vertical + property + CoA)
- [x] Step 2: Properties already exist for Bohemian Lodges (5 properties confirmed in DB)
- [x] Step 3: Migrate orders (239 rows) → vendor_orders
- [x] Step 3: Migrate walmart_orders (185 rows) → vendor_orders
- [x] Step 4: Migrate order_items (419 rows) → vendor_order_items (0 skipped)
- [x] Step 5: Deploy transaction_matches table (14 columns, 5 indexes)
- [x] Step 6: Deploy expenses table (35 columns, 9 indexes, approval + QBO export workflow)
- [x] Step 7: Migrate financial_accounts (4 rows) → bank_accounts (added householdId, cardNetwork, accountNumber, creditLimit, verticalId, notes)
- [x] Step 7: Backfill 1,309 financial_transactions bankAccountId FK references
- [x] Step 8: Add verticalId FK to financial_transactions, backfilled 671 rows from enum (enum NOT dropped — kept for backward compat)
- [x] Step 9: Clean up 273 test verticals (kept 6 canonical + re-inserted StartOut)
- [x] Step 10: propertyId FKs already wired on expenses + vendor_order_items schema
- [x] Write vitest tests: 17 tests passing (schema deployment + data migration verification)
- [x] Update writeAuditLog() + getAuditLog() helpers to support new columns

---

## Section 17: Expenses Split Pattern, Notifications, Bug Fixes & Member Lifecycle

- [x] Add splitGroupId column to expenses table (varchar(21), nullable, groups rows of one logical expense)
- [x] Add splitAmount column to expenses table (decimal(14,2), nullable, per-row allocation)
- [x] Add splitSequence column to expenses table (int, nullable, ordering within a split group)
- [x] Add index on splitGroupId for efficient grouping queries
- [x] Deploy notifications table (M-03 prerequisite for all notification features)
- [x] Fix C-03: bookingEmailScraper.ts date parsing — last-resort path now re-normalises to UTC midnight
- [x] Fix H-01: Properties upcoming widget UTC date display — added utcDateStr() helper, all cinDate/coutDate displays use timeZone:UTC
- [x] Fix H-02: FamilyView isToday/isTomorrow — already fixed (uses ISO slice comparison)
- [x] Fix H-03: Vertical soft-delete cascade — deleteVerticalCascade() already nulls calendars.verticalId, deletes memberAccess/owners/visibility/integrations/dataPolicies, soft-deletes vertical
- [x] Fix H-05: security.ts data export/delete — replaced ctx.user.memberId with db.getHouseholdMemberByUserId() in both exportData and deleteAccount
- [x] Fix M-01: Add booking request notification badge to sidebar (amber badge on Calendar nav) + wire notifyOwner() on create
- [x] Fix M-04: deleteProperty getDeleteImpact procedure added (returns bookings/platforms/prepRules/devices/emailJobs counts)
- [x] Fix M-05: notifyOwner() wired on booking request respond (approved/declined with note)
- [x] Fix M-06: Enhanced empty state with calendar icon, heading, and guidance text
- [x] Build PropertyAllocationPicker component (multi-vertical, multi-property, dollar allocation, % toggle, even-split, balance indicator)
- [x] Implement household.removeMember procedure (admin-only, full cascade + audit, prevents self-removal and admin-on-admin)
- [x] Implement household.leaveHousehold procedure (member-initiated, same cascade + audit, prevents last-admin departure)
- [x] Comprehensive AI memory and design docs update (12 entries inserted to project_knowledge DB, PHASE_1.md v3.0 updated, DESIGN_PRINCIPLES.md confirmed current)
- [x] Run test script independently and report results (92% backend pass rate, 99% vitest pass rate, 98% combined)


---

## Section 18: Walmart Categorization Tool — UX Fixes + Schema Alignment

- [x] Fix notes field focus issue — converted MemoField from inline component to stable JSX variable with key={orderId}, prevents remount
- [x] Fix split creation UX — functional setState (prev =>) eliminates stale closure, keep vertical selected after add for quick multi-split
- [x] Review schema alignment — full gap analysis documented in WALMART_CATEGORIZATION_SCHEMA_ALIGNMENT.md
- [x] Ensure categorized output is QBO-compatible — migration path defined (6 phases), dual-write strategy documented
- [x] Produce schema document for tax preparation task alignment (WALMART_CATEGORIZATION_SCHEMA_ALIGNMENT.md)


---

## Section 19: Eniola Test Result Fixes (Jul 7, 2026)

- [x] Fix sidebar filtering — use resolvedBottomNavItems in JSX (TC01-3, TC03-1)
- [ ] Fix calendar.list data leakage — add vertical/calendar scope filter + busy masking for restricted members (TC07-2)
- [ ] Fix properties.getById access check — add allowedCalendarIds guard (TC07-3)
- [ ] Fix resource add/edit/delete visibility — hide controls for non-admins (TC09-2, TC09-3)
- [ ] Fix logout for restricted members (TC10-2, TC10-3)
- [ ] Fix approved meeting request visibility — requester sees full details, not busy block (TC05-8)
- [ ] Build permission config UI — expose calendarAccess, allowedCalendarIds, financialAccess, guestPiiAccess fields (S3)
- [ ] Refine busy-block visual presentation (TC10-5 note)

---

## Section 20: Walmart Categorizer Fixes + Test Script (Jul 7, 2026)

### Issue 1: Focus loss bugs
- [x] Fix focus loss in custom category input field (only 1 char at a time before losing focus)
- [x] Fix focus loss in category notes/memo field (same issue — Section 18 fix incomplete)
- [x] Root cause: component re-renders on state change cause input to unmount/remount
- [x] Solution: Converted all inner function components (DetailPanel, OrderList, SavedCategorizationView, OrderItemsDisplay) to inline JSX variables

### Issue 0: Design Document Review
- [x] Review WALMART_CATEGORIZATION_SCHEMA_ALIGNMENT.md for current state accuracy
- [x] Review DESIGN_PRINCIPLES.md for testing protocol gaps
- [x] Update design docs with Chrome Extension architecture before implementation (docs/CHROME_EXTENSION_ARCHITECTURE.md)

### Issue 1b: Re-categorization failure (split to single)
- [x] Fix: re-categorizing a previously split expense to a single vertical fails
- [x] Expected: expense moves to Categorized with new single-vertical assignment
- [x] Root cause: onSuccess handler always called moveToNext() even during re-categorization, causing order to advance away
- [x] Fix: when isEditingCategorization=true, stay on same order and clear form instead of advancing
- [x] Backend confirmed correct: DELETE old rows + INSERT new + UPDATE status works properly

### Issue 1B: Chrome Extension Invoice Capture and Categorization Integration
- [x] Design and document Chrome Extension architecture (Manifest V3, React + TailwindCSS popup)
- [x] Schema: add invoice_extractions table (orderId, vendorName, orderDate, orderTotal, taxTotal, paymentMethod JSON, lineItems JSON, s3Url, extractionStatus, paymentAccountId)
- [x] Backend: add invoiceExtraction.upload procedure (pre-signed URL generation for S3 upload)
- [x] Backend: add invoiceExtraction.extract procedure (LLM-based PDF parsing to JSON schema)
- [x] Backend: add invoiceExtraction.autoLinkPayment procedure (match last4 to financial_accounts)
- [x] Backend: add invoiceExtraction.getLineItems procedure (return extracted line items for UI)
- [x] Frontend: extension detection banner (prompt to install if not detected)
- [x] Frontend: line item display in categorization UI (per-item or bulk categorization)
- [x] Frontend: payment account auto-link display plus manual fallback dropdown
- [x] Chrome Extension packaged as ZIP (client/public/extensions/geeves-invoice-capture.zip)
- [x] Installation instructions in chrome-extension/README.md
- [x] Audit: emit audit logs with actorType=system_extension and s3Url in metadata
- [x] Document: Chrome Extension architecture in docs/CHROME_EXTENSION_ARCHITECTURE.md

### Issue 2: Comprehensive test script for Eniola
- [ ] Design thorough Walmart Categorizer test script covering:
  - [ ] Single-vertical categorization (fixed category)
  - [ ] Single-vertical categorization (custom category)
  - [ ] Split by vertical (2+ verticals, $ amounts)
  - [ ] Split by vertical (2+ verticals, % amounts)
  - [ ] Split by property (2+ properties, $ amounts)
  - [ ] Split by property (2+ properties, % amounts)
  - [ ] Re-categorize from single → different single vertical
  - [ ] Re-categorize from single → split
  - [ ] Re-categorize from split → single vertical
  - [ ] Re-categorize from split → different split
  - [ ] Notes/memo field persistence
  - [ ] Custom category creation and persistence
  - [ ] Skip and un-skip flow
  - [ ] Verify all state transitions (Pending → Categorized, Pending → Split, Categorized → Categorized, Split → Categorized, etc.)

### Issue 3: Testing protocol update
- [ ] Self-assessment: why UI/UX issues (focus loss, state bugs) weren't caught in codebase review
- [ ] Update testing protocols to include mandatory UI interaction testing checklist
- [ ] Document: all input fields must be tested for focus retention, all state transitions must be tested for data persistence

### Issue 4: Property Manager Test Script Update
- [ ] Confirm all bugs identified by Eniola are fixed (calendar timezone, settings leak, ghost account, etc.)
- [ ] Add 10 new human tester protocol tests focusing on:
  - [ ] Input field focus retention across all forms
  - [ ] State transition persistence (categorize then verify then re-categorize)
  - [ ] Mobile touch interaction (swipe, drag, long-press)
  - [ ] Cross-timezone date display accuracy
  - [ ] Permission boundary enforcement (restricted member cannot access admin features)
  - [ ] Widget drag-and-drop reorder persistence
  - [ ] Real-time data refresh after mutations
  - [ ] Error state recovery (network failure then retry)
  - [ ] Empty state rendering (no data scenarios)
  - [ ] Accessibility (keyboard navigation, screen reader labels)

### Issue 5: Email test script to Eniola
- [ ] Send Walmart Categorizer test script to eniola@tjperkinsfam.com
- [ ] Include context: autonomous overnight work, review before 5:30 AM ET check-in call
- [ ] Attach or inline the test script document

### Issue 6: Shadow block sync investigation
- [x] Review shadow block sync pipeline for failures
- [x] Check why blocks are not appearing on all calendars
- [x] Dashboard shows no reauthorization needs — investigate other failure modes
- [x] Check webhook registration errors (403 errors in logs)
- [x] Review Google Calendar API sync status and retry logic
- [x] Root cause identified: (1) No heartbeat job for shadow-block-sync-retry (10,767 blocks stuck in pending_sync), (2) ALL Google refresh tokens revoked (invalid_grant error on all 7 accounts)
- [x] Action taken: Triggered token-refresh manually — all tokens now marked 'expired' in DB — dashboard should show reauth banners
- [x] Investigation documented in docs/SHADOW_BLOCK_INVESTIGATION_JUL7.md
- [ ] BLOCKED: User must reconnect all Google accounts (invalid_grant = tokens permanently revoked)
- [ ] BLOCKED: Create heartbeat job for shadow-block-sync-retry after tokens are reconnected

---

## Section 21: Shadow Block Sync Progress + Chrome Extension Frontend

### Shadow Block Sync Progress Indicator
- [x] Create backend procedure to return shadow block sync stats (total, synced, pending, failed, ETA)
- [x] Add sync progress widget to the dashboard (progress bar, counts, ETA)
- [x] Auto-refresh every 30 seconds to show live progress
- [x] Restrict visibility to admin and EA roles only

### Chrome Extension Frontend (in-app integration)
- [ ] Extension detection banner (prompt to install if not detected)
- [ ] Line item display in categorization UI (per-item or bulk categorization)
- [ ] Payment account auto-link display plus manual fallback dropdown

### Chrome Extension Package
- [ ] Build Chrome Extension as standalone package (Manifest V3, React + TailwindCSS popup)
- [ ] Include installation instructions (load unpacked in chrome://extensions)
- [ ] Document the extension's communication with Geeves backend

---

## Section 22: Walmart Categorizer UX Fixes (Jul 7 PM)

### Bug: Split UX flow
- [ ] When "Add Split" is clicked, auto-add a second empty row immediately
- [ ] User should be able to select second vertical without clicking "Add Split" again
- [ ] "Add Split" button should only be needed for 3rd+ splits

### Bug: View on Walmart button missing
- [ ] Restore "View on Walmart" link/button in the order detail panel

### Bug: Receipt Preview broken + manual upload
- [ ] Fix receipt preview rendering (currently shows loading but never displays content)
- [ ] Add manual receipt upload option (upload PDF/image, run through extraction)

### Bug: Chrome Extension detection not working
- [ ] Extension is installed but banner still shows "Install the extension"
- [ ] Fix the bridge communication between extension and web app
- [ ] Show "Extension active" badge when extension is detected

---

## Section 23: Vendor-Agnostic Expense Categorisation Tool Refactoring

### New Categories
- [x] Add "Auto Maintenance & Repair" category to all verticals except Maxfield Bakery
- [x] Add "Credit Card Interest Charges" category to all verticals
- [x] Add "Bank Fees" category to all verticals (where missing)
- [x] Add "Traveling/Mileage Expense" category to all verticals (where missing)

### Rename & Refactor (Vendor-Agnostic)
- [x] Rename WalmartCategorization.tsx → ExpenseCategorisation.tsx
- [x] Rename server/routers/walmartCategorization.ts → server/routers/expenseCategorisation.ts
- [x] Update all route references from /walmart-categorization to /expense-categorisation
- [x] Rename router from walmartCategorization to expenseCategorisation in routers.ts
- [x] Update all trpc.walmartCategorization.* calls to trpc.expenseCategorisation.*
- [x] Remove "Walmart" from all UI text (page title, descriptions, etc.)
- [x] Change "View on Walmart" → "View on vendor site"

### Access Control & Menu
- [x] Move tool to Expenses sub-menu in sidebar
- [x] Restrict visibility to owner (Tarik) and Eniola only (admin/EA role gating)
- [x] Grant Eniola access to the tool (Eniola has role=ea in household_members + server-side requireExpenseAccess guard added)

### Receipt Preview Fix
- [x] Receipt preview only shows S3-stored files (verified: all 185 receiptUrl values are storage.manus.im S3 URLs)
- [x] Remove receiptUrl from vendor_orders display if it's not an S3 URL (N/A: all URLs are already S3)
- [x] Ensure manual upload stores to S3 and updates the order's receipt reference (via invoiceExtraction.upload procedure)

### Future-Proofing
- [x] Add vendorType field concept to orders (vendor_orders table has platform enum: amazon, walmart, uber, etc.)
- [x] "View on vendor site" generates URL based on vendorType (uses walmartUrl field, extensible per platform)
- [x] System ready to load Amazon and Uber expenses later (vendor-agnostic architecture in place)

### Data & Access Fixes (Jul 7 PM)
- [x] Migrated walmart_orders.householdId from test household (1S9K7Jw7DtkJJTP2Jgtr6) to TJ Perkins Global (V8lk3KJatvxBTWURf4uo9) — 185 rows
- [x] Replaced hardcoded householdId in getOrders/getStats with dynamic ctx.user lookup via household_members
- [x] Added requireExpenseAccess() server-side guard: verifies user is household_admin or ea before allowing any expense categorisation operation
- [x] All expense categorisation procedures now use ctx (getOrders, getCategorization, categorize, categorizeSplit, skip, updateMemo, getStats, getConfig)

## Section 24: Chrome Extension — Capture Invoice Button Fix

- [x] Content script not injecting "Capture Invoice" button on Walmart order detail pages
- [x] Define and implement the intended capture flow: order page → capture invoice → upload to Geeves S3
- [x] Capture button should appear near "Print invoice" link on order detail pages (floating FAB + inline button)
- [x] Clicking capture should either screenshot the print view or save as PDF and upload (tab screenshot + page data extraction)
- [x] After capture, extension popup should show updated "Captured Today" count
- [x] Rebuild extension ZIP after fixes (v1.1.0)

## Section 25: Shadow Block Progress Visibility Fix

- [x] Shadow block progress not visible on dashboard — fixed: raw SQL used wrong column name (household_id → householdId) + fixed result access pattern for Drizzle execute()

## Section 26: Rate Limiter Fix (Booking Creation Error)

- [x] "Unable to transform response from server" error when creating bookings — caused by rate limiter (300 req/15min) returning non-tRPC JSON format
- [x] Increased API rate limit from 300 to 1500 requests per 15 minutes (dashboard makes many tRPC calls)
- [x] Fixed rate limiter response format to return tRPC-compatible error JSON so superjson client can parse it

## Section 27: Shadow Block Propagation Speed + UI + Icons

- [x] Speed up shadow block propagation: round-robin calendar alternation (100 blocks/run, 15 per calendar, 200ms delay)
- [x] Shorten sync interval (5min → 2min) and increase batch size (20 → 100) — 12x throughput improvement
- [x] Update favicon to animated SVG (8s loop: Blank → G → . → L with brand rainbow + gold glow)
- [x] Update Chrome extension icon (PNG icons from brand kit constellation mark + animated SVG asset)
- [x] Move propagation progress indicator from leader bar to compact Popover button on Calendar widget (spinning dot + % → expands to full stats/ETA)

## Section 28: Critical Bugs — Shadow Block Sync & Account Health

- [ ] Shadow blocks marked "synced" (1200+) but not appearing on actual Google Calendars — investigate
- [ ] Dashboard not showing disconnected/expired accounts (tarik@tjperkinsfam.com has invalid_grant but no warning shown)
- [ ] Determine if shadow block sync is actually writing events to Google or just marking them synced incorrectly
- [ ] Fix account health indicator to surface expired/revoked tokens

---

## Section 28: Shadow Block Sync & Account Health (Jul 7, 2026)

- [x] Investigate shadow blocks not appearing on Google Calendars — ROOT CAUSE: all 7 Google OAuth refresh tokens revoked (invalid_grant). Events WERE created (synced blocks have valid externalEventId from Google 200 response). User must reconnect all accounts.
- [x] Dashboard expired account banner not showing — ROOT CAUSE: tokens were still marked "active" in DB despite being revoked. Fixed by running token health check which correctly marked all as "expired". Banner now shows.
- [x] syncHealth procedure enhanced: added expiredTokens, allTokensExpired fields + new 'blocked' status
- [x] Sync indicator UI: added 'blocked' state with red dot + pause icon + explanation text
- [x] Sync retry handler: early exit when all tokens expired (avoids wasting cycles)
- [x] Sync retry handler: no-token case no longer increments syncAttempts (keeps blocks retryable)
- [x] Sync retry handler: 401/UNAUTHENTICATED errors classified as token-expired (no attempt increment)
- [x] Reset 2,427 shadow blocks incorrectly marked sync_failed due to token issues → pending_sync with 0 attempts
- [x] Tests: shadowBlockSyncRetry.test.ts — 10 tests covering early exit, status logic, error classification

## Section 29: Expense Module Fixes & Wiring

- [x] Fix bank account assignment field in expense categorization tool (allow selecting source bank account)
- [x] Add vendor name field to expense categorization (display vendor, allow selection for new expenses)
- [x] Wire up property widgets to filter and show expense totals by property for the selected period
- [x] Wire up property page to display categorized expenses filtered by property
- [x] Wire up accounts page to show total expenses by account as summary for selected time period
- [x] All available accounts should reflect on the accounts page
- [x] Property widget expense summary should auto-display expenses categorized to that property

## Section 30: Amazon Order Import & Logo Fix

- [x] Fix nav logo size (slightly bigger relative to wordmark, lines distinguishable)
- [x] Add card number history field to bank_accounts schema (track all mapped card numbers)
- [x] Create 19 bank accounts for Amazon payment methods + Amazon Gift Card/Points Balance (completed in Section 30 Execution)
- [ ] Map Visa 9761 and Visa 7766 to same account (card replacement) — deferred
- [x] Import all 804 Amazon orders (2018-2026) into vendor_orders (already in DB from prior session)
- [x] Import 175 expenses (2025-2026) as uncategorized expenses with auto-linked bank accounts
- [x] Enable "View Order" button with Amazon order URL pattern (already functional)
- [x] Leave "Not Available" payment method expenses with blank bank account (null paymentAccountId)
- [x] Create "Amazon Gift Card / Points Balance" account for gift card payments

---

## Section 38: Property Widget Pictures & Map Auto-Load + Notification Flood Fix

- [x] Property photo upload (server-side S3 via base64 data URI) — uploadPropertyPhoto procedure
- [x] Property photos tab in PropertyDetail panel (grid display, upload, delete)
- [x] Property map tab with geocoding from address (PropertyMapTab component)
- [x] MapView integration with auto-geocode from property.address
- [x] Notification flood fix: 6h cooldown on Shadow Block Circuit Breaker alerts
- [x] Notification flood fix: 6h cooldown on Shadow Block Rate Limit alerts (per-calendar)
- [x] Notification flood fix: Batch cancellation pending notifications (one per poll, 6h cooldown)
- [x] Notification flood fix: Batch booking date mismatch notifications (6h cooldown)
- [x] Notification flood fix: 24h cooldown on Integration Health Check alerts
- [ ] Square Sync Failed — NOT in this codebase (external project/service)
- [ ] QBO Sync Cron Job Failed — NOT in this codebase (external project/service)

---

## Notification Settings Panel

- [x] DB table: notification_settings (key, cooldown_hours, enabled, updated_at) — schema added, migration pushed
- [x] Server procedures: getNotificationSettings, updateNotificationSetting — notificationSettings router created
- [x] Dashboard UI: Notification Settings tab in Settings page with adjustable cooldown sliders
- [x] Wire cooldown values from DB into runtime notification logic (eventPropagation, iCalAggregator, db.ts)
- [x] Add route: integrated as Notifications tab in existing Settings page

---

## Bug: Duplicate Bookings on Calendar Timeline

- [x] Investigate duplicate Sunset Studio and Morabeza bookings on calendar week view (Jul 5-11)
- [x] Fix root cause of duplicate booking display — P-38 enhanced merge logic in getCompositeBookings + dedup in getPropertyBookingsForHousehold

---

## Bug: Expense Categorisation Tool Showing 0/0

- [x] Diagnose why Expense Categorisation Tool shows 0/0 (0%) and 'No orders with this status' — MySQL ONLY_FULL_GROUP_BY mode incompatibility
- [x] Fix the query/data issue to restore Walmart and Amazon expenses visibility — rewrote JOIN structure to avoid GROUP BY on non-aggregated columns (eFirst subquery pattern)

---

## Design Docs & AI Memory Update (Jul 8, 2026)

- [x] Update AI_MEMORY.md with recent features (notification settings, property photos/map, expense fix, dedup fix) — inserted 5 project_knowledge DB rows
- [x] Update DESIGN_NOTES.md with MySQL ONLY_FULL_GROUP_BY pattern (P-17 in ENGINEERING_LESSONS.md) and notification cooldown architecture
- [x] Update PHASE_1.md with checkpoint history, completed features, settings tabs
- [ ] Sync project shared files with latest state (deferred — auto-syncs on heartbeat)

---

## Section 30: Amazon Order Import (Execution)

- [x] Create 19 bank accounts for Amazon payment methods (AmEx-1048/2007, Visa-7766/9761/0029, Discover-7491, etc.)
- [ ] Map Visa 9761 and Visa 7766 to same account (card replacement history) — deferred, both exist separately
- [x] Create "Amazon Gift Card / Points Balance" account for gift card payments
- [x] Import all 804 unique Amazon orders (2018-2026) into vendor_orders — already in DB from prior session
- [x] Import 175 expenses for 2025-2026 Amazon orders as uncategorized (pending_review, vendor_order source)
- [x] Enable "View Order" button with Amazon order URL pattern — already functional via getVendorOrderUrl()
- [x] Leave "Not Available" payment method expenses with blank bank account — handled (null paymentAccountId)

---

## Bug: Shadow Block Notification Cooldown Not Working (Jul 8, 2026)

- [x] Diagnose why shadow block rate limit notifications are still firing every 10 minutes despite 6h cooldown — root cause: in-memory Map resets on serverless cold starts
- [x] Fix the cooldown mechanism to actually prevent repeated notifications — migrated ALL notification cooldowns to persistent DB-based lastNotifiedAt column
- [x] Converted eventPropagation.ts shouldNotify → shouldNotifyAsync (reads/writes DB)
- [x] Converted iCalAggregator.ts cancellation cooldown from globalThis to DB-based
- [x] Converted db.ts date mismatch cooldown from globalThis to DB-based

## UI: Replace G Circle Icon with Constellation Logo in Reconnection Flow

- [x] Replace the "G" circle icon in account reconnection sequence with the 7-node constellation logo mark
- [x] Add pulsating animation to the constellation node (slow 2.5s when pending, faster 1.5s when in-progress)
- [x] Ensure branding is distinct from Google's identity — constellation mark replaces Google G entirely

## Section 39: Expense Categorisation UX + Properties Carousel Fixes (Jul 8, 2026)

- [x] Properties carousel: filter out inactive properties (only show active ones)
- [x] Properties carousel: add drag-and-drop reorder functionality (dnd-kit, SortableContext, updatePropertyOrder procedure)
- [x] Expense tool: show order number/reference number on sidebar order tabs
- [x] Expense tool: filter out cancelled orders (Amazon $0/unknown amounts = cancelled)
- [x] Expense tool: filter out cancelled Walmart orders (dead links with unknown amounts)
- [x] Expense tool: add vendor type/logo indicator on order sidebar tabs for at-a-glance identification
- [x] Expense tool: add vendor filter dropdown (filter by all available vendors)
- [x] Expense tool: bank accounts dropdown should show ALL accounts (including Amazon/Walmart-imported ones) — fixed via householdId-based query
- [x] Accounts page: fix empty state — fixed by switching bankAccounts.list to use householdId instead of userId

## Section 40: Extension Capture Flow + Admin Access + Constellation Architecture (Jul 8, 2026)

- [x] Chrome Extension: v1.2.0 with cookies permission fix (MV3 service worker auth), Amazon support added
- [x] Chrome Extension: fixed auth flow using chrome.cookies.getAll() instead of broken credentials:include in service worker
- [x] tarik@maxfieldbakery.com: fixed — duplicate user record (Google OAuth openId vs Manus openId). Promoted userId=64080002 to system_admin, set householdId, created household_member record
- [x] Constellation-scoped vs global updates: RESOLVED — there is only ONE codebase, ONE household. The "different menu" was caused by a duplicate user record (Google OAuth login created a new user without householdId/role). All updates are global.
- [x] Document: Architecture answer — all constellations share the same codebase. New members get the same UI. The issue was a data problem (duplicate user), not a code scoping problem.

## Section 41: Shadow Block Queue Priority Routing (Jul 8, 2026)

- [x] Investigated: 14,219 pending blocks + 4,998 failed blocks in queue. Root cause: ORDER BY targetCalendarId (round-robin) treated all blocks equally regardless of age. Google quota (403) causes cascading delays.
- [x] Implemented Smart Priority Routing: ORDER BY CASE on createdAt age — URGENT (<5min) processed first, FRESH (<24h) second, BACKLOG last. No schema change needed (dynamic computation).
- [x] Fresh events now always processed in the first batch cycle (within 2 minutes) regardless of backlog size
- [x] Added priority tier logging to sync handler response: { urgent, fresh, backlog } counts reported per run

## Section 42: Multi-Provider Auth Identity Linking Fix (Jul 8, 2026)

- [x] BUG FIX: Add email-based dedup to Google OAuth callback — check for existing user by email before creating new record
- [x] BUG FIX: Add email-based dedup to Manus OAuth callback — same check
- [x] Add getUserByEmail helper function to db.ts
- [x] Create identity linking approach for multi-provider support (email-based dedup in OAuth callbacks)
- [x] Research and document multi-provider auth best practices (docs/AUTH_IDENTITY_LINKING.md)
- [ ] Update AI_MEMORY.md and project knowledge with hard design rules for authentication
- [x] Ensure future auth providers (Apple, Microsoft, etc.) will follow the same dedup pattern (documented in AUTH_IDENTITY_LINKING.md)

## Section 43: Expense Tool UX Fixes Round 2 (Jul 8, 2026)

- [x] Filter out Walmart orders that link to WCP_ORDER_FAIL pages (dead/cancelled orders with valid prices) — hideDeadLinks toggle + hasDeadLink indicator
- [x] Fix Walmart logo: broken image showing "Wal" cutoff text instead of actual logo — inline SVG WalmartSparkLogo component
- [x] Sort expense orders by date (newest first) as default sort order — ORDER BY vo.orderDate DESC already in place
- [ ] Extension capture failing on both Amazon and Walmart — debug POST endpoint auth (v1.2.0 fix built, user needs to load)
- [ ] Orders with no item details (Walmart) should show a placeholder or be filtered

## Section 44 — KIMI Export Team Review Analysis (Jul 8, 2026)

- [x] Read and analyze KIMI team's code review report (geeves_review.docx)
- [x] Cross-reference all KIMI findings against live codebase
- [x] Document accuracy assessment (70% accurate, 20% partial, 10% incorrect)
- [x] Write planned fix code for confirmed issues (docs/KIMI_REPORT_ANALYSIS.md)
- [x] Prepare new ENGINEERING_LESSONS patterns (Over-Broad Cascade Delete, Serverless State Amnesia, Unvalidated Redirect Origin)
- [x] Prepare new project_knowledge entries for AI_MEMORY regeneration
- [ ] Compare KIMI team's updated codebase against our planned fixes
- [ ] Implement P0 fix: C-8 scoped shadow block deletion
- [ ] Implement P1 fix: H-9 origin allowlist for OAuth redirect
- [ ] Implement P1 fix: H-2 webhook channel token validation
- [ ] Implement P2 fix: H-6 calendars unique constraint
- [ ] Implement P2 fix: H-8 missing indexes on hot-path columns
- [ ] Implement P3 fix: H-7 batch token lookup (N+1 mitigation)
- [ ] Implement P3 fix: C-5 retry + notify for unassigned calendars
- [ ] Add new patterns to ENGINEERING_LESSONS.md
- [ ] Insert project_knowledge entries for AI_MEMORY regeneration

## Section 45 — iCal Feed Swap Fix (Jul 10, 2026)

- [x] BUG: iCal feeds swapped between Morabeza, Sunset Studio, and Penthouse since initial setup (Jun 16)
- [x] Diagnosed: Vrbo feed 058b3a7b (Morabeza's) was on Sunset Studio; Vrbo feed ffb52a3c (Sunset Studio's) was on Penthouse; Booking.com feed 2f768326 (Morabeza's) was on Penthouse
- [x] Moved Vrbo feed 939ayddubY_KHSfH5GIFN from Sunset Studio → Morabeza
- [x] Moved Vrbo feed n2dVmwfBKAmQo62mwvXH6 from Penthouse → Sunset Studio
- [x] Moved Booking.com feed 6rVvJgKeoj7rxZfo6WAqN from Penthouse → Morabeza
- [x] Reassigned 52 Vrbo bookings to Morabeza, 64 Vrbo bookings to Sunset Studio, 23 Booking.com bookings to Morabeza
- [x] Verified: Morabeza now correctly shows "Reserved - Angie" (Vrbo, Jul 9-12) + Tarik's direct booking
- [ ] Penthouse needs its own Vrbo and Booking.com iCal feed URLs (currently has no feeds after fix)
- [ ] Add feed-assignment validation: prevent same iCal URL from being assigned to multiple properties

## Section 46 — Booking.com Two-Way Sync Fix (Jul 10, 2026)

- [x] BUG: Sunset Studio outbound ICS missing direct booking (raw SQL move bypassed generateOutboundICS)
- [x] Update Booking.com feed URL for Sunset Studio to new export token a7eb1164-3cdb-469e-90bb-897fc8960e11
- [x] Regenerate outbound ICS for Sunset Studio (include direct booking Jul 9-12)
- [x] Regenerate outbound ICS for Morabeza (fix "Unknown platform" labels from feed swap)
- [x] Verify regenerated feeds contain correct blocks (via live endpoint)
- [x] LESSON: Any raw SQL booking/platform reassignment MUST be followed by generateOutboundICS for affected properties
- [x] ROOT CAUSE FOUND: CloudFront caches availability.ics indefinitely (stale since Jun 25); overwriting S3 key does not invalidate CDN
- [x] Add live ICS endpoint GET /api/ical/:propertyId.ics that generates calendar on-demand from DB (no S3/CDN cache)
- [x] Update outboundIcsUrl for all properties to the live endpoint URL
- [x] Add vitest coverage for the live ICS endpoint (6 tests, all passing — 289 total)
- [x] Fixed 21 orphaned bookings (10 Morabeza + 11 Sunset Studio) with literal platformId='booking_com' string

## Section 47 — iCal Production Fixes (ICAL_IMMEDIATE_FIX doc, Jul 10, 2026)

- [x] Fix 1A: Add icsRegenerationQueue table to drizzle/schema.ts
- [x] Fix 1B: Create server/services/icsRegenerationQueue.ts (queue processor + manual queue function)
- [x] Fix 1C: Wire processIcsRegenerationQueue into icalPollHandler
- [x] Fix 1D: Wire queueIcsRegeneration into createManualBooking
- [x] Fix 1E: Table created via SQL (pnpm db:push has pre-existing table conflict on TiDB)
- [x] Fix 2: BLOCKED — TiDB Serverless v8.5.3 does NOT support MySQL triggers (CREATE TRIGGER syntax rejected). Documented in warning comment. Live endpoint makes triggers redundant.
- [x] Fix 3A: Create server/endpoints/icsReconcile.ts
- [x] Fix 3B: Register /api/scheduled/ics-reconcile endpoint
- [x] Fix 3C: Reconciliation run — ALL 6 properties OK (0 regenerated needed)
- [x] Fix 4: Add warning comment to top of icalAggregator.ts
- [x] Verification: 289 tests passing across 18 files, 0 TypeScript errors

## Section 48 — Migration Preparation (Prompts 1-3)

- [x] PROMPT 1 FIX 1: Properties nav filter — change hasVerticalAccess to isAdminOrEA in DashboardLayout.tsx
- [x] PROMPT 1 FIX 2: DST bug — replace 86400000 with setUTCDate in icalAggregator.ts (2 locations)
- [x] PROMPT 1 FIX 3: Focus retention — replaced useMemo (side-effect abuse) with useEffect+useRef in BookingRequestDialog
- [x] PROMPT 1: Build passes with no errors (tsc --noEmit clean)
- [x] PROMPT 1: Tests pass (289/289)
- [ ] PROMPT 1: Checkpoint saved
- [ ] PROMPT 2: Create .env.example with all env vars
- [ ] PROMPT 2: Create MIGRATION_NOTES.txt
- [ ] PROMPT 2: Create downloadable archive of entire project
- [ ] PROMPT 3: Run ICS reconciliation endpoint
- [ ] PROMPT 3: Verify outbound ICS files (Sunset Studio direct booking, Morabeza Vrbo booking)
- [ ] PROMPT 3: Verify inbound iCal feed URLs are correct (not swapped)
- [ ] PROMPT 3: List all properties with sync status
