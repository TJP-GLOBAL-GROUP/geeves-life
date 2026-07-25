/**
 * seed-db-knowledge-full.mjs
 * Seeds all remaining DB table definitions into project_knowledge.
 * Run: node scripts/seed-db-knowledge-full.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const entries = [
  // ── Core identity tables ──────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'users',
    value: JSON.stringify({
      table: 'users',
      purpose: 'Platform identity record created on first Manus OAuth login. One row per authenticated user.',
      keyColumns: {
        id: 'int PK autoincrement — numeric user ID used as FK in most tables',
        openId: 'varchar(64) unique — Manus OAuth subject identifier',
        email: 'varchar(320) — email from OAuth provider',
        role: 'enum(user, system_admin) — platform-level role; system_admin = SuperAdmin access',
        householdId: 'varchar(36) — FK to households.id; set when user joins/creates a household',
        memberId: 'varchar(36) — FK to household_members.id; set when user joins/creates a household',
        deviceTimezone: 'varchar(64) — IANA timezone updated on every login/app load',
        deviceCity: 'varchar(128) — resolved from geolocation (optional)',
      },
      relationships: [
        'users.householdId → households.id (the household this user belongs to)',
        'users.memberId → household_members.id (the member record for this user)',
        'household_members.userId → users.id (inverse join)',
      ],
      notes: 'A user with householdId=null has not yet created or joined a household. A household_member with userId=null is invited but has not yet completed OAuth.',
    }),
    sourceDoc: 'drizzle/schema.ts:7-25',
    notes: 'Core identity table — do not confuse with household_members which is the constellation role record',
  },
  {
    category: 'db_schema',
    key: 'households',
    value: JSON.stringify({
      table: 'households',
      purpose: 'The top-level multi-tenant unit. Everything in Geeves.Life belongs to a household. Called a "constellation" in the UI.',
      keyColumns: {
        id: 'varchar(36) PK — nanoid',
        name: 'varchar(255) — household display name',
        createdByUserId: 'int — audit only; does NOT grant special privileges',
        wakeWord: 'varchar(100) default "Geeves" — AI assistant wake word',
        timezone: 'varchar(100) default "America/New_York" — IANA timezone for the constellation',
        groupName: 'varchar(100) default "Household" — how the household refers to itself (e.g. Constellation, Village, Team)',
        eaCanManageAccess: 'boolean default true — whether EA role can edit member permissions',
      },
      relationships: [
        'household_members.householdId → households.id',
        'calendars.householdId → households.id',
        'verticals.householdId → households.id',
        'properties.householdId → households.id',
        'events.householdId → households.id',
      ],
      notes: 'groupName is displayed in the sidebar and member-facing UI instead of "household". Current value for the Perkins constellation: "Constellation".',
    }),
    sourceDoc: 'drizzle/schema.ts:260-278',
    notes: 'Top-level tenant boundary — all data is scoped to householdId',
  },
  {
    category: 'db_schema',
    key: 'household_members',
    value: JSON.stringify({
      table: 'household_members',
      purpose: 'Constellation role record. Exists for every person in the household, whether or not they have a Geeves.Life account yet.',
      keyColumns: {
        id: 'varchar(36) PK — nanoid; this is the memberId used throughout the app',
        householdId: 'varchar(36) FK → households.id',
        userId: 'int nullable FK → users.id — null if invited but not yet joined',
        displayName: 'varchar(255) — constellation-assigned name (primary display name)',
        googleName: 'varchar(255) — name from Google account (shown as alias to admins)',
        email: 'varchar(320) — invite email',
        role: 'enum(household_admin, ea, member, caregiver, child, elder)',
        status: 'enum(invited, active, inactive, removed)',
        geevesAccess: 'boolean default true — whether member can use Geeves AI assistant',
        pendingVerticals: 'json array of verticalIds to assign on invite claim',
        inviteToken: 'varchar(128) — one-time invite token',
        accessibilityMode: 'enum(standard, picture_board, large_text, voice_only)',
      },
      relationships: [
        'household_members.userId → users.id (null until invite claimed)',
        'household_members.householdId → households.id',
        'calendars.memberId → household_members.id',
        'vertical_member_access.memberId → household_members.id',
      ],
      notes: 'userId=null is normal for invited-but-not-yet-joined members. Do not treat null userId as an error.',
    }),
    sourceDoc: 'drizzle/schema.ts:280-316',
    notes: 'The constellation role record — distinct from users table which is the OAuth identity',
  },
  // ── Calendar system ───────────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'verticals',
    value: JSON.stringify({
      table: 'verticals',
      purpose: 'A named life domain (e.g. Personal, Work, Properties, Family). Calendars are assigned to verticals. Shadow blocking propagates across verticals based on vertical_visibility rules.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        name: 'varchar(255)',
        icon: 'varchar(100) — emoji or icon name',
        color: 'varchar(20) — hex color',
        privacyLevel: 'enum(household, admin_only, private) — who can see this vertical',
        busyLabel: 'varchar(50) default "Busy" — label shown on shadow blocks from this vertical',
        sortOrder: 'int default 0',
      },
      relationships: [
        'calendars.verticalId → verticals.id',
        'vertical_visibility.fromVerticalId / toVerticalId → verticals.id',
        'vertical_member_access.verticalId → verticals.id',
        'properties.verticalId → verticals.id',
      ],
    }),
    sourceDoc: 'drizzle/schema.ts:318-335',
    notes: 'Verticals are the primary organizational unit for calendar data',
  },
  {
    category: 'db_schema',
    key: 'events',
    value: JSON.stringify({
      table: 'events',
      purpose: 'All calendar events — synced from Google, manually created, or shadow-generated. Single source of truth for the calendar view.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        calendarId: 'varchar(36) FK → calendars.id',
        externalId: 'varchar(500) — Google Calendar event ID',
        startTime: 'bigint — UTC milliseconds since epoch',
        endTime: 'bigint — UTC milliseconds since epoch',
        isAllDay: 'boolean',
        source: 'enum(sync, manual, voice, import, shadow) — how the event was created',
        isShadowBlock: 'boolean default false — prevents re-propagation of shadow events synced back from Google',
        status: 'enum(confirmed, tentative, cancelled)',
        visibility: 'enum(default, public, private, confidential)',
        recurrenceRule: 'text — RRULE string',
        attendees: 'json',
        etag: 'varchar(255) — Google etag for incremental sync',
      },
      indexes: [
        'events_household_time_idx ON (householdId, startTime, endTime)',
        'events_calendar_start_idx ON (calendarId, startTime)',
      ],
      notes: 'All times stored as UTC milliseconds. Frontend converts to local timezone for display.',
    }),
    sourceDoc: 'drizzle/schema.ts:366-397',
  },
  {
    category: 'db_schema',
    key: 'shadow_blocks',
    value: JSON.stringify({
      table: 'shadow_blocks',
      purpose: 'Cross-vertical busy-time blocks. When an event in vertical A propagates to vertical B, a shadow_block row is created. The shadow block is written to Google Calendar as a "Busy" event.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        sourceEventId: 'varchar(36) FK → events.id — the original event',
        sourceCalendarId: 'varchar(36) FK → calendars.id',
        targetCalendarId: 'varchar(36) FK → calendars.id — the calendar receiving the busy block',
        maskedTitle: 'varchar(500) default "Busy" — title shown on the shadow block',
        startTime: 'bigint — cached from source event',
        endTime: 'bigint — cached from source event',
        isDismissed: 'boolean — soft-delete; dismissed blocks are not shown',
        externalEventId: 'varchar(500) — Google Calendar event ID of the written shadow block',
      },
      uniqueConstraint: 'shadow_blocks_source_target_uniq ON (sourceEventId, targetCalendarId)',
      notes: 'externalEventId is set after the shadow block is written to Google Calendar. NULL means not yet written (pending write-back).',
    }),
    sourceDoc: 'drizzle/schema.ts:399-420',
  },
  {
    category: 'db_schema',
    key: 'vertical_visibility',
    value: JSON.stringify({
      table: 'vertical_visibility',
      purpose: 'Cross-vertical shadow block rules. Defines how much of vertical A is visible to vertical B.',
      keyColumns: {
        id: 'varchar(36) PK',
        fromVerticalId: 'varchar(36) FK → verticals.id — the source vertical',
        toVerticalId: 'varchar(36) FK → verticals.id — the target vertical',
        visibilityLevel: 'enum(none, busy_only, full) — none=free, busy_only=opaque block, full=full event details',
        busyLabel: 'varchar(50) default "Busy" — custom label for busy_only blocks',
        calendarExclusions: 'json array of calendarIds excluded from shadow propagation by default',
      },
      notes: 'Default visibility between any two verticals is busy_only if no rule exists. none means events are invisible (shows as free time) — use with caution.',
    }),
    sourceDoc: 'drizzle/schema.ts:593-609',
  },
  {
    category: 'db_schema',
    key: 'oauth_tokens',
    value: JSON.stringify({
      table: 'oauth_tokens',
      purpose: 'Per-member Google OAuth tokens for calendar sync, email scraping, and other Google API access.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        memberId: 'varchar(36) FK → household_members.id',
        provider: 'varchar(50) — e.g. "google"',
        accountEmail: 'varchar(320) — the Google account email',
        accessToken: 'text — encrypted at rest',
        refreshToken: 'text — encrypted at rest',
        expiresAt: 'bigint — UTC milliseconds',
        purposes: 'json array of string — e.g. ["calendar_sync", "email_scraping"]',
        status: 'enum(active, expired, revoked)',
      },
      notes: 'Multiple rows per member are allowed (one per connected Google account). Route calendar API calls by accountEmail to the correct token row.',
    }),
    sourceDoc: 'drizzle/schema.ts:495-517',
  },
  // ── Properties system ─────────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'property_bookings',
    value: JSON.stringify({
      table: 'property_bookings',
      purpose: 'Parsed booking records from iCal feeds and email scraping. One row per booking/block per platform.',
      keyColumns: {
        id: 'varchar(36) PK',
        propertyId: 'varchar(36) FK → properties.id',
        platformId: 'varchar(36) FK → property_platforms.id',
        icalUid: 'varchar(500) — UID from iCal VEVENT; used for deduplication',
        bookingType: 'enum(booking, block, unavailable)',
        checkIn: 'bigint — UTC milliseconds',
        checkOut: 'bigint — UTC milliseconds',
        guestName: 'varchar(255) — from email scraping',
        totalPrice: 'decimal(12,2) — gross booking value',
        commissionAmount: 'decimal(12,2) — platform fee',
        netAmount: 'decimal(12,2) — what owner receives',
        scrapeConfidence: 'int 0-100 — email scrape confidence score',
        hasConflict: 'boolean — set when booking overlaps another platform',
      },
      indexes: [
        'pb_propertyId_checkIn_idx ON (propertyId, checkIn)',
        'pb_platformId_idx ON (platformId)',
        'pb_icalUid_idx ON (icalUid)',
      ],
    }),
    sourceDoc: 'drizzle/schema.ts:709-763',
  },
  {
    category: 'db_schema',
    key: 'property_platforms',
    value: JSON.stringify({
      table: 'property_platforms',
      purpose: 'iCal feed sources for a property. One row per platform (Airbnb, VRBO, Booking.com, etc.).',
      keyColumns: {
        id: 'varchar(36) PK',
        propertyId: 'varchar(36) FK → properties.id',
        platform: 'enum(airbnb, vrbo, booking_com, direct, zillow, apartments_com, other)',
        icalUrl: 'text — inbound iCal URL from the platform',
        notificationEmail: 'varchar(320) — email where platform sends booking confirmations',
        emailScrapingEnabled: 'boolean default false',
        lastPolledAt: 'bigint — last successful iCal poll timestamp',
        isActive: 'boolean default true',
      },
    }),
    sourceDoc: 'drizzle/schema.ts:662-688',
  },
  // ── RBAC / permissions ────────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'vertical_member_access',
    value: JSON.stringify({
      table: 'vertical_member_access',
      purpose: 'Fine-grained per-member access control for a specific vertical. Overrides the coarse household-level vertical visibility.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        verticalId: 'varchar(36) FK → verticals.id',
        memberId: 'varchar(36) FK → household_members.id',
        accessLevel: 'enum(full, read_only, blind, none)',
        calendarAccess: 'enum(availability_only, default_vertical, blind, read_write)',
        allowedCalendarIds: 'json array — empty = all calendars in the vertical',
        canRequestMeetings: 'boolean default true',
        excludeMultiDayEvents: 'boolean default false — use for children who should not see long all-day events',
      },
      uniqueConstraint: 'vma_member_vertical_uniq ON (memberId, verticalId)',
    }),
    sourceDoc: 'drizzle/schema.ts:905-939',
  },
  {
    category: 'db_schema',
    key: 'member_permission_overrides',
    value: JSON.stringify({
      table: 'member_permission_overrides',
      purpose: 'Per-member RBAC permission overrides on top of the role baseline. granted=true adds a permission; granted=false removes one.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        memberId: 'varchar(36) FK → household_members.id',
        permission: 'varchar(100) — must match a value in the Permission union type in rbac.ts',
        granted: 'boolean — true=grant, false=revoke',
        configuredByMemberId: 'varchar(36) — who set this override',
      },
      uniqueConstraint: 'mpo_member_perm_uniq ON (memberId, permission)',
      notes: 'Effective permission = role baseline + overrides (overrides win). See server/rbac.ts for the full permission list.',
    }),
    sourceDoc: 'drizzle/schema.ts:1091-1111',
  },
  // ── Audit / operational ───────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'audit_log',
    value: JSON.stringify({
      table: 'audit_log',
      purpose: 'Append-only structured audit trail for security-relevant actions. Never updated or deleted.',
      keyColumns: {
        id: 'bigint PK autoincrement',
        actorUserId: 'int nullable FK → users.id',
        actorEmail: 'varchar(320)',
        householdId: 'varchar(36) nullable',
        action: 'varchar(128) — e.g. "calendar.delete", "member.invite"',
        category: 'varchar(64) — e.g. "calendar", "auth", "property"',
        resourceType: 'varchar(64) nullable',
        resourceId: 'varchar(128) nullable',
        outcome: 'enum(success, failure, denied)',
        metadata: 'json — request params, before/after state',
        ipAddress: 'varchar(64)',
      },
    }),
    sourceDoc: 'drizzle/schema.ts:817-848',
  },
  {
    category: 'db_schema',
    key: 'project_knowledge',
    value: JSON.stringify({
      table: 'project_knowledge',
      purpose: 'Persistent store of brand, design, and architectural decisions. AI agents MUST read this table at session start. A 24h heartbeat job reviews and regenerates docs/AI_MEMORY.md from this table.',
      keyColumns: {
        id: 'int PK autoincrement',
        category: 'varchar(64) — e.g. "db_schema", "brand", "design", "architecture"',
        key: 'varchar(128) — unique within category',
        value: 'text — the knowledge content (often JSON)',
        sourceDoc: 'varchar(256) — file path or URL this knowledge was derived from',
        notes: 'text — additional context for AI agents',
        lastReviewedAt: 'timestamp — when a human or heartbeat last reviewed this entry',
      },
    }),
    sourceDoc: 'drizzle/schema.ts:782-794',
  },
  {
    category: 'db_schema',
    key: 'project_tasks',
    value: JSON.stringify({
      table: 'project_tasks',
      purpose: 'DB-driven task tracker that extends project_knowledge. Every feature, bug, and deferred item from todo.md lives here. The knowledge-review heartbeat syncs todo.md → this table.',
      keyColumns: {
        id: 'int PK autoincrement',
        phase: 'varchar(32) — sprint/phase label',
        area: 'varchar(64) — feature area (e.g. "calendar", "properties")',
        bucket: 'varchar(128) — sub-area or sprint bucket',
        title: 'varchar(512) — task description',
        titleHash: 'varchar(64) — SHA-256(title) for idempotent upserts',
        status: 'enum(todo, in_progress, done, deferred, blocked)',
        priority: 'enum(critical, high, medium, low)',
      },
      uniqueConstraint: 'project_tasks_title_hash_idx ON (titleHash)',
    }),
    sourceDoc: 'drizzle/schema.ts:855-882',
  },
  // ── Legacy / deprecated shopping tables ──────────────────────────────
  {
    category: 'deprecated_db_schema',
    key: 'shopping_tables_LEGACY',
    value: JSON.stringify({
      tables: ['shopping_lists', 'shopping_list_items', 'shopping_sessions', 'shopping_session_items', 'platform_credentials', 'product_mappings', 'orders', 'bank_accounts', 'transactions', 'exchange_rates', 'whatsapp_imports', 'chat_messages'],
      status: 'LEGACY — from the original Geeves Shopping MVP (pre-household-OS pivot)',
      notes: 'These tables use userId (users.id) as the tenant key, not householdId. They are NOT integrated with the household/vertical/calendar system. Do not build new features on these tables. The shopping module will be rebuilt as a household-scoped feature in a future sprint.',
      migration_plan: 'Future: migrate to household-scoped tables with householdId FK. Existing data will be migrated when the shopping module is rebuilt.',
    }),
    sourceDoc: 'drizzle/schema.ts:43-255',
    notes: 'Legacy tables — do not use for new features. Use household-scoped tables instead.',
  },
  // ── Landing page ──────────────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'beta_signups',
    value: JSON.stringify({
      table: 'beta_signups',
      purpose: 'Captures interest from prospective beta testers via the landing page. ICP qualification fields allow admin to score and approve applicants.',
      keyColumns: {
        id: 'int PK autoincrement',
        name: 'varchar(255)',
        email: 'varchar(320) unique',
        householdType: 'varchar(100) — ICP: household/life structure',
        householdSize: 'varchar(50) — ICP: number of people managed',
        primaryUseCase: 'varchar(255) — ICP: most exciting use case',
        icpScore: 'int 1-5 — admin-assigned ICP score',
        status: 'enum(pending, approved, waitlisted, rejected)',
        adminNotes: 'text',
      },
    }),
    sourceDoc: 'drizzle/schema.ts:1122-1151',
  },
  // ── Member resources ──────────────────────────────────────────────────
  {
    category: 'db_schema',
    key: 'member_resources',
    value: JSON.stringify({
      table: 'member_resources',
      purpose: 'Curated resource links assigned to a specific household member. Vertical owners and household admins can add/edit/remove. Members see their resource list as a widget on their dashboard.',
      keyColumns: {
        id: 'varchar(36) PK',
        householdId: 'varchar(36) FK → households.id',
        memberId: 'varchar(36) FK → household_members.id',
        verticalId: 'varchar(36) nullable FK → verticals.id — for colour-coding',
        title: 'varchar(255)',
        url: 'text',
        resourceType: 'enum(link, form, doc, invoice, template)',
        sortOrder: 'int default 0',
        addedByMemberId: 'varchar(36) FK → household_members.id',
      },
    }),
    sourceDoc: 'drizzle/schema.ts:999-1025',
  },
];

let inserted = 0;
let updated = 0;

for (const entry of entries) {
  const [existing] = await conn.execute(
    `SELECT id FROM project_knowledge WHERE category = ? AND \`key\` = ? LIMIT 1`,
    [entry.category, entry.key]
  );
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE project_knowledge SET value = ?, sourceDoc = ?, notes = ?, lastReviewedAt = NOW(), updatedAt = NOW() WHERE category = ? AND \`key\` = ?`,
      [entry.value, entry.sourceDoc ?? null, entry.notes ?? null, entry.category, entry.key]
    );
    updated++;
  } else {
    await conn.execute(
      `INSERT INTO project_knowledge (category, \`key\`, value, sourceDoc, notes, lastReviewedAt, updatedAt, createdAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [entry.category, entry.key, entry.value, entry.sourceDoc ?? null, entry.notes ?? null]
    );
    inserted++;
  }
}

console.log(`Done: ${inserted} inserted, ${updated} updated`);
await conn.end();
