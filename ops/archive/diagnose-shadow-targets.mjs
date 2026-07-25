import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

const hid = 'V8lk3KJatvxBTWURf4uo9';

// Source calendar for Test A
const srcCalId = 'e8BL36lQOC8SL2kv-VZQf';
// Shadow block target calendars
const tgt1 = '3G4xLGLPqNy_xLasJlO-l';
const tgt2 = 'el3GMTdh2GayCrhvTl3m0';

const [cals] = await conn.query(`
  SELECT id, name, provider, verticalId, memberId, accountEmail, externalId
  FROM calendars WHERE id IN (?, ?, ?)
`, [srcCalId, tgt1, tgt2]);

console.log('=== Source + Target calendars ===');
for (const c of cals) {
  const role = c.id === srcCalId ? 'SOURCE' : 'TARGET';
  console.log(`  [${role}] ${c.name.padEnd(45)} vertical=${String(c.verticalId||'NULL').padEnd(28)} member=${c.memberId} acct=${c.accountEmail||''}`);
}

// All calendars in the "Personal" vertical (tjpfam-vert-self)
const [selfVert] = await conn.query(`
  SELECT id, name, provider, verticalId, memberId, accountEmail
  FROM calendars WHERE verticalId = 'tjpfam-vert-self' AND householdId = ?
`, [hid]);
console.log('\n=== All calendars in Personal vertical (tjpfam-vert-self) ===');
for (const c of selfVert) {
  console.log(`  ${c.name.padEnd(45)} member=${c.memberId} acct=${c.accountEmail||''}`);
}

// The calendar view query — what does the calendar page actually show for the user?
// Check if shadow blocks are being returned for the right calendarIds
console.log('\n=== Are target calendars visible in the calendar view? ===');
const [calVis] = await conn.query(`
  SELECT id, name, isVisible, verticalId FROM calendars WHERE id IN (?, ?) 
`, [tgt1, tgt2]);
console.log(JSON.stringify(calVis, null, 2));

// Check if the calendar router's list query would include shadow blocks
// The issue might be that shadow blocks are shown but the user doesn't see them
// because the target calendar isn't in their visible set
console.log('\n=== All household calendars with isVisible ===');
const [allCals] = await conn.query(`
  SELECT id, name, isVisible, verticalId, memberId FROM calendars WHERE householdId = ? ORDER BY name
`, [hid]);
for (const c of allCals) {
  console.log(`  ${c.name.padEnd(45)} visible=${c.isVisible} vertical=${String(c.verticalId||'NULL').padEnd(28)} member=${c.memberId}`);
}

await conn.end();
