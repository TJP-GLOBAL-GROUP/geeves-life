import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: match[3], port: parseInt(match[4]),
  user: match[1], password: match[2],
  database: match[5].split('?')[0],
  ssl: { rejectUnauthorized: false }
});

const [cals] = await conn.execute(`
  SELECT c.id, c.name, c.externalId, c.verticalId, v.name as verticalName
  FROM calendars c
  LEFT JOIN verticals v ON c.verticalId = v.id
  WHERE c.name LIKE '%axfield%' OR c.name LIKE '%Maxfield%'
`);
console.log('Maxfield calendars:');
for (const c of cals) {
  console.log(`  ${c.name} | vertical: ${c.verticalName || 'NONE'} (${c.verticalId || 'null'}) | externalId: ${c.externalId}`);
}

const [rules] = await conn.execute(`
  SELECT vv.id, vv.fromVerticalId, vv.toVerticalId, vv.visibilityLevel, vv.busyLabel,
         v1.name as fromName, v2.name as toName
  FROM vertical_visibility vv
  LEFT JOIN verticals v1 ON vv.fromVerticalId = v1.id
  LEFT JOIN verticals v2 ON vv.toVerticalId = v2.id
`);
console.log('\nVisibility rules:');
for (const r of rules) {
  console.log(`  ${r.fromName} → ${r.toName} | level: ${r.visibilityLevel} | label: ${r.busyLabel}`);
}

// Check what vertical tarikp@gmail.com is in
const [gmail] = await conn.execute(`
  SELECT c.id, c.name, c.externalId, c.verticalId, v.name as verticalName
  FROM calendars c
  LEFT JOIN verticals v ON c.verticalId = v.id
  WHERE c.externalId = 'tarikp@gmail.com'
`);
console.log('\ntarikp@gmail.com calendar:');
for (const c of gmail) {
  console.log(`  ${c.name} | vertical: ${c.verticalName} (${c.verticalId})`);
}

await conn.end();
