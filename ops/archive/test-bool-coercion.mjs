// Test: does mysql2 coerce MySQL TINYINT(1) booleans to JS booleans?
// Drizzle ORM uses mysql2 under the hood. This confirms the exact type returned.
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Team StartOut: shadowBlocking = 0 in DB
const [rows] = await conn.query('SELECT id, name, shadowBlocking FROM calendars WHERE id = "AKbGvGfoorcX6G9bOFQni"');
const val = rows[0].shadowBlocking;
console.log('=== mysql2 raw TINYINT(1) boolean test ===');
console.log('column: shadowBlocking (DB value: 0)');
console.log('JS value:', val);
console.log('typeof:', typeof val);
console.log('=== false (strict):', val === false);
console.log('== false (loose):', val == false);
console.log('!val (falsy):', !val);
console.log('Boolean(val):', Boolean(val));

// Also test shadowBlocking = 1
const [rows2] = await conn.query('SELECT id, name, shadowBlocking FROM calendars WHERE id = "S6TrhZoBJZdG5W-EiV5hL"');
const val2 = rows2[0].shadowBlocking;
console.log('\ncolumn: shadowBlocking (DB value: 1)');
console.log('JS value:', val2);
console.log('typeof:', typeof val2);
console.log('=== true (strict):', val2 === true);
console.log('== true (loose):', val2 == true);
console.log('!!val2 (truthy):', !!val2);

await conn.end();
