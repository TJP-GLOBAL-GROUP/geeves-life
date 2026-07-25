import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // Artiste's Boutique 2024 bookings
  const [rows] = await pool.query(`
    SELECT pb.guestName, pb.checkIn, pb.totalPrice, pb.commissionAmount, pb.netAmount, 
           pb.financialSource, pp.platform, pb.confirmationNumber
    FROM property_bookings pb 
    JOIN property_platforms pp ON pb.platformId = pp.id 
    WHERE pb.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-' 
      AND pb.checkIn >= 1704067200000 AND pb.checkIn < 1735689600000 
      AND pb.bookingStatus = 'confirmed'
    ORDER BY pb.checkIn
  `) as any;
  
  console.log(`\n=== Artiste's Boutique 2024 (${rows.length} bookings) ===`);
  let totalGross = 0, totalNet = 0;
  for (const r of rows) {
    const checkIn = new Date(Number(r.checkIn)).toISOString().split('T')[0];
    const gross = Number(r.totalPrice || 0);
    const net = Number(r.netAmount || 0);
    totalGross += gross;
    totalNet += net;
    console.log(`  ${checkIn} | ${r.guestName?.substring(0, 20)} | ${r.platform} | Gross: $${gross.toFixed(2)} | Net: $${net.toFixed(2)} | Source: ${r.financialSource} | Conf: ${r.confirmationNumber}`);
  }
  console.log(`\n  TOTAL: Gross $${totalGross.toFixed(2)} | Net $${totalNet.toFixed(2)}`);
  console.log(`  Spreadsheet says: Gross $7,463.18 | Net $6,109.01 (13 bookings)`);
  console.log(`  Ratio DB/Sheet: ${(totalGross / 7463.18).toFixed(1)}x`);
  
  // Check Penthouse/Morabeza 2024 to understand the naming
  const [penthouse] = await pool.query(`
    SELECT pb.guestName, pb.checkIn, pb.totalPrice, pb.netAmount, pb.financialSource, pp.platform
    FROM property_bookings pb 
    JOIN property_platforms pp ON pb.platformId = pp.id 
    WHERE pb.propertyId = 'YiyTtDDIqXx88hD9ZWCo7' 
      AND pb.checkIn >= 1704067200000 AND pb.checkIn < 1735689600000 
      AND pb.bookingStatus = 'confirmed'
    ORDER BY pb.checkIn
    LIMIT 5
  `) as any;
  
  console.log(`\n=== Penthouse/Morabeza 2024 (first 5) ===`);
  for (const r of penthouse) {
    const checkIn = new Date(Number(r.checkIn)).toISOString().split('T')[0];
    console.log(`  ${checkIn} | ${r.guestName?.substring(0, 20)} | ${r.platform} | Gross: $${Number(r.totalPrice || 0).toFixed(2)} | Net: $${Number(r.netAmount || 0).toFixed(2)} | Source: ${r.financialSource}`);
  }
  
  await pool.end();
  process.exit(0);
}
main();
