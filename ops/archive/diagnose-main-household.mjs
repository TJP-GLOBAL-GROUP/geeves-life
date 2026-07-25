import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

const hid = 'V8lk3KJatvxBTWURf4uo9';

console.log(`=== Household ${hid} members ===`);
const [mems] = await conn.query(`
  SELECT hm.id, hm.userId, hm.role, hm.displayName, hm.status, u.email
  FROM household_members hm
  LEFT JOIN users u ON u.id = hm.userId
  WHERE hm.householdId = ?
`, [hid]);
console.log(JSON.stringify(mems, null, 2));

console.log(`\n=== Household ${hid} calendars ===`);
const [cals] = await conn.query(`
  SELECT id, name, provider, verticalId, memberId, externalId, accountEmail
  FROM calendars WHERE householdId = ? ORDER BY name
`, [hid]);
for (const c of cals) {
  console.log(`  ${c.name.padEnd(45)} vertical=${String(c.verticalId||'NULL').padEnd(28)} ext=${c.externalId ? c.externalId.substring(0,35) : 'none'} acct=${c.accountEmail||''}`);
}

console.log(`\n=== Household ${hid} verticals ===`);
const [verts] = await conn.query(`SELECT id, name FROM verticals WHERE householdId = ? ORDER BY name`, [hid]);
console.log(JSON.stringify(verts, null, 2));

console.log(`\n=== Test A events in this household ===`);
const [tevts] = await conn.query(`
  SELECT e.id, e.title, e.calendarId, e.startTime, e.externalId,
         c.name AS calName, c.verticalId
  FROM events e
  JOIN calendars c ON c.id = e.calendarId
  WHERE e.title LIKE '%Test A%' AND c.householdId = ?
  ORDER BY e.startTime DESC LIMIT 10
`, [hid]);
console.log(JSON.stringify(tevts, null, 2));

console.log(`\n=== All recent events in this household ===`);
const [revts] = await conn.query(`
  SELECT e.id, e.title, e.calendarId, e.startTime,
         c.name AS calName, c.verticalId
  FROM events e
  JOIN calendars c ON c.id = e.calendarId
  WHERE c.householdId = ?
  ORDER BY e.startTime DESC LIMIT 15
`, [hid]);
for (const e of revts) {
  console.log(`  "${e.title}" cal="${e.calName}" vertical=${e.verticalId||'NULL'} start=${new Date(Number(e.startTime)).toISOString()}`);
}

console.log(`\n=== Shadow blocks in this household ===`);
const [sbs] = await conn.query(`
  SELECT sb.id, sb.sourceCalendarId, sb.targetCalendarId, sb.maskedTitle, sb.isDismissed,
         e.title, e.startTime
  FROM shadow_blocks sb
  JOIN events e ON e.id = sb.sourceEventId
  WHERE sb.householdId = ?
  ORDER BY e.startTime DESC LIMIT 10
`, [hid]);
console.log(JSON.stringify(sbs, null, 2));

console.log(`\n=== Webhook channels for this household ===`);
const [wcs] = await conn.query(`
  SELECT wc.id, wc.calendarId, wc.status, wc.expiresAt, c.name AS calName
  FROM webhook_channels wc
  JOIN calendars c ON c.id = wc.calendarId
  WHERE wc.householdId = ?
  ORDER BY wc.status, wc.expiresAt DESC
`, [hid]);
console.log(JSON.stringify(wcs, null, 2));

await conn.end();
