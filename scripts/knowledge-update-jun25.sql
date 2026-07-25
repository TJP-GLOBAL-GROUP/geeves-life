-- Knowledge Base Update — June 25, 2026
-- Covers all major features built Jun 17–25 not yet in project_knowledge
-- Run via: webdev_execute_sql or Database panel

-- ─── Authentication Architecture ─────────────────────────────────────────────

INSERT INTO project_knowledge (category, `key`, value, sourceDoc, lastReviewedAt, updatedAt)
VALUES
('architecture', 'auth_google_only',
 'Manus OAuth has been fully removed (Jun 24, 2026). Google OAuth is the sole authentication method. Login at /login triggers Google OAuth; callback at /api/oauth/google/callback. JWT session cookie set on success. All Manus OAuth routes, SDK calls, and UI references removed.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

('architecture', 'auth_incremental_scopes',
 'Incremental auth model (Jun 25, 2026): login requests identity scopes only (openid email profile). Calendar sync scopes (https://www.googleapis.com/auth/calendar) and gmail.send scope are requested separately via the connect-account flow in Settings → Integrations. This follows Google OAuth best practices.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

('architecture', 'auth_csrf_nonce',
 'CSRF nonce added to all three OAuth flows (login, connect-account, reconnect). State parameter now encodes: origin + returnPath + nonce. Nonce stored in session cookie, verified on callback. Prevents CSRF attacks on OAuth flows.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

('architecture', 'auth_token_refresh_failure',
 'Token refresh failure now marks oauth_tokens.status = expired in DB and throws immediately. The previous stale-token fallback (using expired access tokens) has been removed. Expired tokens surface as reconnect prompts in Settings → Integrations.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

('architecture', 'auth_google_revoke_on_logout',
 'Google tokens are revoked non-blocking on logout (fire-and-forget fetch to accounts.google.com/o/oauth2/revoke). JWT cookie is cleared synchronously. Revocation failure does not block logout.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

('architecture', 'jwt_secret_fatal',
 'JWT_SECRET absence now throws a fatal startup error (process.exit(1)) instead of falling back to a zero-key. This prevents silent insecure deployments.',
 'docs/OAUTH_AUDIT.md', NOW(), NOW()),

-- ─── Security ────────────────────────────────────────────────────────────────

('architecture', 'security_oauth_token_encryption',
 'OAuth tokens encrypted at rest using AES-256-GCM. Key derived from JWT_SECRET via SHA-256. Implementation: server/tokenEncryption.ts. All db.ts OAuth helpers encrypt on write and transparently decrypt on read. Legacy plaintext rows decoded gracefully.',
 'docs/SECURITY_ASSESSMENT.md', NOW(), NOW()),

('architecture', 'security_helmet_csp',
 'HTTP security headers via helmet.js: Content-Security-Policy (strict, allows Google APIs and Maps), X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, HSTS (production only), COEP disabled for Google Maps compatibility.',
 'docs/SECURITY_ASSESSMENT.md', NOW(), NOW()),

('architecture', 'security_rate_limiting',
 'Rate limiting via express-rate-limit: 300 req/15min on /api/trpc, 20 req/15min on /api/oauth. Returns 429 with Retry-After header.',
 'docs/SECURITY_ASSESSMENT.md', NOW(), NOW()),

('architecture', 'security_household_isolation',
 'Household isolation helpers in server/auth/householdIsolation.ts: assertHouseholdOwnership, assertResourceBelongsToHousehold, assertSuperAdminReassignment. All property mutations (create/update/delete/addPlatform/deletePlatform/setBookingOverride) use these guards. Only superAdmin.resources.reassignProperty can change householdId (requires "REASSIGN HOUSEHOLD" phrase + audit log).',
 'docs/SECURITY_ASSESSMENT.md', NOW(), NOW()),

('architecture', 'security_audit_log',
 'audit_log table: bigint PK, actor, household, action, category, resourceType, resourceId, outcome, metadata, ipAddress, userAgent, createdAt. writeAuditLog/getAuditLog/countAuditLog helpers in db.ts. securityRouter with audit.list, audit.export, gdpr.exportData, gdpr.deleteAccount procedures.',
 'docs/SECURITY_ASSESSMENT.md', NOW(), NOW()),

-- ─── Member Permissions & Access Control ─────────────────────────────────────

('architecture', 'member_permissions_page',
 'MemberPermissions.tsx page (Sprint v2.13, Jun 20): replaces VerticalAccessMatrix. Features: member selector, vertical filter, collapsible RBAC action permission groups with per-member override badges and reset buttons, per-vertical data visibility section, EA Delegation toggle (HA-only). Route: /member-permissions.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'member_permission_overrides_table',
 'member_permission_overrides DB table: stores per-member permission overrides keyed by (memberId, permission). eaCanManageAccess column added to household_members. accessControl router with 7 procedures: getMyEffectivePermissions, getMemberPermissions, setPermissionOverride, resetPermissionOverride, getEaDelegation, setEaDelegation, listAllMemberPermissions.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'rbac_ea_invite',
 'EA role can now invite household members. household.invite permission added to EA role in rbac.ts. Invite button in Household.tsx uses canInvite from getMyEffectivePermissions.',
 'docs/PHASE_1.md', NOW(), NOW()),

-- ─── Landing Page & Public Routes ────────────────────────────────────────────

('architecture', 'landing_page',
 'Public landing page at / (LandingPage.tsx). Features: hero section, feature highlights, beta signup ICP form (stored in beta_signups table), contact form (stored in contact_messages table). Dashboard moved to /dashboard. All post-login redirects updated. Standalone login at /login.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'super_admin_beta_signups',
 'Super Admin panel has Beta Signups and Contact Messages tabs. beta_signups and contact_messages tables in DB. Procedures: superAdmin.betaSignups.list, superAdmin.contactMessages.list.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'legal_pages',
 'Legal pages added (Jun 24): Privacy Policy at /privacy and Terms of Service at /terms. Linked from landing page footer. Static content, no DB dependency.',
 'docs/PHASE_1.md', NOW(), NOW()),

-- ─── Settings & Integrations ─────────────────────────────────────────────────

('architecture', 'settings_integrations_tab',
 'Settings Integrations tab (Sprint v2.11, Jun 20): account management moved from Calendars tab. Each Google account has a purposes field: calendar_sync, email_scraping, notes, tasks, gmail_send. Add Account flow shows purpose picker before OAuth. googleAccountConnect.ts only auto-discovers calendars when calendar_sync is in purposes.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'settings_subscription_tab',
 'Settings Plan tab (SubscriptionTab, Jun 25): admin-only. Shows plan (free/premium/trialing), status (active/trialing/past_due/cancelled/paused), seats used/total with progress bar, add-ons list, billing contact, Stripe customer ID. Reads from household.getMyHousehold subscription field. subscriptions DB table with plan, status, seatsIncluded, seatsAdditional, seatsUsed, addOns (JSON), billingEmail, stripeCustomerId, currentPeriodEnd.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'settings_non_destructive_reconnect',
 'Non-destructive account reconnect flow (Sprint v2.14, Jun 23): reconnecting a Google account preserves all existing calendars, events, and shadow blocks. getOAuthTokenByEmail returns any status (including expired/revoked) so reconnect URL can be generated. Callback uses reconnect_success param instead of connect_success. Settings detects reconnect_success and shows toast.',
 'docs/PHASE_1.md', NOW(), NOW()),

-- ─── Booking.com Email Enrichment ────────────────────────────────────────────

('architecture', 'booking_email_scraper',
 'bookingEmailScraper.ts service (Jun 19): searches Gmail for Booking.com confirmation emails. Parses guest name, confirmation number, check-in/check-out, total price, commission, net payout, currency. 2-year lookback on first run or email change; incremental thereafter. Enriches existing property_bookings rows by date overlap; creates new rows for unmatched emails.',
 'docs/BOOKING_ENRICHMENT.md', NOW(), NOW()),

('architecture', 'booking_financial_fields',
 'property_bookings table extended with: totalPrice, commissionAmount, netAmount, currency, confirmationNumber. property_platforms extended with: notificationEmail, emailScrapingEnabled, lastEmailScrapedAt, emailNotificationEmailPrev. getRevenueSummary procedure returns total revenue, commission, net payout.',
 'docs/BOOKING_ENRICHMENT.md', NOW(), NOW()),

('architecture', 'booking_ical_confirmed',
 'Booking.com iCal blocks now treated as confirmed bookings (not unavailable). fetchAndParseICal accepts platform param; booking_com always sets bookingType=booking and normalises summary to "Booking.com Reservation". 12 existing DB rows migrated.',
 'docs/BOOKING_ENRICHMENT.md', NOW(), NOW()),

-- ─── Calendar & Sync Architecture ────────────────────────────────────────────

('architecture', 'service_account_removed',
 'Google Workspace service account architecture fully removed (Jun 19). Removed: WORKSPACE_DOMAINS, isWorkspaceDomain, isServiceAccountConfigured, getServiceAccountToken, autoSyncWorkspaceCalendars from all server files. 48 google_workspace DB rows migrated to google_personal. All accounts now use per-account OAuth.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'shadow_block_propagation_architecture',
 'Shadow block propagation: eventPropagation.ts creates shadow_blocks rows in DB (always) and writes blocker events to target Google Calendars (best-effort). shadow_blocks_source_target_uniq UNIQUE constraint (sourceEventId, targetCalendarId) prevents duplicates. ER_DUP_ENTRY handled with UPDATE fallback. isShadowBlock column on events table prevents re-propagation of shadow events.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'duplicate_calendar_prevention',
 'autoDiscoverCalendarsForAccount now checks existingExternalIds across the full household (not just the requesting member). Prevents duplicate calendar records when the same Google account is reconnected under a different memberId.',
 'docs/PHASE_1.md', NOW(), NOW()),

('architecture', 'ical_date_parsing_rule',
 'CRITICAL: iCal DTSTART/DTEND values in YYYY-MM-DD format (all-day events) must be parsed as LOCAL midnight, not UTC. Use new Date(dateStr + "T00:00:00") not new Date(dateStr). Google Calendar end.date is exclusive (checkout day = last night + 1 day). All Gantt rendering uses UTC ISO date string keys (toISOString().slice(0,10)) to avoid EDT timezone drift.',
 'docs/AI_MEMORY.md', NOW(), NOW()),

-- ─── Hardware & Connectivity Strategy ────────────────────────────────────────

('architecture', 'hardware_philosophy',
 'BYOD-first principle: Geeves runs on existing devices first. Hardware line (future): Geeves Node (Raspberry Pi 5 hub), Geeves Panel (wall-mounted display), Geeves Display (smart display), Geeves Auto (car head unit). Works-with-Geeves programme for third-party devices.',
 'docs/HARDWARE_PHILOSOPHY.md', NOW(), NOW()),

('architecture', 'connectivity_strategy',
 'Tailscale/WireGuard/Headscale mesh VPN for household device connectivity. WiFi bridge stack for legacy devices. Virtual desktop for constellation members. 150k-scale cost model documented. Geeves Auto head unit roadmap.',
 'docs/CONNECTIVITY_STRATEGY.md', NOW(), NOW()),

-- ─── Email Delivery ───────────────────────────────────────────────────────────

('architecture', 'email_delivery_resend',
 'Email delivery priority order (Jun 25): (1) Resend API (branded invites@geeves.life) when RESEND_API_KEY env var is set — 100 emails/day free tier; (2) Gmail API fallback using admin OAuth token with gmail.send scope; (3) mailto: fallback with clipboard copy. sendEmailViaResend() in server/services/gmailSend.ts. SendEmailResult.method: "resend_api" | "gmail_api" | "fallback_mailto".',
 'docs/PHASE_1.md', NOW(), NOW()),

-- ─── Node Design Language ─────────────────────────────────────────────────────

('design_rule', 'geeve_node_component',
 'GeeveNode shared component (client/src/components/GeeveNode.tsx): closed filled circle = online/confirmed, open circle = active/invited/in-progress, open amber = warning/invited. Used in: Constellation member badges, property Gantt check-in/out nodes, calendar status indicators, platform feed sync status, booking request status.',
 'docs/GLOBAL_DESIGN.md', NOW(), NOW()),

-- ─── Performance ─────────────────────────────────────────────────────────────

('architecture', 'performance_ical_dedup',
 'iCal performance: removed duplicate getPropertyBookingsForHousehold sequential call (was fetched twice per calendar load). Added expiresAt check to getAccessTokenForCalendar — eliminates unnecessary Google token refresh network calls on every webhook sync.',
 'docs/PERFORMANCE.md', NOW(), NOW()),

('architecture', 'performance_calendar_skeletons',
 'Calendar loading UX: CalendarSkeletonTimeGrid, CalendarSkeletonMonth, CalendarSkeletonGantt components mirror actual layout structure. Teal shimmer progress bar at top of calendar body during refetch/navigation (isFetching && !isLoading).',
 'docs/PERFORMANCE.md', NOW(), NOW()),

-- ─── Phase Status Update ──────────────────────────────────────────────────────

('phase_status', 'current_sprint',
 'Current sprint: Jun 25, 2026. Phase 1 is 95% complete. Remaining Phase 1 items: event-level shadow overrides UI, family member interfaces (child/elder views), booking request flow UI, Asana/Google Keep integration stubs. All security hardening, auth overhaul, properties enrichment, and settings work is complete.',
 'docs/PHASE_1.md', NOW(), NOW()),

('phase_status', 'checkpoint_jun25',
 'Latest checkpoint: 73b44d55 (Jun 25, 2026) — Subscription Management tab (SubscriptionTab in Settings → Plan), TypeScript error fix, Resend email stub, Walmart order parsing improvement, subscription contract tests, Walmart normalisation tests.',
 'docs/PHASE_1.md', NOW(), NOW());
