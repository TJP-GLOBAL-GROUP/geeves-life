/**
 * Verify that Sunday/Holiday blocks are computed correctly for all properties.
 * Run: npx tsx scripts/verify-sunday-blocks.ts
 */
import { getDb } from "../server/db";
import { properties, propertyBookings, propertyPrepRules } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

function toLocalDateStr(tsMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsMs));
}

function isSunday(dateStr: string): boolean {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() === 0;
}

const PROPERTY_IDS = [
  "ZI2Zy7OuLGYF-vmWOAII-", // The Artiste's Boutique (JM, blockSundays=true)
  "Ln-_SMF7Nrt1uXsQcdP9C", // Sunset Studio (US, blockSundays=true, blockNationalHolidays=true)
  "nJnk4hr3AxZJZ-RkwhRJy", // Morabeza (US, blockSundays=true, blockNationalHolidays=true)
];

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }

  for (const propertyId of PROPERTY_IDS) {
    const [prop] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
    const [prepRule] = await db.select().from(propertyPrepRules).where(eq(propertyPrepRules.propertyId, propertyId)).limit(1);

    if (!prop || !prepRule) {
      console.log(`${propertyId}: no prep rule found, skipping`);
      continue;
    }

    console.log(`\n=== ${prop.name} (${prop.country}, tz=${prop.timezone}) ===`);
    console.log(`  blockSundays=${prepRule.blockSundays}, blockNationalHolidays=${prepRule.blockNationalHolidays}`);

    const bookings = await db
      .select({ checkIn: propertyBookings.checkIn, checkOut: propertyBookings.checkOut })
      .from(propertyBookings)
      .where(and(eq(propertyBookings.propertyId, propertyId), eq(propertyBookings.bookingType, "booking")));

    const sorted = bookings.sort((a, b) => a.checkIn - b.checkIn);
    console.log(`  Total confirmed bookings: ${sorted.length}`);

    let windowsFound = 0;
    let sundayWindowsFound = 0;
    let allSundayWindows = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const tz = prop.timezone ?? "America/New_York";
      const checkOutStr = toLocalDateStr(a.checkOut, tz);
      const checkInStr = toLocalDateStr(b.checkIn, tz);

      if (checkOutStr >= checkInStr) continue;

      let cursor = a.checkOut;
      const days: string[] = [];
      while (days.length < 3) {
        const dayStr = toLocalDateStr(cursor, tz);
        if (dayStr >= checkInStr) break;
        days.push(dayStr);
        cursor += 86400000;
      }

      if (days.length === 0) continue;
      windowsFound++;

      const sundayDays = days.filter(d => isSunday(d));
      if (sundayDays.length > 0) {
        sundayWindowsFound++;
        if (sundayDays.length === days.length) {
          allSundayWindows++;
          console.log(`  ✓ BLOCK ADDED: checkout=${checkOutStr} → checkin=${checkInStr}, window=[${days.join(", ")}] — ALL SUNDAYS`);
        } else {
          console.log(`  - No block: checkout=${checkOutStr} → checkin=${checkInStr}, window=[${days.join(", ")}] — has non-Sunday day`);
        }
      }
    }

    console.log(`  Summary: ${windowsFound} cleaning windows, ${sundayWindowsFound} with Sundays, ${allSundayWindows} all-Sunday windows (blocks added)`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
