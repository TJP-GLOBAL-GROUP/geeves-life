/**
 * backfill-shadow-blocks.mjs
 * 
 * Re-propagates shadow blocks for events on the 4 canonical calendars
 * that were missing shadow blocks due to the duplicate calendar issue.
 * 
 * Only processes events that currently have NO shadow blocks and are
 * not shadow blocks themselves. Calls the live /api/internal/repropagateEvent
 * endpoint on the deployed site.
 * 
 * This script calls the server-side onEventUpserted via a tRPC admin procedure.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const CANONICAL_CALENDARS = [
  { id: "S6TrhZoBJZdG5W-EiV5hL", name: "tarik.perkins@startout.org" },
  { id: "e8BL36lQOC8SL2kv-VZQf", name: "tarikp@gmail.com" },
  { id: "lXs6SUh32SgPjnNw3t1f9", name: "tarik@maxfieldbakery.com" },
  { id: "o98PLnYQFWEEobQuDOy5E", name: "tarik@maxfieldmarket.com" },
];

const HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9";

// Only backfill events from the last 90 days and next 90 days
const now = Date.now();
const windowStart = now - 90 * 24 * 60 * 60 * 1000;
const windowEnd = now + 90 * 24 * 60 * 60 * 1000;

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Import the propagation service directly
const { onEventUpserted } = await import("../server/services/eventPropagation.ts");

let totalProcessed = 0;
let totalSkipped = 0;

for (const cal of CANONICAL_CALENDARS) {
  console.log(`\n=== Backfilling: ${cal.name} ===`);

  // Find events with no shadow blocks in the time window
  const [events] = await conn.execute(`
    SELECT e.id, e.title, e.startTime, e.endTime, e.isShadowBlock, e.status
    FROM events e
    LEFT JOIN shadow_blocks sb ON sb.sourceEventId = e.id
    WHERE e.calendarId = ?
      AND e.isShadowBlock = 0
      AND (e.status IS NULL OR e.status != 'cancelled')
      AND e.startTime >= ?
      AND e.startTime <= ?
      AND sb.id IS NULL
    ORDER BY e.startTime ASC
  `, [cal.id, windowStart, windowEnd]);

  console.log(`  Found ${events.length} events needing backfill`);

  for (const event of events) {
    try {
      await onEventUpserted(event.id, HOUSEHOLD_ID);
      totalProcessed++;
      if (totalProcessed % 50 === 0) {
        console.log(`  Progress: ${totalProcessed} events propagated...`);
      }
    } catch (err) {
      console.warn(`  ⚠ Failed to propagate event ${event.id} (${event.title}):`, err.message);
      totalSkipped++;
    }
  }

  console.log(`  ✅ Done: ${events.length} events processed`);
}

console.log(`\n=== BACKFILL COMPLETE ===`);
console.log(`  Total propagated: ${totalProcessed}`);
console.log(`  Total skipped (errors): ${totalSkipped}`);

// Verify shadow blocks now exist for the focus day event
const focusEventId = "3d8e6d7b-ad30-4f31-9322-024923d93f3f";
const [[{ sbCount }]] = await conn.execute(
  "SELECT COUNT(*) as sbCount FROM shadow_blocks WHERE sourceEventId = ?",
  [focusEventId]
);
console.log(`\nVerification — FOCUS DAY event shadow blocks: ${sbCount}`);

await conn.end();
