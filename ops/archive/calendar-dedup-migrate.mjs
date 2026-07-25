/**
 * calendar-dedup-migrate.mjs  (v2 — bulk SQL)
 * Migrates events and shadow_blocks from duplicate calendars to canonical records
 * using bulk UPDATE/DELETE SQL — avoids row-by-row slowness.
 *
 * Strategy:
 *   1. DELETE events in duplicate that already exist in canonical (same externalId)
 *   2. UPDATE remaining events: calendarId = canonical
 *   3. DELETE shadow_blocks in duplicate that already exist in canonical (same sourceEventId)
 *   4. UPDATE remaining shadow_blocks: targetCalendarId = canonical
 *   5. UPDATE shadow_blocks: sourceCalendarId = canonical (outbound shadows)
 *   6. DELETE the duplicate calendar record
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const MIGRATIONS = [
  {
    label: "tarik.perkins@startout.org",
    canonical: "S6TrhZoBJZdG5W-EiV5hL",
    duplicates: ["Ol3J8HMYxme0VQ4YI6fq1", "5APdZAyzavMj1C30gxaer"],
  },
  {
    label: "tarikp@gmail.com",
    canonical: "e8BL36lQOC8SL2kv-VZQf",
    duplicates: ["XW7rR1ATfGZYvl3aso4Ng"],
  },
  {
    label: "tarik@maxfieldbakery.com",
    canonical: "lXs6SUh32SgPjnNw3t1f9",
    duplicates: ["g5OewCO6zzuQ7buiZeq5A"],
  },
  {
    label: "tarik@maxfieldmarket.com",
    canonical: "o98PLnYQFWEEobQuDOy5E",
    duplicates: ["gehIEwDhfoelIAXGcezHb"],
  },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const migration of MIGRATIONS) {
  console.log(`\n=== ${migration.label} ===`);
  console.log(`  Canonical: ${migration.canonical}`);

  for (const dupId of migration.duplicates) {
    console.log(`\n  Duplicate: ${dupId}`);

    // Step 1: Delete events in duplicate where canonical already has same externalId
    const [del1] = await conn.execute(`
      DELETE e FROM events e
      INNER JOIN events canon ON canon.calendarId = ? AND canon.externalId = e.externalId
      WHERE e.calendarId = ? AND e.externalId IS NOT NULL
    `, [migration.canonical, dupId]);
    console.log(`    Step 1 — deleted ${del1.affectedRows} duplicate events (already in canonical)`);

    // Step 2: Reassign remaining events to canonical
    const [upd1] = await conn.execute(`
      UPDATE events SET calendarId = ? WHERE calendarId = ?
    `, [migration.canonical, dupId]);
    console.log(`    Step 2 — migrated ${upd1.affectedRows} events to canonical`);

    // Step 3: Delete shadow_blocks in duplicate where canonical already has same sourceEventId
    const [del2] = await conn.execute(`
      DELETE sb FROM shadow_blocks sb
      INNER JOIN shadow_blocks canon ON canon.targetCalendarId = ? AND canon.sourceEventId = sb.sourceEventId
      WHERE sb.targetCalendarId = ? AND sb.sourceEventId IS NOT NULL
    `, [migration.canonical, dupId]);
    console.log(`    Step 3 — deleted ${del2.affectedRows} duplicate shadow_blocks (already in canonical)`);

    // Step 4: Reassign remaining inbound shadow_blocks to canonical
    const [upd2] = await conn.execute(`
      UPDATE shadow_blocks SET targetCalendarId = ? WHERE targetCalendarId = ?
    `, [migration.canonical, dupId]);
    console.log(`    Step 4 — migrated ${upd2.affectedRows} shadow_blocks (inbound) to canonical`);

    // Step 5: Reassign outbound shadow_blocks (sourceCalendarId)
    const [upd3] = await conn.execute(`
      UPDATE shadow_blocks SET sourceCalendarId = ? WHERE sourceCalendarId = ?
    `, [migration.canonical, dupId]);
    console.log(`    Step 5 — migrated ${upd3.affectedRows} shadow_blocks (outbound) to canonical`);

    // Step 6: Verify nothing references the duplicate anymore
    const [[{ remainingEvt }]] = await conn.execute(
      "SELECT COUNT(*) as remainingEvt FROM events WHERE calendarId = ?", [dupId]
    );
    const [[{ remainingSb }]] = await conn.execute(
      "SELECT COUNT(*) as remainingSb FROM shadow_blocks WHERE targetCalendarId = ? OR sourceCalendarId = ?",
      [dupId, dupId]
    );

    if (remainingEvt > 0 || remainingSb > 0) {
      console.log(`    ⚠️  SKIP DELETE — ${remainingEvt} events and ${remainingSb} shadow_blocks still reference ${dupId}`);
      continue;
    }

    // Step 7: Delete the duplicate calendar record
    await conn.execute("DELETE FROM calendars WHERE id = ?", [dupId]);
    console.log(`    ✅ Duplicate calendar ${dupId} deleted`);
  }
}

// Final verification
console.log(`\n=== FINAL VERIFICATION ===`);
const [remaining] = await conn.execute(`
  SELECT externalId, COUNT(*) as cnt
  FROM calendars
  WHERE externalId IS NOT NULL AND externalId != ''
    AND householdId = 'V8lk3KJatvxBTWURf4uo9'
  GROUP BY externalId
  HAVING cnt > 1
`);
if (remaining.length === 0) {
  console.log(`✅ No duplicate calendars remain. Household is clean.`);
} else {
  console.log(`⚠️  Remaining duplicates:`);
  for (const r of remaining) {
    console.log(`  ${r.externalId}: ${r.cnt} copies`);
  }
}

// Show final canonical event counts
console.log(`\n=== CANONICAL CALENDAR EVENT COUNTS ===`);
for (const m of MIGRATIONS) {
  const [[{ cnt }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM events WHERE calendarId = ?", [m.canonical]
  );
  console.log(`  ${m.label}: ${cnt} events`);
}

await conn.end();
console.log(`\nDone.`);
