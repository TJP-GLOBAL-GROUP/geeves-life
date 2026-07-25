import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // These 12 were found in the fuzzy match - they ARE in DB
  const foundConfs = ['6066983627','5759033677','5008336696','3889059','5791839025','1889279451','5508411675','5531799576','5450760600','5514358228','5172244800','5835728818'];
  
  const [rows] = await pool.query(`
    SELECT pb.confirmationNumber, p.name, pp.platform, pb.financialSource
    FROM property_bookings pb 
    JOIN properties p ON pb.propertyId = p.id 
    JOIN property_platforms pp ON pb.platformId = pp.id 
    WHERE pb.confirmationNumber IN (${foundConfs.map(c => `'${c}'`).join(',')})
  `) as any;
  
  console.log('These 12 ARE in the DB (cross-reference script had a bug matching them):');
  for (const r of rows) {
    console.log(`  ${r.confirmationNumber} | ${r.name} | ${r.platform} | ${r.financialSource}`);
  }
  
  // Check the remaining 16 that truly might not be in DB
  const remaining = ['HMMXW8WFK4','HA-13HGVC','HM28X9X2ZB','HA-0HKX6R','3890454','HA-P1FWHD','HA-XBNQPK','5914779093','6108345671','6152048756','6186367098','6199754500','6259614150','6300927700','6320697500','6352150000'];
  
  const [missing] = await pool.query(`
    SELECT confirmationNumber FROM property_bookings 
    WHERE confirmationNumber IN (${remaining.map(c => `'${c}'`).join(',')})
  `) as any;
  
  const foundInDb = new Set(missing.map((m: any) => m.confirmationNumber));
  const trulyMissing = remaining.filter(c => !foundInDb.has(c));
  
  console.log(`\nOf the remaining 16 spreadsheet-only bookings:`);
  console.log(`  Found in DB: ${missing.length}`);
  if (missing.length > 0) {
    for (const m of missing) console.log(`    ${m.confirmationNumber}`);
  }
  console.log(`  Truly missing from DB: ${trulyMissing.length}`);
  for (const c of trulyMissing) console.log(`    ${c}`);
  
  await pool.end();
  process.exit(0);
}
main();
