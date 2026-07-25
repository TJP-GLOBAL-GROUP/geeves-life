import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find the startout calendar(s)
const [cals] = await conn.execute(
  `SELECT id, name, externalId, accountEmail, memberId, lastSyncedAt, createdAt
   FROM calendars
   WHERE accountEmail LIKE '%startout%' OR name LIKE '%startout%' OR externalId LIKE '%startout%'
   ORDER BY createdAt`
);
console.log("=== STARTOUT CALENDARS ===");
console.log(JSON.stringify(cals, null, 2));

if (cals.length === 0) {
  console.log("\nNo startout calendars found by email/name. Listing all calendars:");
  const [allCals] = await conn.execute(
    `SELECT id, name, externalId, accountEmail, memberId FROM calendars ORDER BY createdAt LIMIT 60`
  );
  console.log(JSON.stringify(allCals, null, 2));
  await conn.end();
  process.exit(0);
}

for (const cal of cals) {
  const calId = cal.id;
  console.log("\n=== AUDIT FOR: " + cal.name + " (" + calId + ") ===");
  console.log("Account: " + cal.accountEmail);

  const [[totalRow]] = await conn.execute(`SELECT COUNT(*) as total FROM events WHERE calendarId = ?`, [calId]);
  console.log("Total events in DB: " + totalRow.total);

  const [byHour] = await conn.execute(
    `SELECT DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-%d %H:00') as hour, COUNT(*) as count
     FROM events WHERE calendarId = ?
       AND createdAt >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 7 DAY)) * 1000
     GROUP BY hour ORDER BY hour DESC LIMIT 168`, [calId]
  );
  console.log("\nEvents created per hour (last 7 days):");
  console.log(JSON.stringify(byHour, null, 2));

  const [[peakRow]] = await conn.execute(
    `SELECT DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-%d %H:00') as hour, COUNT(*) as count
     FROM events WHERE calendarId = ? GROUP BY hour ORDER BY count DESC LIMIT 1`, [calId]
  );
  console.log("Peak creation hour: " + peakRow?.hour + " — " + peakRow?.count + " events");

  const [[last7]] = await conn.execute(
    `SELECT COUNT(*) as total FROM events WHERE calendarId = ?
       AND createdAt >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 7 DAY)) * 1000`, [calId]
  );
  console.log("Events created in last 7 days: " + last7.total);

  const [[last3]] = await conn.execute(
    `SELECT COUNT(*) as total FROM events WHERE calendarId = ?
       AND createdAt >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 3 DAY)) * 1000`, [calId]
  );
  console.log("Events created in last 3 days: " + last3.total);

  const [shadowsTo] = await conn.execute(
    `SELECT COUNT(*) as total, MIN(createdAt) as oldest, MAX(createdAt) as newest
     FROM shadow_blocks WHERE targetCalendarId = ?`, [calId]
  );
  console.log("\nShadow blocks targeting this calendar: " + shadowsTo[0].total);

  const [shadowsFrom] = await conn.execute(
    `SELECT COUNT(*) as total, MIN(createdAt) as oldest, MAX(createdAt) as newest
     FROM shadow_blocks WHERE sourceCalendarId = ?`, [calId]
  );
  console.log("Shadow blocks sourced from this calendar: " + shadowsFrom[0].total);

  const [webhooks] = await conn.execute(
    `SELECT id, channelId, status, expiresAt, createdAt FROM webhook_channels
     WHERE calendarId = ? ORDER BY createdAt DESC LIMIT 10`, [calId]
  );
  console.log("\nWebhook channels (last 10):");
  console.log(JSON.stringify(webhooks, null, 2));

  const [sources] = await conn.execute(
    `SELECT source, COUNT(*) as count FROM events WHERE calendarId = ? GROUP BY source ORDER BY count DESC`, [calId]
  );
  console.log("\nEvent sources breakdown:");
  console.log(JSON.stringify(sources, null, 2));

  const [[dupsRemaining]] = await conn.execute(
    `SELECT COUNT(*) as dupGroups FROM (
       SELECT externalId, COUNT(*) as cnt FROM events WHERE calendarId = ?
       GROUP BY externalId HAVING cnt > 1
     ) sub`, [calId]
  );
  console.log("\nDuplicate event groups still in DB: " + dupsRemaining.dupGroups);

  const [[noExtId]] = await conn.execute(
    `SELECT COUNT(*) as total FROM events WHERE calendarId = ? AND (externalId IS NULL OR externalId = '')`, [calId]
  );
  console.log("Events with no externalId (Geeves-created): " + noExtId.total);
}

// Propagation targets
console.log("\n=== PROPAGATION TARGETS CHECK ===");
const [propTargets] = await conn.execute(
  `SELECT pt.id, pt.sourceCalendarId, pt.targetCalendarId,
          c1.name as sourceName, c1.accountEmail as sourceEmail,
          c2.name as targetName, c2.accountEmail as targetEmail
   FROM propagation_targets pt
   JOIN calendars c1 ON c1.id = pt.sourceCalendarId
   JOIN calendars c2 ON c2.id = pt.targetCalendarId
   WHERE c1.accountEmail LIKE '%startout%' OR c2.accountEmail LIKE '%startout%'
      OR c1.name LIKE '%startout%' OR c2.name LIKE '%startout%'`
);
console.log("Propagation targets involving startout: " + propTargets.length);
console.log(JSON.stringify(propTargets, null, 2));

// Events table columns
const [cols] = await conn.execute(`SHOW COLUMNS FROM events`);
console.log("\n=== EVENTS TABLE COLUMNS ===");
console.log(cols.map(c => c.Field + " (" + c.Type + ")").join('\n'));

await conn.end();
console.log("\n=== AUDIT COMPLETE ===");
