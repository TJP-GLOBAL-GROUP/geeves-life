/**
 * seed-db-knowledge.mjs
 * Populates project_knowledge with DB table definitions, relationships,
 * and deprecation status for all tables in the Geeves.Life schema.
 * Run: node scripts/seed-db-knowledge.mjs
 */
import mysql from "mysql2/promise";
import crypto from "crypto";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const tables = [
  {
    key: "table:users",
    value: `PURPOSE: Platform OAuth identity. One row per authenticated user. Created on first login via Manus OAuth or Google OAuth.
COLUMNS: id (int PK autoincrement), openId (varchar — Manus/Google sub), name, email, role (enum: user|admin|system_admin), createdAt, updatedAt.
RELATIONSHIPS: Referenced by household_members.userId (nullable — NULL until invited member logs in), households.createdByUserId, oauth_tokens.userId, notes.userId, bank_accounts.userId, transactions.userId, orders.userId, shopping_lists.userId, shopping_sessions.userId, chat_messages.userId, subscriptions.userId, devices.userId.
IMPORTANT: A users row only exists AFTER first login. household_members.userId is NULL for invited-but-not-yet-joined members. Do NOT assume a household_member always has a corresponding users row.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:household_members",
    value: `PURPOSE: Constellation role record. One row per member per household. Created immediately on invite — userId is NULL until member accepts and logs in.
COLUMNS: id (varchar UUID PK), householdId, userId (int nullable — FK to users.id), displayName, googleName, email, role (enum: household_admin|ea|member|caregiver|child|elder), pronouns, genderIdentity, relationshipLabel, isBillingContact, accessibilityMode (enum: standard|picture_board|large_text|voice_only), status (enum: invited|active|inactive|removed), inviteToken, inviteTokenExpiresAt, invitedAt, joinedAt, pendingVerticals (json), createdAt, updatedAt.
RELATIONSHIPS: householdId → households.id. userId → users.id (nullable). Referenced by calendars.memberId, vertical_owners.memberId, shadow_blocks.targetMemberId.
CRITICAL DISTINCTION: This is the constellation identity layer. users table = platform identity. household_members = role within a specific constellation. A person can be a member of multiple households (multiple rows here, one users row).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:family_members",
    value: `PURPOSE: DEPRECATED — original pre-constellation member table. Superseded by household_members in Jun 2026 when the constellation/household model was introduced.
STATUS: ⚠️ DEPRECATED. Do NOT add new features or queries against this table. Do NOT delete yet — foreign key references may exist. Migrate any remaining logic to household_members.
COLUMNS: id (int PK), userId (int — FK to users.id), name, relationship, avatarUrl, clothingSizes (json), dietaryRestrictions (json), preferences (json), birthDate, createdAt, updatedAt.`,
    category: "db_schema_deprecated",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:households",
    value: `PURPOSE: A constellation/household — the top-level grouping of members, verticals, calendars, and properties.
COLUMNS: id (varchar UUID PK), name, createdByUserId (int — audit only, NOT the owner; all household_admins are co-equal), wakeWord (default "Geeves"), timezone, groupName (default "Household" — user-defined alias e.g. Constellation, Village, Team), settings (json), createdAt, updatedAt.
LIVE DATA: TJ Perkins Fam (id: YouIQoAP6nmcPNljVdUis, createdBy: userId=1), TJ Perkins Global (id: V8lk3KJatvxBTWURf4uo9, createdBy: userId=1410001).
IMPORTANT: createdByUserId is for audit only. It does NOT grant special privileges. All household_admin members are co-equal.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:verticals",
    value: `PURPOSE: Life domain/vertical — a named category of life activity (e.g. Home & Family, Maxfield Bakery, Bohemian Lodges). Calendars, events, and properties are assigned to verticals.
COLUMNS: id (varchar UUID PK), householdId, name, icon, color, description, isActive (bool), sortOrder (int), privacyLevel (enum: household|admin_only|private), busyLabel (varchar — shown to others instead of event title, e.g. "Busy"), createdAt, updatedAt.
LIVE DATA (TJ Perkins Global): Home & Family, Maxfield Bakery (admin_only), Maxfield Market (admin_only), Personal (private), StartOut (admin_only), Bohemian Lodges (id: c3pW-Cxhm9WAQZ17pTMb3).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:calendars",
    value: `PURPOSE: A calendar source connected to a household member. Can be Google Calendar (google_personal), iCal feed (ical), or manual.
COLUMNS: id (varchar UUID PK), householdId, memberId (FK → household_members.id), verticalId (FK → verticals.id, nullable), name, googleCalendarId, provider (enum: google_personal|ical|manual), accessRole (enum: read_write|read_only|free_busy), color, isActive, syncToken, lastSyncedAt, icalUrl, createdAt, updatedAt.
LIVE DATA: 16 calendars in TJ Perkins Global, all owned by memberId 5oijHdMcqgQHvtuCvu2Cm (Tarik's tjperkinsfam.com member row). Includes 3 iCal booking feeds (Morabeza, Sunset Studio, Artiste's Boutique).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:events",
    value: `PURPOSE: Calendar events — both synced from Google Calendar and manually created. Includes property booking events injected at query time.
COLUMNS: id (varchar UUID PK), householdId, calendarId, verticalId, externalId (Google event ID), title, description, location, startTime (bigint UTC ms), endTime (bigint UTC ms), isAllDay (bool), recurrenceRule, recurrenceId, isCancelled, isShadowBlock (bool — if true, skip propagation to avoid loops), status, createdAt, updatedAt.
INDEXES: (householdId, startTime, endTime), (calendarId, startTime).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:shadow_blocks",
    value: `PURPOSE: Cross-vertical busy blocks. When an event in vertical A is propagated to vertical B's calendar, a shadow_block row is created. The target calendar sees a "Busy" block without the event details.
COLUMNS: id (varchar UUID PK), householdId, sourceEventId (FK → events.id), sourceCalendarId, sourceVerticalId, targetCalendarId, targetVerticalId, targetMemberId, startTime (bigint UTC ms), endTime (bigint UTC ms), isAllDay, googleEventId (if written to Google Calendar), status, createdAt, updatedAt.
UNIQUE CONSTRAINT: shadow_blocks_source_target_uniq on (sourceEventId, targetCalendarId).
INDEX: (householdId, startTime, endTime).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:properties",
    value: `PURPOSE: Short-term rental properties managed by the household. Each property has multiple platform feeds (Airbnb, VRBO, Booking.com, Direct).
COLUMNS: id (varchar UUID PK), householdId, name, address, city, country, timezone, description, imageUrl, isActive, prepDays (int — days between bookings for cleaning/prep), createdAt, updatedAt.
LIVE DATA (TJ Perkins Global): Sunset Studio, Morabeza, The Artiste's Boutique, Apartment #1 (Jessica Dougherty), Apartment #2 (Jennifer Ungberg).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:property_platforms",
    value: `PURPOSE: Platform feed configuration per property. One row per platform per property (e.g. Airbnb feed for Sunset Studio).
COLUMNS: id (varchar UUID PK), propertyId, platform (enum: airbnb|vrbo|booking_com|direct), icalUrl, isActive, lastPolledAt, pollIntervalMinutes, notificationEmail, emailScrapingEnabled, lastEmailScrapedAt, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:property_bookings",
    value: `PURPOSE: Parsed booking records from iCal feeds and email scraping. One row per booking per property.
COLUMNS: id (varchar UUID PK), propertyId, platformId, icalUid, guestName, guestEmail, checkIn (date), checkOut (date), bookingType (enum: booking|unavailable|blocked), summary, totalPrice (decimal), commissionAmount (decimal), netAmount (decimal), currency, confirmationNumber, createdAt, updatedAt.
INDEXES: (propertyId, checkIn), (platformId), (icalUid).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:booking_overrides",
    value: `PURPOSE: Manual guest name and notes annotations for anonymous Booking.com iCal blocks (which strip guest names).
COLUMNS: id (varchar UUID PK), bookingId (varchar — matches icalUid or composite booking ID), guestName, guestEmail, notes, createdBy (memberId), createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:vertical_visibility",
    value: `PURPOSE: Cross-vertical shadow block rules. Defines which verticals can see events from other verticals, and at what level (full_access, busy_only, none).
COLUMNS: id (varchar UUID PK), householdId, sourceVerticalId, targetVerticalId, visibilityLevel (enum: full_access|busy_only|none), calendarExclusions (json — list of calendarIds to exclude from propagation), createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:vertical_owners",
    value: `PURPOSE: Explicit ownership of a vertical by a member. Used for admin_only and private verticals to determine who can see them.
COLUMNS: id (varchar UUID PK), verticalId, memberId, householdId, createdAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:oauth_tokens",
    value: `PURPOSE: Encrypted OAuth access and refresh tokens for Google Calendar per-account OAuth.
COLUMNS: id (int PK), userId (FK → users.id), provider (e.g. google), accountEmail, accessToken (encrypted AES-256-GCM), refreshToken (encrypted), expiresAt (bigint UTC ms), scope, createdAt, updatedAt.
SECURITY: Tokens are encrypted at rest using tokenEncryption.ts (AES-256-GCM, key derived from JWT_SECRET). Never store plaintext tokens.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:audit_log",
    value: `PURPOSE: ISO 27001-aligned security audit trail for all security-relevant actions.
COLUMNS: id (bigint PK autoincrement), actorUserId, actorMemberId, householdId, action (varchar), category (enum: auth|data|admin|security|gdpr|system), resourceType, resourceId, outcome (enum: success|failure|partial), metadata (json), ipAddress, userAgent, createdAt.
POPULATED BY: auth.logout, household.members.invite, household.members.claimInvite, gdpr.exportData, gdpr.deleteAccount.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:project_knowledge",
    value: `PURPOSE: Persistent knowledge base for the Geeves.Life project. Survives context resets. Reviewed and used to regenerate docs/AI_MEMORY.md on every 24h heartbeat run.
COLUMNS: id (int PK autoincrement), category (varchar), key (varchar UNIQUE), value (text), sourceDoc (varchar), notes (text), lastReviewedAt (datetime), createdAt, updatedAt.
MANAGEMENT: Full CRUD via Super Admin portal (/super-admin → Knowledge Base tab). Heartbeat auto-flags deprecated entries.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:project_tasks",
    value: `PURPOSE: DB-backed project task tracker. Seeded from todo.md. Synced on every 24h heartbeat run (idempotent upsert by titleHash).
COLUMNS: id (int PK autoincrement), phase (varchar), area (varchar), title (text), status (enum: todo|in_progress|done|deferred|blocked), priority (enum: low|medium|high|critical), notes (text), completedAt (datetime), deferredReason (varchar), titleHash (varchar UNIQUE — SHA-256 of title), createdAt, updatedAt.
MANAGEMENT: Full CRUD via Super Admin portal (/super-admin → Project Tasks tab).`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:shopping_lists",
    value: `PURPOSE: Named shopping lists per user. Can be recurring.
COLUMNS: id (int PK), userId, name, description, category, status (enum: active|completed|archived), isRecurring, recurringSchedule, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:shopping_list_items",
    value: `PURPOSE: Individual items within a shopping list.
COLUMNS: id (int PK), listId (FK → shopping_lists.id), name, quantity, unit, category, brand, estimatedPrice, actualPrice, isChecked, notes, productId, imageUrl, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:orders",
    value: `PURPOSE: Imported orders from Amazon and Walmart Gmail parsing.
COLUMNS: id (int PK), userId, platform (enum: amazon|walmart|other), orderId, orderDate, totalAmount, currency, status, items (json), rawEmailSubject, rawEmailDate, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:bank_accounts",
    value: `PURPOSE: Multi-bank account records (BofA, Amex, Scotiabank). Supports multi-currency (USD/JMD).
COLUMNS: id (int PK), userId, bankName, accountType, accountNumber (masked), currency, balance, lastSyncedAt, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "table:transactions",
    value: `PURPOSE: Financial transactions imported from bank accounts. AI-powered auto-tagging.
COLUMNS: id (int PK), userId, accountId (FK → bank_accounts.id), date, description, amount, currency, category, tags (json), receiptUrl (S3), isReconciled, createdAt, updatedAt.`,
    category: "db_schema",
    sourceDoc: "drizzle/schema.ts",
  },
  {
    key: "architecture:two_household_model",
    value: `IMPORTANT: Tarik Perkins has TWO separate households in production:
1. "TJ Perkins Fam" (id: YouIQoAP6nmcPNljVdUis) — created by userId=1 (tarik@maxfieldbakery.com). Contains Maxfield Bakery/Market verticals.
2. "TJ Perkins Global" (id: V8lk3KJatvxBTWURf4uo9) — created by userId=1410001 (tarik@tjperkinsfam.com). Contains Bohemian Lodges, all 5 properties, 16 calendars. This is the PRIMARY active household.
When building features, target V8lk3KJatvxBTWURf4uo9 for the main Geeves.Life experience. The tarik@maxfieldbakery.com household (YouIQoAP6nmcPNljVdUis) is a secondary/legacy constellation.`,
    category: "architecture",
    sourceDoc: "docs/AI_MEMORY.md",
  },
  {
    key: "architecture:identity_layers",
    value: `TWO IDENTITY LAYERS — do not confuse them:
Layer 1 — users table: Platform OAuth identity. Created on first login. id is an auto-increment int. openId is the Manus/Google sub claim.
Layer 2 — household_members table: Constellation role record. Created on invite. userId is NULL until the invited person logs in. id is a varchar UUID.
COMMON MISTAKE: Assuming household_members.userId is always populated. It is NULL for invited-but-not-yet-joined members. Always handle the nullable userId case in queries and UI.
DEPRECATED: family_members table — the original member table before the constellation model. Do not use.`,
    category: "architecture",
    sourceDoc: "drizzle/schema.ts",
  },
];

// Upsert each entry
let inserted = 0;
let updated = 0;

for (const entry of tables) {
  const [existing] = await conn.query(
    "SELECT id FROM project_knowledge WHERE `key` = ?",
    [entry.key]
  );
  if (existing.length > 0) {
    await conn.query(
      "UPDATE project_knowledge SET category=?, value=?, sourceDoc=?, updatedAt=NOW() WHERE `key`=?",
      [entry.category, entry.value, entry.sourceDoc, entry.key]
    );
    updated++;
  } else {
    await conn.query(
      "INSERT INTO project_knowledge (category, `key`, value, sourceDoc, createdAt, updatedAt) VALUES (?,?,?,?,NOW(),NOW())",
      [entry.category, entry.key, entry.value, entry.sourceDoc]
    );
    inserted++;
  }
}

console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
await conn.end();
