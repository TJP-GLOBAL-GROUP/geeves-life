import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // 1. Check what documentation/evidence columns exist in DB bookings
  console.log('=== DATABASE EVIDENCE FIELDS ===\n');
  
  const [evidenceStats] = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN platformBookingUrl IS NOT NULL AND platformBookingUrl != '' THEN 1 ELSE 0 END) as hasPlatformUrl,
      SUM(CASE WHEN confirmationNumber IS NOT NULL AND confirmationNumber != '' THEN 1 ELSE 0 END) as hasConfirmation,
      SUM(CASE WHEN emailScrapeSource IS NOT NULL AND emailScrapeSource != '' THEN 1 ELSE 0 END) as hasEmailSource,
      SUM(CASE WHEN financialSource IS NOT NULL AND financialSource != '' THEN 1 ELSE 0 END) as hasFinancialSource,
      SUM(CASE WHEN cancellationSource IS NOT NULL AND cancellationSource != '' THEN 1 ELSE 0 END) as hasCancellationSource
    FROM property_bookings
    WHERE bookingStatus = 'confirmed'
  `) as any;
  
  const stats = evidenceStats[0];
  console.log(`Total confirmed bookings: ${stats.total}`);
  console.log(`Has platform URL: ${stats.hasPlatformUrl} (${(stats.hasPlatformUrl/stats.total*100).toFixed(0)}%)`);
  console.log(`Has confirmation number: ${stats.hasConfirmation} (${(stats.hasConfirmation/stats.total*100).toFixed(0)}%)`);
  console.log(`Has email scrape source: ${stats.hasEmailSource} (${(stats.hasEmailSource/stats.total*100).toFixed(0)}%)`);
  console.log(`Has financial source tag: ${stats.hasFinancialSource} (${(stats.hasFinancialSource/stats.total*100).toFixed(0)}%)`);
  
  // Check financial source breakdown
  const [sourceBreakdown] = await pool.query(`
    SELECT financialSource, COUNT(*) as cnt, 
           SUM(netAmount) as totalNet,
           SUM(CASE WHEN confirmationNumber IS NOT NULL AND confirmationNumber != '' THEN 1 ELSE 0 END) as withConf
    FROM property_bookings
    WHERE bookingStatus = 'confirmed'
    GROUP BY financialSource
  `) as any;
  
  console.log('\nFinancial Source Breakdown:');
  for (const row of sourceBreakdown) {
    console.log(`  ${row.financialSource || 'null'}: ${row.cnt} bookings, Net $${Number(row.totalNet || 0).toFixed(2)}, ${row.withConf} have confirmation #`);
  }
  
  // Check if airbnb_payout_records has bank/payment evidence
  const [payoutEvidence] = await pool.query(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN payoutId IS NOT NULL AND payoutId != '' THEN 1 ELSE 0 END) as hasPayoutId,
           SUM(CASE WHEN payoutMethod IS NOT NULL AND payoutMethod != '' THEN 1 ELSE 0 END) as hasPayoutMethod
    FROM airbnb_payout_records
  `) as any;
  
  console.log(`\nAirbnb Payout Records: ${payoutEvidence[0].total} total`);
  console.log(`  Has payout ID: ${payoutEvidence[0].hasPayoutId}`);
  console.log(`  Has payout method: ${payoutEvidence[0].hasPayoutMethod}`);
  
  // Sample a few payout records to see what evidence they contain
  const [payoutSample] = await pool.query(`
    SELECT payoutId, payoutMethod, payoutDate, amount, type, confirmationCode
    FROM airbnb_payout_records
    LIMIT 5
  `) as any;
  
  console.log('\nSample payout records:');
  for (const row of payoutSample) {
    console.log(`  Conf: ${row.confirmationCode} | PayoutID: ${row.payoutId} | Method: ${row.payoutMethod} | Amount: $${row.amount} | Date: ${row.payoutDate}`);
  }
  
  // 2. Now check the spreadsheet for evidence columns
  console.log('\n\n=== SPREADSHEET EVIDENCE FIELDS ===\n');
  
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];
  const enhancedTabs = sheetNames.filter(n => n.toLowerCase().includes('enhanced'));
  
  // Get all headers from enhanced tabs to see what evidence columns exist
  for (const tab of enhancedTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z1`,
    });
    console.log(`${tab} columns: ${res.data.values?.[0]?.join(' | ')}`);
  }
  
  // 3. Now specifically examine the 28 spreadsheet-only bookings (excluding Svetlana)
  console.log('\n\n=== 28 SPREADSHEET-ONLY BOOKINGS - EVIDENCE CHECK ===\n');
  
  // Get full data for the enhanced tabs to find the 28 missing bookings
  const spreadsheetOnlyConfs = [
    'HMMXW8WFK4', 'HA-13HGVC', 'HM28X9X2ZB', 'HA-0HKX6R', '3890454',
    'HA-P1FWHD', 'HA-XBNQPK', '1889279451', '3889059', 'HMAY5C82QT',
    '5008336696', '5450760600', '5508411675', '5172244800', '5791839025',
    '5531799576', '5514358228', '5835728818', '5759033677', '6066983627',
    '5914779093', '6108345671', '6152048756', '6186367098', '6199754500',
    '6259614150', '6300927700', '6320697500', '6352150000'
  ];
  
  for (const tab of enhancedTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z200`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) continue;
    
    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const confIdx = headers.findIndex((h: string) => h.includes('confirmation') || h.includes('conf'));
    
    // Find columns that might indicate payment evidence
    const bankIdx = headers.findIndex((h: string) => h.includes('bank') || h.includes('payout') || h.includes('payment'));
    const sourceIdx = headers.findIndex((h: string) => h.includes('source') || h.includes('evidence') || h.includes('verified'));
    const payoutDateIdx = headers.findIndex((h: string) => h.includes('payout') && h.includes('date'));
    const notesIdx = headers.findIndex((h: string) => h.includes('note'));
    
    let foundInTab = false;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const conf = row[confIdx]?.trim();
      if (conf && spreadsheetOnlyConfs.includes(conf)) {
        if (!foundInTab) {
          console.log(`\nFrom tab: ${tab}`);
          console.log(`  Headers: ${headers.join(' | ')}`);
          foundInTab = true;
        }
        // Print all non-empty fields for this row
        const fields: string[] = [];
        for (let j = 0; j < row.length; j++) {
          if (row[j] && row[j].trim() !== '') {
            fields.push(`${headers[j] || `col${j}`}: ${row[j]}`);
          }
        }
        console.log(`  [${conf}] ${fields.join(' | ')}`);
      }
    }
  }
  
  await pool.end();
  process.exit(0);
}
main();
