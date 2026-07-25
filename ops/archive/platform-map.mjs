import { createConnection } from "mysql2/promise";
const conn = await createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT pp.id as platform_id, pp.platform, pp.propertyId, p.name as property_name,
         pp.isActive, pp.lastPolledAt, pp.lastError, pp.icalUrl
  FROM property_platforms pp
  JOIN properties p ON p.id = pp.propertyId
  ORDER BY p.name, pp.platform
`);

console.log("PLATFORM MAP:");
for (const r of rows) {
  const age = r.lastPolledAt ? Math.round((Date.now() - new Date(r.lastPolledAt).getTime()) / 60000) + "m" : "NEVER";
  console.log(`${r.property_name} | ${r.platform} | id=${r.platform_id} | active=${r.isActive} | last=${age} | err=${r.lastError || "none"} | ical=${r.icalUrl ? "SET" : "MISSING"}`);
}

// Also get booking counts per platform
const [bkCounts] = await conn.query(`
  SELECT platformId, bookingType, COUNT(*) as cnt, MIN(checkIn) as earliest, MAX(checkOut) as latest
  FROM property_bookings
  GROUP BY platformId, bookingType
  ORDER BY platformId, bookingType
`);
console.log("\nBOOKING COUNTS BY PLATFORM:");
for (const b of bkCounts) {
  const earliest = b.earliest ? new Date(b.earliest).toISOString().slice(0,10) : "N/A";
  const latest = b.latest ? new Date(b.latest).toISOString().slice(0,10) : "N/A";
  console.log(`  platform_id=${b.platformId} | type=${b.bookingType} | count=${b.cnt} | range=${earliest} → ${latest}`);
}

// Check for blocks specifically
const [blocks] = await conn.query(`
  SELECT pb.platformId, pb.bookingType, pb.blockReason, pb.checkIn, pb.checkOut,
         pp.platform, p.name as property_name
  FROM property_bookings pb
  JOIN property_platforms pp ON pp.id = pb.platformId
  JOIN properties p ON p.id = pp.propertyId
  WHERE pb.bookingType = 'block'
  ORDER BY p.name, pp.platform, pb.checkIn
`);
console.log("\nBLOCK EVENTS:");
if (blocks.length === 0) {
  console.log("  No block events found in DB");
} else {
  for (const b of blocks) {
    const ci = new Date(b.checkIn).toISOString().slice(0,10);
    const co = new Date(b.checkOut).toISOString().slice(0,10);
    console.log(`  ${b.property_name} | ${b.platform} | ${ci} → ${co} | reason=${b.blockReason || "none"}`);
  }
}

await conn.end();
