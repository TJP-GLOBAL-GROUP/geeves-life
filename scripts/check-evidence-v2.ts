import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // 1. DB Evidence quality
  console.log('=== DATABASE EVIDENCE QUALITY ===\n');
  
  // Airbnb payout records - these ARE the bank-level evidence
  const [payoutStats] = await pool.query(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN bankTransactionId IS NOT NULL AND bankTransactionId != '' THEN 1 ELSE 0 END) as hasBankTxn,
           SUM(CASE WHEN documentId IS NOT NULL AND documentId != '' THEN 1 ELSE 0 END) as hasDocId,
           SUM(CASE WHEN isReconciled = 1 THEN 1 ELSE 0 END) as reconciled,
           SUM(CASE WHEN confirmationCode IS NOT NULL AND confirmationCode != '' THEN 1 ELSE 0 END) as hasConf
    FROM airbnb_payout_records
  `) as any;
  
  console.log('Airbnb Payout Records (bank-level evidence):');
  console.log(`  Total: ${payoutStats[0].total}`);
  console.log(`  Has bank transaction ID: ${payoutStats[0].hasBankTxn}`);
  console.log(`  Has document ID: ${payoutStats[0].hasDocId}`);
  console.log(`  Is reconciled: ${payoutStats[0].reconciled}`);
  console.log(`  Has confirmation code: ${payoutStats[0].hasConf}`);
  
  // Property bookings evidence
  const [bookingStats] = await pool.query(`
    SELECT financialSource, COUNT(*) as cnt,
           SUM(CASE WHEN confirmationNumber IS NOT NULL AND confirmationNumber != '' THEN 1 ELSE 0 END) as hasConf,
           SUM(CASE WHEN platformBookingUrl IS NOT NULL AND platformBookingUrl != '' THEN 1 ELSE 0 END) as hasUrl,
           SUM(CASE WHEN emailScrapeSource IS NOT NULL AND emailScrapeSource != '' THEN 1 ELSE 0 END) as hasEmailRef,
           ROUND(SUM(netAmount), 2) as totalNet
    FROM property_bookings
    WHERE bookingStatus = 'confirmed'
    GROUP BY financialSource
  `) as any;
  
  console.log('\nProperty Bookings by Financial Source:');
  console.log('  Source            | Count | Has Conf# | Has URL | Has Email Ref | Total Net');
  console.log('  ------------------|-------|-----------|---------|---------------|----------');
  for (const row of bookingStats) {
    console.log(`  ${(row.financialSource || 'null').padEnd(18)}| ${String(row.cnt).padEnd(6)}| ${String(row.hasConf).padEnd(10)}| ${String(row.hasUrl).padEnd(8)}| ${String(row.hasEmailRef).padEnd(14)}| $${Number(row.totalNet || 0).toFixed(2)}`);
  }
  
  // 2. Now check the spreadsheet columns for evidence
  console.log('\n\n=== SPREADSHEET EVIDENCE COLUMNS ===\n');
  
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
  
  for (const tab of enhancedTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z1`,
    });
    console.log(`${tab}:`);
    console.log(`  Columns: ${res.data.values?.[0]?.join(' | ')}`);
  }
  
  // 3. Get full data for the 28 spreadsheet-only bookings (excluding Svetlana HMAY5C82QT)
  console.log('\n\n=== 28 SPREADSHEET-ONLY BOOKINGS - FULL EVIDENCE ===\n');
  
  const spreadsheetOnlyConfs = [
    'HMMXW8WFK4', 'HA-13HGVC', 'HM28X9X2ZB', 'HA-0HKX6R', '3890454',
    'HA-P1FWHD', 'HA-XBNQPK', '1889279451', '3889059',
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
    
    let foundInTab = false;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const conf = row[confIdx]?.trim();
      if (conf && spreadsheetOnlyConfs.includes(conf)) {
        if (!foundInTab) {
          console.log(`\n--- From tab: ${tab} ---`);
          console.log(`  Headers: ${headers.filter(h => h).join(' | ')}`);
          foundInTab = true;
        }
        // Print all non-empty fields
        const fields: string[] = [];
        for (let j = 0; j < Math.min(row.length, headers.length); j++) {
          if (row[j] && row[j].trim() !== '') {
            fields.push(`${headers[j]}: ${row[j]}`);
          }
        }
        console.log(`\n  [${conf}] ${fields.join(' | ')}`);
      }
    }
  }
  
  // 4. Check if any of the 28 have matching bank records in airbnb_payout_records
  console.log('\n\n=== CROSS-CHECK: Do any of the 28 have Airbnb payout records? ===\n');
  
  const confList = spreadsheetOnlyConfs.map(c => `'${c}'`).join(',');
  const [payoutMatches] = await pool.query(`
    SELECT confirmationCode, guestName, amount, grossEarnings, startDate, endDate, property, bankTransactionId
    FROM airbnb_payout_records
    WHERE confirmationCode IN (${confList})
  `) as any;
  
  if (payoutMatches.length > 0) {
    console.log(`Found ${payoutMatches.length} matching payout records:`);
    for (const m of payoutMatches) {
      console.log(`  ${m.confirmationCode} | ${m.guestName} | $${m.amount} | ${m.property} | BankTxn: ${m.bankTransactionId || 'none'}`);
    }
  } else {
    console.log('None of the 28 spreadsheet-only bookings have matching Airbnb payout records.');
  }
  
  // 5. Check if any might be in DB under slightly different confirmation format
  console.log('\n\n=== FUZZY MATCH: Check if Booking.com IDs might be stored differently ===\n');
  const bookingComConfs = spreadsheetOnlyConfs.filter(c => /^\d{7,}$/.test(c));
  if (bookingComConfs.length > 0) {
    const [fuzzy] = await pool.query(`
      SELECT confirmationNumber, guestName, totalPrice, netAmount, financialSource
      FROM property_bookings
      WHERE confirmationNumber LIKE '%${bookingComConfs[0].substring(0, 5)}%'
         OR confirmationNumber IN (${bookingComConfs.map(c => `'${c}'`).join(',')})
      LIMIT 20
    `) as any;
    
    if (fuzzy.length > 0) {
      console.log(`Found ${fuzzy.length} potential matches:`);
      for (const f of fuzzy) {
        console.log(`  ${f.confirmationNumber} | ${f.guestName} | Gross: $${f.totalPrice} | Net: $${f.netAmount} | Source: ${f.financialSource}`);
      }
    } else {
      console.log(`No fuzzy matches found for Booking.com IDs: ${bookingComConfs.join(', ')}`);
    }
  }
  
  await pool.end();
  process.exit(0);
}
main();
