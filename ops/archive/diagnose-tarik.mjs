import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

// Find Tarik's household
const [users] = await conn.query(`SELECT id, name, email FROM users WHERE email LIKE '%tarik%' OR name LIKE '%Tarik%' LIMIT 5`);
console.log('=== Tarik users ===', JSON.stringify(users, null, 2));

const [members] = await conn.query(`
  SELECT hm.id, hm.userId, hm.householdId, hm.role, hm.displayName, u.email
  FROM household_members hm
  LEFT JOIN users u ON u.id = hm.userId
  WHERE u.email LIKE '%tarik%' OR hm.displayName LIKE '%Tarik%'
  LIMIT 5
`);
console.log('=== Tarik members ===', JSON.stringify(members, null, 2));

if (members.length > 0) {
  const hid = members[0].householdId;
  console.log(`\n=== Household ${hid} calendars ===`);
  const [cals] = await conn.query(`
    SELECT id, name, provider, verticalId, memberId, externalId, accountEmail
    FROM calendars WHERE householdId = ? ORDER BY name
  `, [hid]);
  for (const c of cals) {
    console.log(`  ${c.name.padEnd(40)} vertical=${String(c.verticalId||'NULL').padEnd(28)} ext=${c.externalId ? c.externalId.substring(0,30) : 'none'} acct=${c.accountEmail||''}`);
  }

  console.log(`\n=== Household ${hid} verticals ===`);
  const [verts] = await conn.query(`SELECT id, name FROM verticals WHERE householdId = ? ORDER BY name`, [hid]);
  console.log(JSON.stringify(verts, null, 2));

  console.log(`\n=== Shadow blocks for Test A ===`);
  const [sbs] = await conn.query(`
    SELECT sb.id, sb.sourceCalendarId, sb.targetCalendarId, sb.maskedTitle,
           e.title, e.startTime
    FROM shadow_blocks sb
    JOIN events e ON e.id = sb.sourceEventId
    WHERE e.title = 'Test A' AND sb.householdId = ?
  `, [hid]);
  console.log(JSON.stringify(sbs, null, 2));

  console.log(`\n=== Webhook channels for household ${hid} ===`);
  const [wcs] = await conn.query(`
    SELECT wc.id, wc.calendarId, wc.status, wc.expiresAt, c.name AS calName
    FROM webhook_channels wc
    JOIN calendars c ON c.id = wc.calendarId
    WHERE wc.householdId = ?
    ORDER BY wc.status, wc.expiresAt DESC
  `, [hid]);
  console.log(JSON.stringify(wcs, null, 2));
}

await conn.end();
