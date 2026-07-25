/**
 * P-15 Backfill: Re-propagate shadow blocks for all household events from Jan 1 2025.
 *
 * Calls the tRPC backfillShadowBlocks endpoint via HTTP using the system cron secret.
 * Run: node scripts/trigger-backfill-jan2025.mjs
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the household ID
const [[householdRow]] = await conn.execute("SELECT id FROM households LIMIT 1");
if (!householdRow) {
  console.error("No household found");
  await conn.end();
  process.exit(1);
}
const householdId = householdRow.id;
console.log(`Household: ${householdId}`);

// Get all non-iCal calendars with shadowSource=true (or null/default)
const [cals] = await conn.execute(
  "SELECT id, name, shadowSource FROM calendars WHERE householdId = ? AND provider != 'ical' AND (shadowSource IS NULL OR shadowSource = 1)",
  [householdId]
);
console.log(`Calendars to backfill: ${cals.length}`);

const jan2025 = new Date("2025-01-01").getTime();
const future = Date.now() + 180 * 24 * 60 * 60 * 1000; // 6 months forward

let totalQueued = 0;
let totalSkipped = 0;

for (const cal of cals) {
  // Get events on this calendar that have no shadow blocks yet
  const [evs] = await conn.execute(
    `SELECT e.id FROM events e
     WHERE e.calendarId = ?
       AND e.isShadowBlock = 0
       AND e.status != 'cancelled'
       AND e.startTime >= ?
       AND e.startTime <= ?
       AND NOT EXISTS (
         SELECT 1 FROM shadow_blocks sb WHERE sb.sourceEventId = e.id
       )`,
    [cal.id, jan2025, future]
  );

  if (evs.length === 0) {
    totalSkipped++;
    continue;
  }

  console.log(`  ${cal.name}: ${evs.length} events to backfill`);

  // Batch the event IDs for the HTTP call
  const eventIds = evs.map(e => e.id);

  // Call the server's internal propagation via HTTP
  // We use the SYSTEM_CRON_SECRET to authenticate
  const batchSize = 50;
  for (let i = 0; i < eventIds.length; i += batchSize) {
    const batch = eventIds.slice(i, i + batchSize);
    try {
      const resp = await fetch("http://localhost:3000/api/internal/backfill-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.SYSTEM_CRON_SECRET || "",
        },
        body: JSON.stringify({ eventIds, householdId }),
      });
      if (!resp.ok) {
        console.warn(`  Batch ${i}-${i + batchSize}: HTTP ${resp.status}`);
      }
    } catch (err) {
      console.warn(`  Batch error: ${err.message}`);
    }
    totalQueued += batch.length;
  }
}

console.log(`\n✓ Queued: ${totalQueued} events`);
console.log(`  Calendars skipped (already have blocks): ${totalSkipped}`);

await conn.end();
