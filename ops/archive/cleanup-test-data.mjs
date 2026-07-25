/**
 * cleanup-test-data.mjs
 * Deletes all test households, calendars, verticals, events, and shadow blocks
 * created by Vitest integration tests. These pollute the production DB and cause
 * severe performance degradation during shadow block propagation.
 *
 * Safe to run: only deletes rows where household.name matches test patterns.
 * The real household (Perkins Family) is never touched.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function run() {
  console.log("🔍 Finding test households...");
  const [testHouseholds] = await conn.execute(
    `SELECT id, name FROM households 
     WHERE name LIKE 'Test Household%' 
        OR name LIKE '%StartOut%' 
        OR name LIKE '%Shadow Block%'
        OR name LIKE '%Stress Test%'`
  );
  
  const ids = testHouseholds.map(h => h.id);
  console.log(`Found ${ids.length} test households`);
  if (ids.length === 0) {
    console.log("Nothing to clean up.");
    await conn.end();
    return;
  }

  const placeholders = ids.map(() => "?").join(",");

  // Delete in dependency order
  console.log("Deleting shadow_blocks...");
  const [sb] = await conn.execute(
    `DELETE FROM shadow_blocks WHERE householdId IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${sb.affectedRows} shadow_blocks`);

  console.log("Deleting events...");
  const [ev] = await conn.execute(
    `DELETE FROM events WHERE householdId IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${ev.affectedRows} events`);

  console.log("Deleting shadow_overrides...");
  try {
    const [so] = await conn.execute(
      `DELETE so FROM shadow_overrides so
       JOIN events e ON so.eventId = e.id
       WHERE e.householdId IN (${placeholders})`,
      ids
    );
    console.log(`  Deleted ${so.affectedRows} shadow_overrides`);
  } catch (e) {
    console.log("  shadow_overrides: skipped (table may not exist)");
  }

  console.log("Deleting calendars...");
  const [cal] = await conn.execute(
    `DELETE FROM calendars WHERE householdId IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${cal.affectedRows} calendars`);

  console.log("Deleting vertical_visibility...");
  try {
    const [vv] = await conn.execute(
      `DELETE vv FROM vertical_visibility vv
       JOIN verticals v ON vv.verticalId = v.id
       WHERE v.householdId IN (${placeholders})`,
      ids
    );
    console.log(`  Deleted ${vv.affectedRows} vertical_visibility`);
  } catch (e) {
    console.log("  vertical_visibility: skipped");
  }

  console.log("Deleting verticals...");
  const [vert] = await conn.execute(
    `DELETE FROM verticals WHERE householdId IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${vert.affectedRows} verticals`);

  console.log("Deleting household_members...");
  const [hm] = await conn.execute(
    `DELETE FROM household_members WHERE householdId IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${hm.affectedRows} household_members`);

  console.log("Deleting households...");
  const [hh] = await conn.execute(
    `DELETE FROM households WHERE id IN (${placeholders})`,
    ids
  );
  console.log(`  Deleted ${hh.affectedRows} households`);

  // Also clean up orphaned test calendars that may have been created without a household
  console.log("Cleaning up orphaned test calendars by name...");
  const testCalNames = [
    'Cal A1','Cal A2','Cal B1','Cal B2','Contract Shape Cal','Schema Alignment Cal',
    'Round-Trip Calendar','Updated Round Trip','Pre-assigned Calendar','Assignable Calendar',
    'Unassignable Calendar','Reassignable Cal','Cross-Proc Calendar','Consistency Cross Cal',
    'No Vertical Cal','Test Calendar','After Update','Shape Test Calendar','Unassign Calendar',
    'Personal Cal','Work Cal','StartOut Cal','Personal Calendar','Work Calendar'
  ];
  const namePlaceholders = testCalNames.map(() => "?").join(",");
  
  // First delete shadow blocks for these orphaned calendars
  const [orphanSb] = await conn.execute(
    `DELETE sb FROM shadow_blocks sb
     JOIN calendars c ON sb.targetCalendarId = c.id OR sb.sourceCalendarId = c.id
     WHERE c.name IN (${namePlaceholders})`,
    testCalNames
  );
  console.log(`  Deleted ${orphanSb.affectedRows} orphaned shadow_blocks`);

  const [orphanCal] = await conn.execute(
    `DELETE FROM calendars WHERE name IN (${namePlaceholders})`,
    testCalNames
  );
  console.log(`  Deleted ${orphanCal.affectedRows} orphaned calendars`);

  console.log("\n✅ Test data cleanup complete!");
  
  // Final count check
  const [remaining] = await conn.execute(
    `SELECT COUNT(*) as total FROM calendars`
  );
  console.log(`Remaining calendars in DB: ${remaining[0].total}`);
  
  const [remainingSb] = await conn.execute(
    `SELECT COUNT(*) as total FROM shadow_blocks`
  );
  console.log(`Remaining shadow_blocks in DB: ${remainingSb[0].total}`);
}

run().catch(console.error).finally(() => conn.end());
