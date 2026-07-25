import { createPool } from '/home/ubuntu/geeves-shopping/node_modules/mysql2/promise.js';

const pool = createPool(process.env.DATABASE_URL);

// Get column names for property_bookings
const [cols] = await pool.query(`SHOW COLUMNS FROM property_bookings`);
console.log('COLUMNS:', cols.map(c => c.Field).join(', '));

// Get all upcoming bookings grouped by property and platform
const [rows] = await pool.query(`
  SELECT 
    pb.id, pb.propertyId, pb.platformId, pb.bookingType, pb.checkIn, pb.checkOut, 
    pb.summary, pb.guestName,
    p.name as propertyName,
    pp.platform as platformType, pp.displayName as platformDisplay,
    pp.isActive as platformActive, pp.icalUrl
  FROM property_bookings pb
  JOIN properties p ON pb.propertyId = p.id
  LEFT JOIN property_platforms pp ON pb.platformId = pp.id
  WHERE p.householdId = 'V8lk3KJatvxBTWURf4uo9'
    AND pb.checkOut > UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 7 DAY)) * 1000
    AND pb.checkIn < UNIX_TIMESTAMP(DATE_ADD(NOW(), INTERVAL 90 DAY)) * 1000
  ORDER BY p.name, pp.platform, pb.checkIn
`);

// Group by property + platform
const grouped = {};
for (const r of rows) {
  const key = `${r.propertyName} | ${r.platformType || 'unknown'}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push({
    type: r.bookingType,
    checkIn: new Date(r.checkIn).toISOString().split('T')[0],
    checkOut: new Date(r.checkOut).toISOString().split('T')[0],
    summary: r.summary,
    guest: r.guestName,
    platformActive: r.platformActive,
    hasIcal: !!r.icalUrl
  });
}

for (const [key, entries] of Object.entries(grouped)) {
  console.log(`\n=== ${key} ===`);
  for (const e of entries) {
    const active = e.platformActive === 0 ? ' [INACTIVE]' : '';
    const noIcal = !e.hasIcal ? ' [NO_ICAL]' : '';
    console.log(`  [${e.type}] ${e.checkIn} → ${e.checkOut}${e.guest ? ' | ' + e.guest : ''}${e.summary ? ' | ' + e.summary : ''}${active}${noIcal}`);
  }
}

// Also get all platforms to see which ones have no bookings
const [platforms] = await pool.query(`
  SELECT pp.id, pp.platform, pp.displayName, pp.isActive, pp.icalUrl, pp.lastPolledAt,
    p.name as propertyName
  FROM property_platforms pp
  JOIN properties p ON pp.propertyId = p.id
  WHERE p.householdId = 'V8lk3KJatvxBTWURf4uo9'
  ORDER BY p.name, pp.platform
`);

console.log('\n\n=== ALL PLATFORMS ===');
for (const pp of platforms) {
  const lastPoll = pp.lastPolledAt ? new Date(pp.lastPolledAt).toISOString() : 'NEVER';
  const active = pp.isActive === 0 ? ' [INACTIVE]' : '';
  const hasIcal = pp.icalUrl ? ' [has_ical]' : ' [NO_ICAL]';
  console.log(`  ${pp.propertyName} | ${pp.platform} (${pp.displayName || 'no display name'})${active}${hasIcal} | last polled: ${lastPoll}`);
}

process.exit(0);
