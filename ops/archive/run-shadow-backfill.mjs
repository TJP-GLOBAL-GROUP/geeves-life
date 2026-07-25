/**
 * Direct shadow block backfill script
 * Processes events that need shadow blocks in batches, bypassing the propagation queue.
 * Uses skipGoogleWrite: true to avoid Google API latency.
 * 
 * Run: node scripts/run-shadow-backfill.mjs
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const JAN_1_2025 = new Date('2025-01-01T00:00:00Z').getTime();
const SIX_MONTHS_FORWARD = Date.now() + 180 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Count events needing shadow blocks
  const [countResult] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM events e
     JOIN calendars c ON e.calendarId = c.id
     WHERE c.provider != 'ical'
     AND e.isShadowBlock = 0
     AND e.status != 'cancelled'
     AND e.startTime >= ?
     AND e.startTime <= ?
     AND NOT EXISTS (SELECT 1 FROM shadow_blocks sb WHERE sb.sourceEventId = e.id)`,
    [JAN_1_2025, SIX_MONTHS_FORWARD]
  );
  
  const totalMissing = Number(countResult[0].cnt);
  console.log(`Total events needing shadow blocks: ${totalMissing}`);
  
  if (totalMissing === 0) {
    console.log('All events have shadow blocks! Nothing to do.');
    await conn.end();
    return;
  }
  
  // Also clear the pending queue items since we're doing a direct backfill
  const [clearResult] = await conn.execute(
    `UPDATE propagation_queue SET status = 'resolved', resolvedAt = ? WHERE status = 'pending'`,
    [Date.now()]
  );
  console.log(`Cleared ${clearResult.affectedRows} pending queue items (will backfill directly)`);
  
  // Now trigger the backfill endpoint
  console.log(`\nTriggering shadow-block-backfill endpoint...`);
  console.log(`This will process ALL ${totalMissing} events with skipGoogleWrite=true`);
  console.log(`(DB-only shadow blocks, no Google Calendar API calls)`);
  
  await conn.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
