import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL || '');
const propNames = ['Morabeza', 'Sunset Studio', "The Artiste's Boutique"];
const placeholders = propNames.map(() => '?').join(',');

// 1. Properties
const [props] = await conn.execute(
  `SELECT id, name, isActive FROM properties WHERE name IN (${placeholders}) ORDER BY name`,
  propNames
);
console.log('\n=== PROPERTIES ===');
props.forEach(p => console.log(`  ${p.name} | active=${p.isActive} | id=${p.id}`));

// 2. Platform configs
const [pp] = await conn.execute(
  `SELECT pp.id, p.name as prop, pp.platform, pp.displayName, pp.isActive, pp.lastPolledAt, pp.lastError 
   FROM property_platforms pp 
   JOIN properties p ON pp.propertyId = p.id 
   WHERE p.name IN (${placeholders}) 
   ORDER BY p.name, pp.platform`,
  propNames
);
console.log('\n=== PLATFORM CONFIGS ===');
pp.forEach(r => {
  const polled = r.lastPolledAt ? new Date(r.lastPolledAt).toISOString() : 'NEVER';
  console.log(`  ${r.prop} | ${r.platform} | active=${r.isActive} | lastPolled=${polled} | err=${r.lastError || 'none'}`);
});

// 3. Upcoming bookings (future only)
const nowMs = Date.now();
const [bookings] = await conn.execute(
  `SELECT p.name as property_name, pp.platform, pb.summary, pb.guestName, pb.bookingType, pb.checkIn, pb.checkOut
   FROM property_bookings pb
   JOIN property_platforms pp ON pb.platformId = pp.id
   JOIN properties p ON pb.propertyId = p.id
   WHERE p.name IN (${placeholders}) AND pb.checkOut > ?
   ORDER BY p.name, pp.platform, pb.checkIn`,
  [...propNames, nowMs]
);
console.log('\n=== UPCOMING BOOKINGS IN GEEVES ===');
if (bookings.length === 0) {
  console.log('  (none found)');
} else {
  bookings.forEach(b => {
    const ci = new Date(Number(b.checkIn)).toISOString().split('T')[0];
    const co = new Date(Number(b.checkOut)).toISOString().split('T')[0];
    console.log(`  ${b.property_name} | ${b.platform} | ${b.bookingType} | ${b.guestName || b.summary || 'unnamed'} | ${ci} → ${co}`);
  });
}

// 4. Sync log last 30 entries
const [syncLog] = await conn.execute(
  `SELECT p.name as prop, pp.platform, sl.syncType, sl.status, sl.eventsAdded, sl.eventsUpdated, sl.eventsRemoved, sl.createdAt
   FROM sync_log sl
   JOIN property_platforms pp ON sl.platformId = pp.id
   JOIN properties p ON sl.propertyId = p.id
   WHERE p.name IN (${placeholders})
   ORDER BY sl.createdAt DESC
   LIMIT 30`,
  propNames
);
console.log('\n=== RECENT SYNC LOG ===');
if (syncLog.length === 0) {
  console.log('  (no sync log entries)');
} else {
  syncLog.forEach(s => {
    const ts = s.createdAt ? new Date(s.createdAt).toISOString() : 'unknown';
    console.log(`  ${s.prop} | ${s.platform} | ${s.syncType} | ${s.status} | +${s.eventsAdded} ~${s.eventsUpdated} -${s.eventsRemoved} | ${ts}`);
  });
}

await conn.end();
