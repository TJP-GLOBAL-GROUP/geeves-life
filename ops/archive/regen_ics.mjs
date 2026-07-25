import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const MORABEZA = 'nJnk4hr3AxZJZ-RkwhRJy';

// Check for bookings on Morabeza whose platformId doesn't belong to a Morabeza platform (causes "Unknown platform")
const [orphans] = await conn.execute(`
  SELECT pb.id, pb.platformId, pb.guestName, pb.summary, pp.propertyId as platformProperty, pp.platform, pp.displayName
  FROM property_bookings pb
  LEFT JOIN property_platforms pp ON pp.id = pb.platformId
  WHERE pb.propertyId = ? AND pb.bookingStatus = 'confirmed' AND (pp.propertyId != ? OR pp.id IS NULL)
`, [MORABEZA, MORABEZA]);

console.log('Morabeza bookings with mismatched platform rows:', orphans.length);
for (const o of orphans.slice(0, 5)) {
  console.log(' -', o.summary || o.guestName, '| platform row belongs to:', o.platformProperty, '|', o.platform, o.displayName);
}

await conn.end();
