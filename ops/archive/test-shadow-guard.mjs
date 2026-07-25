/**
 * Test: verify that the shadowBlocking guard correctly skips opted-out calendars
 * when using Drizzle ORM (which coerces TINYINT(1) to JS boolean via typeCast)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

// Simulate what Drizzle does with typeCast
const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  typeCast: function(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1';
    }
    return next();
  }
});

const [rows] = await conn.execute(
  'SELECT id, name, shadowBlocking FROM calendars WHERE householdId = ? ORDER BY name',
  ['V8lk3KJatvxBTWURf4uo9']
);

console.log('=== SHADOW BLOCKING VALUES (Drizzle typeCast simulation) ===');
for (const row of rows) {
  const val = row.shadowBlocking;
  const guardPasses = !val; // This is the guard: if (!shadowBlocking) skip
  if (!val) {
    console.log(`  SKIP: ${row.name} (${row.id}) — shadowBlocking=${val} (${typeof val}), guard=SKIP`);
  }
}

console.log('\n=== ALL OPTED-OUT CALENDARS ===');
const optedOut = rows.filter(r => !r.shadowBlocking);
console.log(`Found ${optedOut.length} opted-out calendars`);
for (const row of optedOut) {
  console.log(`  ${row.name} (${row.id}): value=${row.shadowBlocking}, type=${typeof row.shadowBlocking}`);
}

// Now check if the guard would correctly skip the Family calendar
const familyCal = rows.find(r => r.id === '3G4xLGLPqNy_xLasJlO-l');
if (familyCal) {
  console.log('\n=== FAMILY CALENDAR GUARD TEST ===');
  console.log(`shadowBlocking value: ${familyCal.shadowBlocking}`);
  console.log(`typeof: ${typeof familyCal.shadowBlocking}`);
  console.log(`!val (guard): ${!familyCal.shadowBlocking}`);
  console.log(`Guard would SKIP: ${!familyCal.shadowBlocking ? 'YES (correct)' : 'NO (BUG!)'}`);
}

await conn.end();
