import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Check the duplicate calendar records for the two affected accounts
const [dupes] = await conn.execute(`
  SELECT id, externalId, name, accountEmail, provider, verticalId, householdId, createdAt
  FROM calendars
  WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
  AND accountEmail IN ('tarik.perkins@startout.org','tarikp@gmail.com')
  ORDER BY accountEmail, createdAt
`);

console.log('\n=== Duplicate Calendar Records ===');
console.log(JSON.stringify(dupes, null, 2));

// 2. Check iCal property booking calendars
const [icalCals] = await conn.execute(`
  SELECT id, externalId, name, accountEmail, provider, verticalId, householdId
  FROM calendars
  WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
  AND provider = 'ical'
  ORDER BY name
`);
console.log('\n=== iCal Property Booking Calendars ===');
console.log(JSON.stringify(icalCals, null, 2));

// 3. Check which verticals exist for the household
const [verticals] = await conn.execute(`
  SELECT id, name, slug FROM verticals WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
`);
console.log('\n=== Verticals ===');
console.log(JSON.stringify(verticals, null, 2));

await conn.end();
