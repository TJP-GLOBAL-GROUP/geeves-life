/**
 * Seed DATETIME_MODEL summary into project_knowledge table.
 * Run: node scripts/seed-datetime-knowledge.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Load .env
const envPath = join(projectRoot, ".env");
let DATABASE_URL;
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key?.trim() === "DATABASE_URL") {
      DATABASE_URL = rest.join("=").trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
} catch {
  DATABASE_URL = process.env.DATABASE_URL;
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

const entries = [
  {
    category: "architecture",
    key: "datetime_model",
    value: `GEEVES DATETIME MODEL (Jun 20 2026)

CORE PRINCIPLE: Device timezone = primary reference. Constellation home timezone (America/New_York) = secondary anchor.

TIMEZONE HIERARCHY:
1. Device timezone — Intl.DateTimeFormat().resolvedOptions().timeZone, stored in users.deviceTimezone
2. Constellation home — America/New_York (EST/EDT), stored in household.homeTimezone
3. Property timezone — properties.timezone (IANA), used only for check-in/out day boundaries
4. Storage — UTC Unix milliseconds always

ACQUISITION: On every app load, useDeviceLocation() hook (called from AppInit in App.tsx) reads device IANA timezone synchronously, optionally requests geolocation for city name, persists both via trpc.auth.updateDeviceLocation.

DISPLAY RULES:
- Rule 1 (same TZ): Show only one clock/date/gutter. Home column collapses.
- Rule 2 (different TZ): Show both times everywhere — greeting bar, calendar gutter, now-line, event badges.
- Rule 3 (Today anchor): fromTs uses device midnight, not UTC midnight. Client passes deviceTimezone in query.
- Rule 4 (Property date math): Check-in/out uses property.timezone. Upcoming event date label uses device TZ.
- Rule 5 (Storage): All DB timestamps are UTC ms. No local time strings ever.

CRITICAL BUG PATTERN: iCal date-only events (DTSTART;VALUE=DATE:20250703) are stored as UTC midnight (1751500800000). When displaying, NEVER use setHours(0,0,0,0) — this shifts UTC midnight to local midnight. Use utcMidnightToLocal() helper (extracts UTC date components, builds local-midnight Date) for all date comparisons.

HELPERS (client/src/hooks/useDeviceLocation.ts):
- isSameAsHome(tz): compares UTC offsets at current moment (handles equivalent IANA strings)
- formatInTz(ts, tz): returns { time12, time24, date, dateShort, dayName, localDateStr }
- todayMidnightInTz(tz): returns UTC ms for midnight in given timezone
- HOME_TIMEZONE: "America/New_York"

See /docs/DATETIME_MODEL.md for full spec with calendar UI diagrams.`,
    sourceDoc: "/docs/DATETIME_MODEL.md",
    notes: "Seeded Jun 25 2026. Authoritative reference for all date/time display logic.",
  },
];

for (const entry of entries) {
  // Check if already exists
  const [existing] = await conn.execute(
    "SELECT id FROM project_knowledge WHERE `key` = ? AND category = ?",
    [entry.key, entry.category]
  );

  if (existing.length > 0) {
    await conn.execute(
      "UPDATE project_knowledge SET value = ?, sourceDoc = ?, notes = ?, updatedAt = ? WHERE `key` = ? AND category = ?",
      [entry.value, entry.sourceDoc, entry.notes, Date.now(), entry.key, entry.category]
    );
    console.log(`Updated: ${entry.category}/${entry.key}`);
  } else {
    const id = `pk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await conn.execute(
      "INSERT INTO project_knowledge (id, category, `key`, value, sourceDoc, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, entry.category, entry.key, entry.value, entry.sourceDoc, entry.notes, Date.now(), Date.now()]
    );
    console.log(`Inserted: ${entry.category}/${entry.key}`);
  }
}

await conn.end();
console.log("Done.");
