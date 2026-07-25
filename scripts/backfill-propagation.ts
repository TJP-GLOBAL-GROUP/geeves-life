/**
 * Backfill shadow block propagation for events on calendars that were missing verticalId.
 * Run with: npx tsx scripts/backfill-propagation.ts
 *
 * This script re-runs onEventUpserted for all non-shadow, non-cancelled events
 * on the three affected calendar records that were previously missing verticalId.
 */

import { createConnection } from "mysql2/promise";
import { onEventUpserted } from "../server/services/eventPropagation";

const HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9";
const AFFECTED_CALENDARS = [
  "5APdZAyzavMj1C30gxaer", // tarik.perkins@startout.org (was verticalId=null)
  "XW7rR1ATfGZYvl3aso4Ng", // tarikp@gmail.com (was verticalId=null)
  "Ol3J8HMYxme0VQ4YI6fq1", // tarik.perkins@startout.org (was verticalId=null)
];

// Only backfill events from the last 30 days + all future events
// (90 days would be 4490 events — too many; focus on what matters)
const CUTOFF_MS = Date.now() - 30 * 24 * 60 * 60 * 1000;

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL!);

  const placeholders = AFFECTED_CALENDARS.map(() => "?").join(",");
  const [events] = await conn.execute<any[]>(
    `SELECT id, title, startTime FROM events 
     WHERE calendarId IN (${placeholders}) 
     AND isShadowBlock = 0 
     AND status != 'cancelled'
     AND startTime > ?
     ORDER BY startTime ASC`,
    [...AFFECTED_CALENDARS, CUTOFF_MS]
  );

  console.log(`[Backfill] Found ${events.length} events to propagate`);
  await conn.end();

  let success = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await onEventUpserted(event.id, HOUSEHOLD_ID);
      success++;
      if (success % 50 === 0) {
        console.log(`[Backfill] Progress: ${success}/${events.length} (${failed} failed)`);
      }
    } catch (e) {
      failed++;
      console.warn(`[Backfill] Failed for event ${event.id} (${event.title}):`, e);
    }
  }

  console.log(`[Backfill] Complete: ${success} propagated, ${failed} failed`);
}

main().catch(console.error);
