import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { propertyBookings } from "../drizzle/schema.js";
import { and, lt, gt } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const conn = await mysql.createConnection(DATABASE_URL);
const db = drizzle(conn);

// Jul 5 2026 = 1783209600000, Jul 12 2026 = 1783814400000
const JUL5 = 1783209600000;
const JUL12 = 1783814400000;

const bookings = await db.select({
  id: propertyBookings.id,
  propertyId: propertyBookings.propertyId,
  platformId: propertyBookings.platformId,
  summary: propertyBookings.summary,
  guestName: propertyBookings.guestName,
  checkIn: propertyBookings.checkIn,
  checkOut: propertyBookings.checkOut,
  icalUid: propertyBookings.icalUid,
  bookingType: propertyBookings.bookingType,
  dataSource: propertyBookings.dataSource,
}).from(propertyBookings)
  .where(and(
    lt(propertyBookings.checkIn, JUL12),
    gt(propertyBookings.checkOut, JUL5)
  ))
  .orderBy(propertyBookings.propertyId, propertyBookings.checkIn);

console.log(`Found ${bookings.length} bookings in Jul 5-12 range:`);
for (const b of bookings) {
  const cin = new Date(b.checkIn).toISOString().slice(0,10);
  const cout = new Date(b.checkOut).toISOString().slice(0,10);
  console.log(`  ${b.id.slice(0,8)} | prop=${b.propertyId.slice(0,8)} | ${cin} to ${cout} | ${b.summary || b.guestName || '(no name)'} | plat=${b.platformId?.slice(0,8)} | type=${b.bookingType} | src=${b.dataSource} | ical=${(b.icalUid||'').slice(0,30)}`);
}

// Check for potential duplicates (same property, overlapping dates)
const byProperty = {};
for (const b of bookings) {
  if (!byProperty[b.propertyId]) byProperty[b.propertyId] = [];
  byProperty[b.propertyId].push(b);
}

console.log("\n--- Potential duplicates (same property, overlapping dates) ---");
for (const [propId, bks] of Object.entries(byProperty)) {
  if (bks.length > 1) {
    for (let i = 0; i < bks.length; i++) {
      for (let j = i+1; j < bks.length; j++) {
        const a = bks[i], b2 = bks[j];
        if (a.checkIn < b2.checkOut && b2.checkIn < a.checkOut) {
          console.log(`  OVERLAP: ${a.id.slice(0,8)} (${new Date(a.checkIn).toISOString().slice(0,10)} to ${new Date(a.checkOut).toISOString().slice(0,10)}, "${a.summary}", src=${a.dataSource}) vs ${b2.id.slice(0,8)} (${new Date(b2.checkIn).toISOString().slice(0,10)} to ${new Date(b2.checkOut).toISOString().slice(0,10)}, "${b2.summary}", src=${b2.dataSource}) | prop=${propId.slice(0,8)}`);
        }
      }
    }
  }
}

await conn.end();
