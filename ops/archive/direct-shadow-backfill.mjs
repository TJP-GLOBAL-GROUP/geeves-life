/**
 * Direct Shadow Block Backfill — SQL-based approach
 * 
 * Instead of calling onEventUpserted (which resolves targets, checks locks, etc.),
 * this script directly creates shadow_blocks rows by:
 * 1. Finding events without shadow blocks
 * 2. Determining propagation targets via the vertical visibility rules
 * 3. Inserting shadow_blocks rows directly
 * 
 * This is MUCH faster because it skips Google API calls and in-memory locks.
 * Run: node scripts/direct-shadow-backfill.mjs
 */
import mysql from 'mysql2/promise';
import { nanoid } from 'nanoid';

const DATABASE_URL = process.env.DATABASE_URL;
const JAN_1_2025 = new Date('2025-01-01T00:00:00Z').getTime();
const SIX_MONTHS_FORWARD = Date.now() + 180 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Step 1: Get all households
  const [households] = await conn.execute('SELECT id FROM households');
  console.log(`Found ${households.length} households`);
  
  for (const household of households) {
    const householdId = household.id;
    console.log(`\nProcessing household: ${householdId}`);
    
    // Step 2: Get vertical visibility rules (which verticals can see which)
    // Each calendar belongs to a vertical. Shadow blocks propagate to calendars
    // in OTHER verticals that have shadowBlocking=true.
    const [cals] = await conn.execute(
      `SELECT id, name, verticalId, shadowBlocking, shadowSource, provider, externalId
       FROM calendars WHERE householdId = ? AND provider != 'ical'`,
      [householdId]
    );
    
    // Source calendars: those with shadowSource != false (null = true)
    const sourceCals = cals.filter(c => c.shadowSource !== 0 && c.shadowSource !== false);
    // Target calendars: those with shadowBlocking = true
    const targetCals = cals.filter(c => c.shadowBlocking === 1 || c.shadowBlocking === true);
    
    console.log(`  Source calendars: ${sourceCals.length}, Target calendars: ${targetCals.length}`);
    
    // Step 3: Get events without shadow blocks
    const [eventsToBackfill] = await conn.execute(
      `SELECT e.id, e.calendarId, e.title, e.startTime, e.endTime, e.isAllDay
       FROM events e
       JOIN calendars c ON e.calendarId = c.id
       WHERE c.householdId = ?
       AND c.provider != 'ical'
       AND e.isShadowBlock = 0
       AND e.status != 'cancelled'
       AND e.startTime >= ?
       AND e.startTime <= ?
       AND NOT EXISTS (SELECT 1 FROM shadow_blocks sb WHERE sb.sourceEventId = e.id)
       ORDER BY e.startTime ASC`,
      [householdId, JAN_1_2025, SIX_MONTHS_FORWARD]
    );
    
    console.log(`  Events needing shadow blocks: ${eventsToBackfill.length}`);
    
    if (eventsToBackfill.length === 0) continue;
    
    // Step 4: Get vertical visibility rules
    const [verticals] = await conn.execute(
      'SELECT id, name FROM verticals WHERE householdId = ?',
      [householdId]
    );
    
    // Build a map: calendarId -> verticalId
    const calToVertical = {};
    for (const cal of cals) {
      if (cal.verticalId) calToVertical[cal.id] = cal.verticalId;
    }
    
    // Build target map: for each source calendar's vertical, which target calendars should get blocks?
    // Rule: shadow blocks go to calendars in OTHER verticals that have shadowBlocking=true
    // PLUS calendars in the SAME vertical that have shadowBlocking=true (except the source itself)
    const targetsBySourceCal = {};
    for (const srcCal of sourceCals) {
      if (!srcCal.verticalId) continue;
      const targets = targetCals.filter(tc => 
        tc.id !== srcCal.id && // not the source itself
        tc.verticalId // must have a vertical
      );
      targetsBySourceCal[srcCal.id] = targets;
    }
    
    // Step 5: Create shadow blocks in batches
    let created = 0;
    let skipped = 0;
    
    for (let i = 0; i < eventsToBackfill.length; i += BATCH_SIZE) {
      const batch = eventsToBackfill.slice(i, i + BATCH_SIZE);
      const insertValues = [];
      
      for (const event of batch) {
        const targets = targetsBySourceCal[event.calendarId] || [];
        if (targets.length === 0) {
          skipped++;
          continue;
        }
        
        // Mask the title: "Busy" for cross-vertical, original for same-vertical
        const srcVertical = calToVertical[event.calendarId];
        
        for (const target of targets) {
          const isSameVertical = target.verticalId === srcVertical;
          const maskedTitle = isSameVertical ? (event.title || 'Busy') : 'Busy';
          
          insertValues.push([
            nanoid(),                    // id
            householdId,                 // householdId
            event.id,                    // sourceEventId
            event.calendarId,            // sourceCalendarId
            target.id,                   // targetCalendarId
            maskedTitle,                 // maskedTitle
            Number(event.startTime),     // startTime
            Number(event.endTime),       // endTime
            event.isAllDay ? 1 : 0,      // isAllDay
            0,                           // isDismissed
            null,                        // externalEventId (no Google write)
            'pending_sync',              // syncStatus
            0,                           // syncAttempts
            null,                        // lastSyncError
            null,                        // lastSyncAttemptAt
          ]);
        }
      }
      
      if (insertValues.length > 0) {
        // Batch insert
        const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = insertValues.flat();
        
        try {
          await conn.execute(
            `INSERT IGNORE INTO shadow_blocks 
             (id, householdId, sourceEventId, sourceCalendarId, targetCalendarId, maskedTitle, startTime, endTime, isAllDay, isDismissed, externalEventId, sync_status, sync_attempts, last_sync_error, last_sync_attempt_at)
             VALUES ${placeholders}`,
            flatValues
          );
          created += insertValues.length;
        } catch (err) {
          console.error(`  Batch insert error at offset ${i}:`, err.message);
          // Try one by one for this batch
          for (const values of insertValues) {
            try {
              await conn.execute(
                `INSERT IGNORE INTO shadow_blocks 
                 (id, householdId, sourceEventId, sourceCalendarId, targetCalendarId, maskedTitle, startTime, endTime, isAllDay, isDismissed, externalEventId, sync_status, sync_attempts, last_sync_error, last_sync_attempt_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                values
              );
              created++;
            } catch (e2) {
              // Skip duplicates silently
            }
          }
        }
      }
      
      if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= eventsToBackfill.length) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, eventsToBackfill.length)}/${eventsToBackfill.length} events processed, ${created} blocks created, ${skipped} skipped (no targets)`);
      }
    }
    
    console.log(`  DONE: ${created} shadow blocks created, ${skipped} events skipped (no targets)`);
  }
  
  // Final stats
  const [finalCount] = await conn.execute('SELECT COUNT(*) as cnt FROM shadow_blocks');
  console.log(`\n=== FINAL: ${finalCount[0].cnt} total shadow blocks in DB ===`);
  
  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
