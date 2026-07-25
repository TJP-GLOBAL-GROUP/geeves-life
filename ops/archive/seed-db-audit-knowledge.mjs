/**
 * seed-db-audit-knowledge.mjs
 * Seeds project_knowledge entries for the DB audit items:
 * 1. users ↔ household_members relationship
 * 2. family_members table deprecation
 * 3. Elevates key DB table definitions into project_knowledge
 *
 * Run: node scripts/seed-db-audit-knowledge.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const entries = [
  // ─── users ↔ household_members relationship ───────────────────────────────
  {
    category: "db_schema",
    key: "users_vs_household_members",
    value: `Two separate identity layers exist:

**users** (platform OAuth identity):
- Created when a person completes Google OAuth for the first time
- Contains: id, email, name, googleId, role (admin/user/system_admin), deviceTimezone, deviceCity
- May NOT exist for invited-but-not-yet-joined members (they have a household_members row but no users row)
- householdId and memberId are stamped on users after they claim their invite or create a household

**household_members** (constellation role record):
- Created immediately when an admin sends an invite (status=invited)
- Always exists once a member is invited, even before they log in
- Contains: id, householdId, userId (nullable until claimed), role, status, name, email, pronouns, relationship, interfaceMode, geevesAccess
- userId is null until the member claims their invite via Google OAuth

**Key invariant**: A member can have a household_members row with userId=null (invited, not yet joined).
A user can have householdId=null if they signed up via OAuth but haven't joined/created a household yet.

**Join pattern**: Always join via household_members.userId = users.id, not via users.householdId directly.`,
    sourceDoc: "server/db.ts",
    notes: "Critical for understanding why some members appear in constellation UI but cannot log in yet. Do not confuse users table (OAuth identity) with household_members table (constellation membership).",
  },

  // ─── family_members deprecation ───────────────────────────────────────────
  {
    category: "deprecated_db_schema",
    key: "family_members_DEPRECATED",
    value: `⚠️ DEPRECATED (2026-06-25): The family_members table is superseded by household_members.

**Do NOT use family_members for any new code.** Do NOT delete it — foreign keys may reference it.

**Superseded by**: household_members table (see db_schema/users_vs_household_members)

**Why deprecated**: household_members supports full RBAC (role, status, geevesAccess, vertical access control), invite flow, and constellation membership. family_members was the original simple table from Phase 1.

**Migration status**: All active code uses household_members. family_members rows may still exist in DB from early development.`,
    sourceDoc: "drizzle/schema.ts",
    notes: "⚠️ DEPRECATED — do not add new code referencing family_members. Use household_members instead.",
  },

  // ─── Key table definitions ─────────────────────────────────────────────────
  {
    category: "db_schema",
    key: "table_properties",
    value: `**properties** table — short-term and long-term rental properties managed by the constellation.

Key columns:
- id (nanoid PK), householdId, name, address, type (rental_str/rental_ltr/vacation/primary_residence/commercial/investment/other)
- verticalId — links property to a vertical (e.g. Bohemian Lodges vertical)
- calendarId — composite iCal calendar row in calendars table (created on property.create via ensurePropertyCalendar)
- icalUrl — legacy single iCal URL (superseded by property_platforms multi-feed)
- country (ISO 3166-1 alpha-2, e.g. US/JM) — used for national holiday prep-day blocking
- timezone (IANA, e.g. America/New_York) — used for property-local date display
- isActive, createdAt, updatedAt

Related tables: property_platforms (iCal feeds), property_bookings (parsed booking rows), property_email_tokens (Gmail OAuth for email scraping)`,
    sourceDoc: "drizzle/schema.ts",
    notes: "country and timezone added Jun 25 2026. calendarId is always created on property.create (ensurePropertyCalendar). Do not store booking data directly on properties — use property_bookings.",
  },

  {
    category: "db_schema",
    key: "table_household_members",
    value: `**household_members** table — constellation membership records.

Key columns:
- id (nanoid PK), householdId, userId (nullable — null until invite claimed)
- role: admin | household_admin | ea | member | child | elder | caregiver | viewer
- status: active | invited | inactive
- name, email, pronouns, relationship, interfaceMode
- geevesAccess (boolean, default true) — whether this member can use Geeves AI assistant
- createdAt, updatedAt

**userId is null** for members who have been invited but have not yet completed Google OAuth.
Once they claim their invite, userId is stamped and users.householdId/memberId are updated.

Related tables: users (OAuth identity), vertical_member_access (per-vertical permissions), member_permission_overrides (RBAC overrides), member_resources (links/docs per member)`,
    sourceDoc: "drizzle/schema.ts",
    notes: "Always check userId != null before assuming a member has a login session. The invite flow creates the household_members row first, then userId is linked on claim.",
  },

  {
    category: "db_schema",
    key: "table_calendars",
    value: `**calendars** table — individual calendar feeds (Google, iCal, property composite).

Key columns:
- id (nanoid PK), householdId, memberId (owner), verticalId (which vertical this calendar belongs to)
- provider: google | ical | geeves_internal
- externalId: Google calendar ID or "property:{propertyId}" for composite property calendars
- name, color (hex), syncType (push/poll), pollIntervalMinutes
- accessLevel: read_only | read_write
- isPrimary (boolean), isVisible (boolean)
- lastSyncedAt, webhookChannelId, webhookResourceId, webhookExpiry

**Property composite calendars**: provider=ical, externalId="property:{propertyId}", created by ensurePropertyCalendar() on property.create. These aggregate all platform iCal feeds into one calendar row for vertical assignment.

Related tables: events (calendar events), shadow_blocks (cross-vertical busy blocks), vertical_visibility (which members see which calendars)`,
    sourceDoc: "drizzle/schema.ts",
    notes: "Do not confuse Google calendars (provider=google, externalId=Google calendar ID) with composite property calendars (provider=ical, externalId=property:xxx). Both live in this table.",
  },

  {
    category: "db_schema",
    key: "table_shadow_blocks",
    value: `**shadow_blocks** table — cross-vertical busy-block propagation.

Key columns:
- id (nanoid PK), householdId, sourceEventId (FK → events.id), targetCalendarId (FK → calendars.id)
- title (usually "Busy"), startTime, endTime (Unix ms UTC)
- propagatedAt (when this shadow block was last written)

**Purpose**: When an event is created in Calendar A (e.g. Personal), shadow blocks are written to Calendar B and C (e.g. Work, Bohemian Lodges) so those verticals show the owner as busy without revealing event details.

**Idempotent**: The backfill procedure uses notExists(shadow_blocks WHERE sourceEventId = events.id) to avoid duplicates.

Related tables: events (source events), calendars (target calendars), vertical_visibility (which calendars receive shadow blocks)`,
    sourceDoc: "drizzle/schema.ts",
    notes: "Shadow blocks are DB-only currently. Google write-back (writing a blocker event to the actual Google Calendar) is a planned feature (todo: Shadow block Google write-back).",
  },
];

let inserted = 0;
let updated = 0;

for (const entry of entries) {
  const [existing] = await conn.execute(
    `SELECT id FROM project_knowledge WHERE \`key\` = ? LIMIT 1`,
    [entry.key]
  );
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE project_knowledge SET category=?, value=?, sourceDoc=?, notes=?, updatedAt=NOW() WHERE \`key\`=?`,
      [entry.category, entry.value, entry.sourceDoc, entry.notes, entry.key]
    );
    console.log(`Updated: ${entry.key}`);
    updated++;
  } else {
    await conn.execute(
      `INSERT INTO project_knowledge (category, \`key\`, value, sourceDoc, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [entry.category, entry.key, entry.value, entry.sourceDoc, entry.notes]
    );
    console.log(`Inserted: ${entry.key}`);
    inserted++;
  }
}

await conn.end();
console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}`);
