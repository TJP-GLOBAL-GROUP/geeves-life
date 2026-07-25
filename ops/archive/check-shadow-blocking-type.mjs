/**
 * Diagnostic: check what type Drizzle ORM returns for the shadowBlocking column
 * on the Family calendar (id: 3G4xLGLPqNy_xLasJlO-l, shadowBlocking=0 in DB)
 */
import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// 1. Raw mysql2 value
const [rawRows] = await conn.execute(
  'SELECT id, name, shadowBlocking FROM calendars WHERE id = ?',
  ['3G4xLGLPqNy_xLasJlO-l']
);
const raw = rawRows[0];
console.log('=== RAW mysql2 ===');
console.log('shadowBlocking value:', raw.shadowBlocking);
console.log('typeof:', typeof raw.shadowBlocking);
console.log('=== false:', raw.shadowBlocking === false);
console.log('!val:', !raw.shadowBlocking);
console.log('== 0:', raw.shadowBlocking == 0);
console.log('=== 0:', raw.shadowBlocking === 0);

// 2. All calendars with shadowBlocking=0
const [optedOut] = await conn.execute(
  'SELECT id, name, shadowBlocking FROM calendars WHERE shadowBlocking = 0'
);
console.log('\n=== ALL OPTED-OUT CALENDARS ===');
for (const row of optedOut) {
  console.log(`  ${row.name} (${row.id}): value=${row.shadowBlocking}, type=${typeof row.shadowBlocking}, !val=${!row.shadowBlocking}`);
}

await conn.end();
