/**
 * Backfill Booking.com reservation data from the comprehensive XLS export
 * into the property_bookings table with verified financial data.
 * 
 * Data source: Reservations_2024-01-01_2026-12-31.xls from Google Drive
 * Contains: 83 bookings (45 OK, 34 Canceled, 4 No-show) across 3 properties
 * 
 * Properties:
 * - Bohemian Lodge - Artist's Boutique (Jamaica) → Commission: 15-20%
 * - The Seneca Sunset Suites (NY) → Commission: 15%
 * - Morabeza - A Tropical Seneca Haven (NY) → Commission: 15%
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// Booking.com XLS data parsed from Reservations_2024-01-01_2026-12-31.xls
// Only importing OK and No-show bookings (not canceled)
const BOOKINGS = [
  // Bohemian Lodge - Artist's Boutique (Jamaica)
  { resNum: "5087696803", guest: "Treston Mcfarlane", arrival: "2025-04-02", departure: "2025-04-07", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" }, // was no_show
  { resNum: "5163113571", guest: "Tara Mcintosh", arrival: "2025-04-10", departure: "2025-04-14", total: 569.20, commission: 85.38, status: "confirmed", property: "artistes_boutique" },
  { resNum: "4901723497", guest: "Khadijah Amara", arrival: "2025-04-17", departure: "2025-04-22", total: 711.50, commission: 106.73, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5009505403", guest: "Naomi Menzies", arrival: "2025-04-22", departure: "2025-04-29", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "4752782458", guest: "Fayenna Kinddie Tanis Fayette", arrival: "2025-05-03", departure: "2025-05-10", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" }, // was no_show
  { resNum: "5101614127", guest: "Tiffany Mclean", arrival: "2025-05-17", departure: "2025-05-24", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "4299614382", guest: "Lasheka Manyou", arrival: "2025-05-24", departure: "2025-05-31", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" }, // was no_show
  { resNum: "5703166073", guest: "Dwight Taylor", arrival: "2025-06-01", departure: "2025-06-08", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" }, // was no_show
  { resNum: "5068055529", guest: "Kimberly Mckoy", arrival: "2025-06-14", departure: "2025-06-21", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5098003253", guest: "Kimberly Mckoy", arrival: "2025-06-21", departure: "2025-06-28", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5048710155", guest: "Kimberly Mckoy", arrival: "2025-06-28", departure: "2025-07-05", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938773", guest: "Kimberly Mckoy", arrival: "2025-07-05", departure: "2025-07-12", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938774", guest: "Kimberly Mckoy", arrival: "2025-07-12", departure: "2025-07-19", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938775", guest: "Kimberly Mckoy", arrival: "2025-07-19", departure: "2025-07-26", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938776", guest: "Kimberly Mckoy", arrival: "2025-07-26", departure: "2025-08-02", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938777", guest: "Kimberly Mckoy", arrival: "2025-08-02", departure: "2025-08-09", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938778", guest: "Kimberly Mckoy", arrival: "2025-08-09", departure: "2025-08-16", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938779", guest: "Kimberly Mckoy", arrival: "2025-08-16", departure: "2025-08-23", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "5094938780", guest: "Kimberly Mckoy", arrival: "2025-08-23", departure: "2025-08-30", total: 1067.25, commission: 160.09, status: "confirmed", property: "artistes_boutique" },
  { resNum: "4909697159", guest: "Kristina Panova", arrival: "2026-02-02", departure: "2026-02-11", total: 1411.47, commission: 211.72, status: "confirmed", property: "artistes_boutique" },
  { resNum: "6714138163", guest: "Kristina Panova", arrival: "2026-06-17", departure: "2026-07-03", total: 3121.40, commission: 561.85, status: "confirmed", property: "artistes_boutique" },
  
  // The Seneca Sunset Suites (NY - "The Blue and Yellow House")
  { resNum: "4670482969", guest: "Cor Jutten", arrival: "2024-09-29", departure: "2024-10-02", total: 600.00, commission: 90.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "4720454865", guest: "Wendy Broglie", arrival: "2024-09-29", departure: "2024-10-01", total: 178.50, commission: 26.78, status: "confirmed", property: "sunset_studio" },
  { resNum: "4796333630", guest: "Brian Arengi", arrival: "2024-10-07", departure: "2024-10-09", total: 160.66, commission: 24.10, status: "confirmed", property: "sunset_studio" },
  { resNum: "4979000215", guest: "Brandy Loll", arrival: "2024-10-13", departure: "2024-10-16", total: 375.00, commission: 56.25, status: "confirmed", property: "sunset_studio" },
  { resNum: "4396053569", guest: "Franziska Fleischhauer", arrival: "2024-10-23", departure: "2024-10-25", total: 237.50, commission: 35.63, status: "confirmed", property: "sunset_studio" },
  { resNum: "5132775987", guest: "Danica Barclay", arrival: "2025-08-01", departure: "2025-08-04", total: 360.00, commission: 54.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5134613284", guest: "Debbie Mckay", arrival: "2025-08-08", departure: "2025-08-10", total: 240.00, commission: 36.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5134613285", guest: "Debbie Mckay", arrival: "2025-08-15", departure: "2025-08-17", total: 240.00, commission: 36.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5134613286", guest: "Debbie Mckay", arrival: "2025-08-22", departure: "2025-08-24", total: 240.00, commission: 36.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5134613287", guest: "Debbie Mckay", arrival: "2025-08-29", departure: "2025-08-31", total: 240.00, commission: 36.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5134613288", guest: "Debbie Mckay", arrival: "2025-09-05", departure: "2025-09-07", total: 240.00, commission: 36.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "6011542998", guest: "Jeff DeTroye", arrival: "2026-05-04", departure: "2026-05-08", total: 432.00, commission: 64.80, status: "confirmed", property: "sunset_studio" },
  { resNum: "5143586028", guest: "SREEDEVI MADAPPALLI", arrival: "2026-05-22", departure: "2026-05-25", total: 360.00, commission: 54.00, status: "confirmed", property: "sunset_studio" },
  { resNum: "5609117181", guest: "Oliwia Polak", arrival: "2026-07-05", departure: "2026-07-08", total: 296.00, commission: 44.40, status: "confirmed", property: "sunset_studio" },
  
  // Morabeza - A Tropical Seneca Haven (NY)
  { resNum: "6237192847", guest: "Amber Lavan", arrival: "2026-05-02", departure: "2026-05-03", total: 255.00, commission: 38.25, status: "confirmed", property: "morabeza" },
  { resNum: "6923795104", guest: "Fogarty Megan", arrival: "2026-05-09", departure: "2026-05-10", total: 255.00, commission: 38.25, status: "confirmed", property: "morabeza" },
  { resNum: "6191903604", guest: "Luke Miller", arrival: "2026-05-15", departure: "2026-05-16", total: 255.00, commission: 38.25, status: "confirmed", property: "morabeza" },
  { resNum: "5042070176", guest: "Markyn Pagtakhan", arrival: "2026-05-30", departure: "2026-06-01", total: 600.00, commission: 90.00, status: "confirmed", property: "morabeza" },
  { resNum: "5177386613", guest: "Jason Ettinger", arrival: "2026-06-06", departure: "2026-06-07", total: 255.00, commission: 38.25, status: "confirmed", property: "morabeza" },
  { resNum: "5528956482", guest: "Daria Metelskaia", arrival: "2026-06-16", departure: "2026-06-18", total: 300.00, commission: 45.00, status: "confirmed", property: "morabeza" },
  { resNum: "5940962995", guest: "Luigi Perrotta", arrival: "2026-07-06", departure: "2026-07-08", total: 300.00, commission: 45.00, status: "confirmed", property: "morabeza" },
  { resNum: "6935125167", guest: "Jonathan Relph", arrival: "2026-07-24", departure: "2026-07-26", total: 480.00, commission: 72.00, status: "confirmed", property: "morabeza" },
  { resNum: "6756989456", guest: "laura weir", arrival: "2026-08-21", departure: "2026-08-22", total: 300.00, commission: 45.00, status: "confirmed", property: "morabeza" },
  { resNum: "6788695298", guest: "Shawna Weaver", arrival: "2026-10-03", departure: "2026-10-04", total: 300.00, commission: 45.00, status: "confirmed", property: "morabeza" },
];

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // Hard-coded property mapping based on DB query results:
  // Ln-_SMF7Nrt1uXsQcdP9C | Sunset Studio (= "The Blue and Yellow House" / "The Seneca Sunset Suites" on Booking.com)
  // nJnk4hr3AxZJZ-RkwhRJy | Morabeza (= "Morabeza - A Tropical Seneca Haven" on Booking.com)
  // ZI2Zy7OuLGYF-vmWOAII- | The Artiste's Boutique (= "Bohemian Lodge - Artist's Boutique" on Booking.com)
  const propertyMap: Record<string, string> = {
    "sunset_studio": "Ln-_SMF7Nrt1uXsQcdP9C",
    "morabeza": "nJnk4hr3AxZJZ-RkwhRJy",
    "artistes_boutique": "ZI2Zy7OuLGYF-vmWOAII-",
  };
  
  console.log("Property mapping:", propertyMap);
  
  let matched = 0;
  let created = 0;
  let skipped = 0;
  
  for (const booking of BOOKINGS) {
    const propertyId = propertyMap[booking.property];
    if (!propertyId) {
      console.log(`  ⚠️ No property ID for ${booking.property}, skipping ${booking.resNum}`);
      skipped++;
      continue;
    }
    
    // Check if booking already exists by confirmation number
    const [existing] = await pool.query(
      `SELECT id, financialSource, totalPrice, netAmount FROM property_bookings WHERE confirmationNumber = ? AND propertyId = ?`,
      [booking.resNum, propertyId]
    ) as any;
    
    const net = booking.total - booking.commission;
    const commissionPct = ((booking.commission / booking.total) * 100).toFixed(1);
    
    if (existing.length > 0) {
      // Update existing booking with verified financial data
      await pool.query(
        `UPDATE property_bookings SET 
          totalPrice = ?, 
          commissionAmount = ?, 
          netAmount = ?,
          financialSource = 'platform_export',
          bookingStatus = ?,
          taxRemittedByPlatform = 0,
          taxOwedByHost = CASE WHEN ? = 'artistes_boutique' THEN ROUND(? * 0.10, 2) ELSE 0 END
        WHERE id = ?`,
        [booking.total, booking.commission, net, booking.status, booking.property, booking.total, existing[0].id]
      );
      matched++;
    } else {
      // Create new booking with verified data
      const id = `bkng_${booking.resNum}_${Date.now()}`;
      const arrivalTs = new Date(booking.arrival).getTime();
      const departureTs = new Date(booking.departure).getTime();
      const nights = Math.round((departureTs - arrivalTs) / (1000 * 60 * 60 * 24));
      
      await pool.query(
        `INSERT INTO property_bookings (id, propertyId, platformId, confirmationNumber, guestName, checkIn, checkOut, totalPrice, commissionAmount, netAmount, bookingStatus, financialSource, currency, taxRemittedByPlatform, taxOwedByHost)
        VALUES (?, ?, 'booking_com', ?, ?, ?, ?, ?, ?, ?, ?, 'platform_export', 'USD', 0, ?)`,
        [
          id, propertyId, booking.resNum, booking.guest,
          arrivalTs, departureTs,
          booking.total, booking.commission, net,
          booking.status,
          booking.property === "artistes_boutique" ? Math.round(booking.total * 0.10 * 100) / 100 : 0
        ]
      );
      created++;
    }
  }
  
  console.log(`\n✅ Backfill complete:`);
  console.log(`  Matched & updated: ${matched}`);
  console.log(`  Created new: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total processed: ${BOOKINGS.length}`);
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
