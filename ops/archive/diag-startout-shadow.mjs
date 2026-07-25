import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

console.log("=== 1. StartOut calendars (all columns) ===");
const [cals] = await db.query(
  `SELECT id, name, accountEmail, memberId, shadowBlocking, isVisible, syncStatus, verticalId
   FROM calendars
   WHERE accountEmail IN ('tarik@startout.org','team@startout.org')
   ORDER BY accountEmail, name`
);
console.table(cals);

console.log("\n=== 2. shadow_blocks rows targeting team@startout.org calendar ===");
// First find the team cal id
const teamCal = cals.find(c => c.accountEmail === 'team@startout.org');
if (teamCal) {
  const [blocks] = await db.query(
    `SELECT id, sourceCalendarId, targetCalendarId, sourceEventId, maskedTitle, startTime, endTime, createdAt
     FROM shadow_blocks
     WHERE targetCalendarId = ?
     ORDER BY createdAt DESC
     LIMIT 30`,
    [teamCal.id]
  );
  console.log(`Team cal ID: ${teamCal.id} | shadowBlocking raw value: ${teamCal.shadowBlocking} | typeof: ${typeof teamCal.shadowBlocking}`);
  console.log(`Total shadow blocks found: ${blocks.length}`);
  if (blocks.length > 0) console.table(blocks.slice(0, 10));
} else {
  console.log("No team@startout.org calendar found in DB");
}

console.log("\n=== 3. shadow_blocks rows FROM tarik@startout.org calendars ===");
const tarikCals = cals.filter(c => c.accountEmail === 'tarik@startout.org');
for (const cal of tarikCals) {
  const [blocks] = await db.query(
    `SELECT id, sourceCalendarId, targetCalendarId, maskedTitle, startTime, endTime, createdAt
     FROM shadow_blocks
     WHERE sourceCalendarId = ?
     ORDER BY createdAt DESC
     LIMIT 10`,
    [cal.id]
  );
  console.log(`\nSource cal: ${cal.name} (${cal.id}) → ${blocks.length} shadow blocks written`);
  if (blocks.length > 0) console.table(blocks.slice(0, 5));
}

console.log("\n=== 4. Vertical visibility rules for StartOut calendars ===");
const calIds = cals.map(c => `'${c.id}'`).join(',');
if (calIds.length > 2) {
  const [rules] = await db.query(
    `SELECT vv.id, vv.calendarId, vv.verticalId, vv.accessLevel, v.name as verticalName
     FROM vertical_visibility vv
     LEFT JOIN verticals v ON v.id = vv.verticalId
     WHERE vv.calendarId IN (${calIds})`
  );
  console.table(rules);
}

console.log("\n=== 5. Verticals that include StartOut calendars ===");
const [verticals] = await db.query(
  `SELECT v.id, v.name, v.calendarIds
   FROM verticals v
   WHERE JSON_OVERLAPS(v.calendarIds, JSON_ARRAY(${cals.map(c => `'${c.id}'`).join(',')}))`
);
console.table(verticals.map(v => ({ ...v, calendarIds: JSON.stringify(v.calendarIds) })));

console.log("\n=== 6. Recent propagation jobs / sync events for StartOut ===");
const [syncLogs] = await db.query(
  `SELECT id, calendarId, status, errorMessage, createdAt
   FROM calendar_sync_logs
   WHERE calendarId IN (${calIds})
   ORDER BY createdAt DESC
   LIMIT 20`
).catch(() => [[]]);
console.table(syncLogs);

await db.end();
