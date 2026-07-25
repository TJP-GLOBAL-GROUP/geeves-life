import mysql from 'mysql2/promise';
import { google } from 'googleapis';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // Get Google Sheets data
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Get sheet metadata to find (enhanced) tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];
  const enhancedTabs = sheetNames.filter(n => n.toLowerCase().includes('enhanced'));
  
  console.log('Enhanced income tabs:', enhancedTabs);
  
  // Collect all spreadsheet confirmation numbers
  const sheetConfirmations: Map<string, any> = new Map();
  
  for (const tab of enhancedTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z200`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) continue;
    
    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const confIdx = headers.findIndex((h: string) => h.includes('confirmation') || h.includes('conf'));
    const grossIdx = headers.findIndex((h: string) => h.includes('gross') || h.includes('total'));
    const netIdx = headers.findIndex((h: string) => h.includes('net') || h.includes('payout'));
    const guestIdx = headers.findIndex((h: string) => h.includes('guest') || h.includes('name'));
    const propIdx = headers.findIndex((h: string) => h.includes('property'));
    const platformIdx = headers.findIndex((h: string) => h.includes('platform'));
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const conf = row[confIdx]?.trim();
      if (!conf || conf === '' || conf === 'TOTAL' || conf === 'Total') continue;
      
      sheetConfirmations.set(conf, {
        tab,
        guest: row[guestIdx] || '',
        property: row[propIdx] || '',
        platform: row[platformIdx] || '',
        gross: row[grossIdx] || '',
        net: row[netIdx] || '',
      });
    }
  }
  
  console.log(`\nTotal spreadsheet bookings with confirmation numbers: ${sheetConfirmations.size}`);
  
  // Get all DB bookings with confirmation numbers
  const [dbRows] = await pool.query(`
    SELECT pb.confirmationNumber, pb.guestName, pb.totalPrice, pb.netAmount, 
           pb.financialSource, pb.checkIn, pp.platform, p.name as propertyName
    FROM property_bookings pb 
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pb.bookingStatus = 'confirmed'
      AND pb.confirmationNumber IS NOT NULL
      AND pb.confirmationNumber != ''
    ORDER BY pb.checkIn
  `) as any;
  
  const dbConfirmations: Map<string, any> = new Map();
  for (const row of dbRows) {
    dbConfirmations.set(row.confirmationNumber, row);
  }
  
  console.log(`Total DB bookings with confirmation numbers: ${dbConfirmations.size}`);
  
  // Find matches and mismatches
  let matchCount = 0;
  let sheetOnlyCount = 0;
  let dbOnlyCount = 0;
  const sheetOnly: any[] = [];
  const dbOnly: any[] = [];
  const financialMismatches: any[] = [];
  
  for (const [conf, sheetData] of sheetConfirmations) {
    if (dbConfirmations.has(conf)) {
      matchCount++;
      const dbData = dbConfirmations.get(conf);
      const sheetNet = parseFloat(sheetData.net?.replace(/[$,]/g, '') || '0');
      const dbNet = Number(dbData.netAmount || 0);
      if (Math.abs(sheetNet - dbNet) > 1.0) {
        financialMismatches.push({
          conf,
          guest: sheetData.guest,
          property: sheetData.property,
          sheetNet,
          dbNet,
          diff: dbNet - sheetNet,
          dbSource: dbData.financialSource,
        });
      }
    } else {
      sheetOnlyCount++;
      sheetOnly.push({ conf, ...sheetData });
    }
  }
  
  for (const [conf, dbData] of dbConfirmations) {
    if (!sheetConfirmations.has(conf)) {
      dbOnlyCount++;
      const checkIn = new Date(Number(dbData.checkIn)).toISOString().split('T')[0];
      dbOnly.push({
        conf,
        guest: dbData.guestName,
        property: dbData.propertyName,
        platform: dbData.platform,
        net: Number(dbData.netAmount || 0),
        source: dbData.financialSource,
        checkIn,
      });
    }
  }
  
  console.log(`\n=== RECONCILIATION RESULTS ===`);
  console.log(`Matched (in both): ${matchCount}`);
  console.log(`Sheet only (not in DB): ${sheetOnlyCount}`);
  console.log(`DB only (not in sheet): ${dbOnlyCount}`);
  
  if (financialMismatches.length > 0) {
    console.log(`\n=== FINANCIAL MISMATCHES (net differs by >$1) ===`);
    let totalDiff = 0;
    for (const m of financialMismatches.slice(0, 30)) {
      console.log(`  ${m.conf} | ${m.guest} | ${m.property} | Sheet: $${m.sheetNet.toFixed(2)} | DB: $${m.dbNet.toFixed(2)} | Diff: $${m.diff.toFixed(2)} | Source: ${m.dbSource}`);
      totalDiff += m.diff;
    }
    console.log(`  ... ${financialMismatches.length} total mismatches, total diff: $${totalDiff.toFixed(2)}`);
  }
  
  if (sheetOnly.length > 0) {
    console.log(`\n=== IN SPREADSHEET BUT NOT IN DB (first 20) ===`);
    for (const s of sheetOnly.slice(0, 20)) {
      console.log(`  ${s.conf} | ${s.guest} | ${s.property} | ${s.platform} | Net: ${s.net}`);
    }
  }
  
  if (dbOnly.length > 0) {
    console.log(`\n=== IN DB BUT NOT IN SPREADSHEET (by property, first 30) ===`);
    // Group by property
    const byProp: Record<string, any[]> = {};
    for (const d of dbOnly) {
      if (!byProp[d.property]) byProp[d.property] = [];
      byProp[d.property].push(d);
    }
    for (const [prop, items] of Object.entries(byProp)) {
      const totalNet = items.reduce((sum, i) => sum + i.net, 0);
      console.log(`\n  ${prop}: ${items.length} bookings, total net $${totalNet.toFixed(2)}`);
      for (const d of items.slice(0, 10)) {
        console.log(`    ${d.checkIn} | ${d.conf} | ${d.guest} | ${d.platform} | Net: $${d.net.toFixed(2)} | Source: ${d.source}`);
      }
      if (items.length > 10) console.log(`    ... and ${items.length - 10} more`);
    }
  }
  
  await pool.end();
  process.exit(0);
}
main();
