import { createConnection } from "mysql2/promise";

async function main() {
  const db = await createConnection(process.env.DATABASE_URL as string);

  console.log("\n=== EVENTS (Jul 2026+) ===");
  const [events] = await db.execute(`
    SELECT e.id, e.title, DATE_FORMAT(e.startTime,'%Y-%m-%d %H:%i') as startTime,
           e.calendarId, e.externalId,
           c.name as cal_name, c.accountEmail, c.verticalId,
           v.name as vertical_name
    FROM events e
    JOIN calendars c ON e.calendarId = c.id
    LEFT JOIN verticals v ON c.verticalId = v.id
    WHERE e.startTime >= '2026-07-01'
    ORDER BY e.startTime
  `);
  console.table(events);

  console.log("\n=== ALL CALENDARS (with vertical) ===");
  const [cals] = await db.execute(`
    SELECT c.id, c.name, c.accountEmail, c.verticalId, v.name as vertical_name, c.accessLevel
    FROM calendars c
    LEFT JOIN verticals v ON c.verticalId = v.id
    ORDER BY c.verticalId, c.id
  `);
  console.table(cals);

  console.log("\n=== SHADOW BLOCKS (all) ===");
  const [blocks] = await db.execute(`
    SELECT sb.id, sb.sourceEventId, sb.targetCalendarId, sb.maskedTitle, sb.isDismissed,
           c.name as target_cal_name
    FROM shadow_blocks sb
    JOIN calendars c ON sb.targetCalendarId = c.id
    ORDER BY sb.sourceEventId
  `);
  console.table(blocks);

  await db.end();
}

main().catch(console.error);
