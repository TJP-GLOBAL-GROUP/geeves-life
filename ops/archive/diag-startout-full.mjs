import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

const TARGET_CAL = "AKbGvGfoorcX6G9bOFQni"; // Team StartOut

// 1. Shadow blocks targeting Team StartOut
const [shadowBlocks] = await db.query(
  `SELECT id, sourceCalendarId, maskedTitle, createdAt, updatedAt
   FROM shadow_blocks
   WHERE targetCalendarId = ?
   ORDER BY createdAt DESC
   LIMIT 20`,
  [TARGET_CAL]
);
console.log("\n=== shadow_blocks targeting Team StartOut ===");
console.log(`Count: ${shadowBlocks.length}`);
console.table(shadowBlocks);

// 2. Total count
const [[{ total: shadowTotal }]] = await db.query(
  `SELECT COUNT(*) as total FROM shadow_blocks WHERE targetCalendarId = ?`,
  [TARGET_CAL]
);
console.log(`Total shadow_blocks: ${shadowTotal}`);

// 3. Calendar events targeting Team StartOut (propagated events)
const [calEvents] = await db.query(
  `SELECT id, calendarId, title, startTime, createdAt, sourceEventId, isShadowBlock
   FROM calendar_events
   WHERE calendarId = ?
   ORDER BY createdAt DESC
   LIMIT 20`,
  [TARGET_CAL]
);
console.log("\n=== calendar_events on Team StartOut ===");
console.log(`Count shown: ${calEvents.length}`);
console.table(calEvents);

const [[{ evTotal }]] = await db.query(
  `SELECT COUNT(*) as evTotal FROM calendar_events WHERE calendarId = ?`,
  [TARGET_CAL]
);
console.log(`Total calendar_events: ${evTotal}`);

// 4. Shadow blocks by source calendar
const [bySource] = await db.query(
  `SELECT sourceCalendarId, COUNT(*) as cnt
   FROM shadow_blocks
   WHERE targetCalendarId = ?
   GROUP BY sourceCalendarId`,
  [TARGET_CAL]
);
console.log("\n=== shadow_blocks grouped by source ===");
console.table(bySource);

// 5. Calendar events with isShadowBlock=1 on Team StartOut
const [[{ shadowEvCount }]] = await db.query(
  `SELECT COUNT(*) as shadowEvCount FROM calendar_events WHERE calendarId = ? AND isShadowBlock = 1`,
  [TARGET_CAL]
);
console.log(`\ncalendar_events with isShadowBlock=1: ${shadowEvCount}`);

// 6. Team StartOut calendar config
const [[calConfig]] = await db.query(
  `SELECT id, name, accountEmail, shadowBlocking, syncStatus, verticalId
   FROM calendars WHERE id = ?`,
  [TARGET_CAL]
);
console.log("\n=== Team StartOut calendar config ===");
console.table([calConfig]);

// 7. Most recent shadow_blocks writes (to check if new ones are being added after the fix)
const [recent] = await db.query(
  `SELECT id, sourceCalendarId, targetCalendarId, maskedTitle, createdAt
   FROM shadow_blocks
   WHERE targetCalendarId = ?
   ORDER BY createdAt DESC
   LIMIT 5`,
  [TARGET_CAL]
);
console.log("\n=== Most recent shadow_blocks (newest first) ===");
console.table(recent);

// 8. Vertical visibility rules that include Team StartOut
const [vertRules] = await db.query(
  `SELECT vv.*, v.name as verticalName
   FROM vertical_visibility vv
   LEFT JOIN verticals v ON v.id = vv.verticalId
   WHERE vv.targetCalendarId = ? OR vv.sourceCalendarId = ?`,
  [TARGET_CAL, TARGET_CAL]
);
console.log("\n=== vertical_visibility rules involving Team StartOut ===");
console.table(vertRules);

await db.end();
