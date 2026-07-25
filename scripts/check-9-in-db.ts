import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  const confs = ['5914779093','6108345671','6152048756','6186367098','6199754500','6259614150','6300927700','6320697500','6352150000'];
  
  // These might actually be in the DB — the earlier cross-reference listed them as "truly missing"
  // but let's check with a broader search
  const [rows] = await pool.query(`
    SELECT pb.confirmationNumber, pb.guestName, pb.totalPrice, pb.netAmount, 
           pb.commissionAmount, pb.financialSource, pb.bookingStatus,
           FROM_UNIXTIME(pb.checkIn/1000) as checkInDate,
           FROM_UNIXTIME(pb.checkOut/1000) as checkOutDate,
           p.name as propertyName, pp.platform
    FROM property_bookings pb
    JOIN properties p ON pb.propertyId = p.id
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pb.confirmationNumber IN (${confs.map(c => `'${c}'`).join(',')})
  `) as any;
  
  if (rows.length > 0) {
    console.log(`Found ${rows.length} of the 9 in the DB:`);
    for (const r of rows) {
      console.log(`  ${r.confirmationNumber} | ${r.guestName} | ${r.propertyName} | ${r.platform} | ${r.checkInDate} | Gross: $${r.totalPrice} | Net: $${r.netAmount} | Source: ${r.financialSource}`);
    }
  } else {
    console.log('None of the 9 are in property_bookings.');
  }
  
  // Also check if they might be in the Booking.com XLS data we imported
  const [bookingXls] = await pool.query(`
    SELECT confirmationNumber, guestName, totalPrice, netAmount, financialSource,
           FROM_UNIXTIME(checkIn/1000) as checkInDate
    FROM property_bookings
    WHERE financialSource = 'platform_export'
    AND confirmationNumber LIKE '5%' OR confirmationNumber LIKE '6%'
    ORDER BY checkIn DESC
    LIMIT 20
  `) as any;
  
  console.log('\n\nRecent Booking.com platform_export records (for context):');
  for (const r of bookingXls) {
    console.log(`  ${r.confirmationNumber} | ${r.guestName} | ${r.checkInDate} | $${r.totalPrice}`);
  }
  
  await pool.end();
  process.exit(0);
}
main();
