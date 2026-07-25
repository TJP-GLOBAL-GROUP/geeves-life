import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

// 1. Find the source calendar for "Test A"
const [tevts] = await conn.query(`
  SELECT e.id AS eventId, e.title, e.calendarId, e.startTime,
         c.name AS calName, c.verticalId, c.memberId, c.provider, c.externalId
  FROM events e
  JOIN calendars c ON c.id = e.calendarId
  WHERE e.title = 'Test A'
  ORDER BY e.startTime DESC LIMIT 5
`);
console.log('\n=== Test A events ===');
console.log(JSON.stringify(tevts, null, 2));

// 2. Check all calendars in the same vertical as the source
if (tevts.length > 0) {
  const srcCal = tevts[0];
  console.log(`\n=== Calendars in vertical "${srcCal.verticalId}" ===`);
  if (srcCal.verticalId) {
    const [siblings] = await conn.query(`
      SELECT id, name, memberId, provider, externalId IS NOT NULL AS hasExt
      FROM calendars WHERE verticalId = ?
    `, [srcCal.verticalId]);
    console.log(JSON.stringify(siblings, null, 2));
  } else {
    console.log('  Source calendar has NO verticalId — shadow blocks cannot propagate!');
  }
}

// 3. Check shadow blocks for Test A
const [sbs] = await conn.query(`
  SELECT sb.*, e.title AS eventTitle, e.startTime
  FROM shadow_blocks sb
  JOIN events e ON e.id = sb.sourceEventId
  WHERE e.title = 'Test A'
`);
console.log('\n=== Shadow blocks for Test A ===');
console.log(JSON.stringify(sbs, null, 2));

// 4. Check all calendars with their verticalId (just the ones with externalId)
const [realCals] = await conn.query(`
  SELECT id, name, provider, verticalId, memberId, externalId,
         (SELECT COUNT(*) FROM webhook_channels wc WHERE wc.calendarId = calendars.id AND wc.status='active') AS activeWebhooks
  FROM calendars
  WHERE externalId IS NOT NULL
  ORDER BY name
  LIMIT 30
`);
console.log('\n=== Real (synced) calendars ===');
for (const c of realCals) {
  console.log(`  ${c.name.padEnd(40)} vertical=${String(c.verticalId||'NULL').padEnd(28)} webhooks=${c.activeWebhooks} provider=${c.provider}`);
}

// 5. Check verticals table
const [verts] = await conn.query(`SELECT id, name, householdId FROM verticals ORDER BY name LIMIT 20`);
console.log('\n=== Verticals ===');
console.log(JSON.stringify(verts, null, 2));

await conn.end();
