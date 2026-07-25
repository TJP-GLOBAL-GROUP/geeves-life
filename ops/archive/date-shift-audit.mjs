import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Get The Artiste's Boutique property ID
const [props] = await conn.execute(`
  SELECT id, name FROM properties
  WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
  AND name LIKE '%Artiste%'
`);
console.log('\n=== Artiste\'s Boutique Property ===');
console.log(JSON.stringify(props, null, 2));

const propertyId = props[0]?.id;
if (!propertyId) { console.error('Property not found'); process.exit(1); }

// 2. Get all platforms for this property
const [platforms] = await conn.execute(`
  SELECT id, platform, icalUrl, isActive, lastPolledAt
  FROM property_platforms
  WHERE propertyId = ?
`, [propertyId]);
console.log('\n=== Platforms ===');
console.log(JSON.stringify(platforms, null, 2));

// 3. Get all bookings around Jul 2-3 for this property
const [bookings] = await conn.execute(`
  SELECT
    pb.id,
    pb.platformId,
    pb.icalUid,
    pb.guestName,
    pb.summary,
    pb.bookingType,
    pb.checkIn,
    pb.checkOut,
    pb.createdAt,
    pp.platform,
    FROM_UNIXTIME(pb.checkIn / 1000) AS checkInLocal,
    FROM_UNIXTIME(pb.checkOut / 1000) AS checkOutLocal,
    CONVERT_TZ(FROM_UNIXTIME(pb.checkIn / 1000), 'UTC', 'America/Jamaica') AS checkInJamaica,
    CONVERT_TZ(FROM_UNIXTIME(pb.checkOut / 1000), 'UTC', 'America/Jamaica') AS checkOutJamaica
  FROM property_bookings pb
  JOIN property_platforms pp ON pb.platformId = pp.id
  WHERE pp.propertyId = ?
  AND (
    pb.checkIn BETWEEN UNIX_TIMESTAMP('2026-07-01') * 1000 AND UNIX_TIMESTAMP('2026-07-05') * 1000
    OR pb.checkOut BETWEEN UNIX_TIMESTAMP('2026-07-01') * 1000 AND UNIX_TIMESTAMP('2026-07-05') * 1000
    OR (pb.checkIn <= UNIX_TIMESTAMP('2026-07-01') * 1000 AND pb.checkOut >= UNIX_TIMESTAMP('2026-07-05') * 1000)
  )
  ORDER BY pb.checkIn, pp.platform
`, [propertyId]);
console.log('\n=== Bookings around Jul 2-3 ===');
console.log(JSON.stringify(bookings, null, 2));

// 4. Also check what columns exist in property_bookings
const [cols] = await conn.execute(`
  DESCRIBE property_bookings
`);
console.log('\n=== property_bookings columns ===');
console.log(cols.map(c => `${c.Field} (${c.Type})`).join('\n'));

await conn.end();
