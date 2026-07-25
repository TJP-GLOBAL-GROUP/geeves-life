/**
 * calendar-dup-audit.mjs
 * Audits all duplicate calendar records (same householdId + externalId)
 * and shows event counts, verticalId assignments, and which is canonical.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find all duplicate (householdId, externalId) pairs
const [dupPairs] = await conn.execute(`
  SELECT householdId, externalId, COUNT(*) as cnt
  FROM calendars
  WHERE externalId IS NOT NULL AND externalId != ''
  GROUP BY householdId, externalId
  HAVING cnt > 1
  ORDER BY cnt DESC
`);

console.log(`\n=== DUPLICATE CALENDAR PAIRS (${dupPairs.length} found) ===\n`);

for (const pair of dupPairs) {
  const [cals] = await conn.execute(`
    SELECT c.id, c.name, c.externalId, c.accountEmail, c.verticalId, c.provider,
           c.accessLevel, c.createdAt,
           (SELECT COUNT(*) FROM events e WHERE e.calendarId = c.id) as eventCount,
           (SELECT COUNT(*) FROM shadow_blocks sb WHERE sb.targetCalendarId = c.id) as shadowCount
    FROM calendars c
    WHERE c.householdId = ? AND c.externalId = ?
    ORDER BY c.createdAt ASC
  `, [pair.householdId, pair.externalId]);

  console.log(`Household: ${pair.householdId}`);
  console.log(`ExternalId: ${pair.externalId}  (${pair.cnt} copies)`);
  console.log(`─────────────────────────────────────────────────────`);
  for (const cal of cals) {
    const canonical = cal.verticalId ? "✅ HAS verticalId" : "❌ NO verticalId";
    console.log(`  ID:          ${cal.id}`);
    console.log(`  Name:        ${cal.name}`);
    console.log(`  AccountEmail:${cal.accountEmail}`);
    console.log(`  VerticalId:  ${cal.verticalId || "NULL"} ${canonical}`);
    console.log(`  Provider:    ${cal.provider}`);
    console.log(`  AccessLevel: ${cal.accessLevel}`);
    console.log(`  Events:      ${cal.eventCount}`);
    console.log(`  ShadowBlocks:${cal.shadowCount}`);
    console.log(`  CreatedAt:   ${cal.createdAt}`);
    console.log();
  }
  console.log();
}

// 2. Also check for calendars with no externalId that share accountEmail + name
const [noExtIdDups] = await conn.execute(`
  SELECT householdId, accountEmail, name, COUNT(*) as cnt
  FROM calendars
  WHERE (externalId IS NULL OR externalId = '')
    AND accountEmail IS NOT NULL
  GROUP BY householdId, accountEmail, name
  HAVING cnt > 1
`);

if (noExtIdDups.length > 0) {
  console.log(`\n=== DUPLICATE CALENDARS WITH NO externalId (${noExtIdDups.length} found) ===\n`);
  for (const pair of noExtIdDups) {
    console.log(`  Household: ${pair.householdId}, Email: ${pair.accountEmail}, Name: ${pair.name}, Count: ${pair.cnt}`);
  }
}

await conn.end();
console.log("\nAudit complete.");
