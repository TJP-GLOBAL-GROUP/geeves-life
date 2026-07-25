/**
 * Compare expense data between spreadsheet and DB
 * 1. Read expense tab headers from spreadsheet
 * 2. Sample some rows from both
 * 3. Show what's in the DB (categories, years, amounts)
 * 4. Show what's in the spreadsheet expense tabs
 */

import { google } from 'googleapis';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const pool = await mysql.createPool(process.env.DATABASE_URL);

  // Auth
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get all sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];
  console.log('=== ALL SHEET TABS ===');
  sheetNames.forEach(n => console.log(`  ${n}`));

  // Find expense tabs
  const expenseTabs = sheetNames.filter(n => n.toLowerCase().includes('expense') || n.toLowerCase().includes('detail'));
  console.log('\n=== EXPENSE/DETAIL TABS ===');
  expenseTabs.forEach(n => console.log(`  ${n}`));

  // Read headers and first 5 rows from each expense tab
  for (const tab of expenseTabs) {
    console.log(`\n=== TAB: "${tab}" ===`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z10`,
    });
    const rows = response.data.values || [];
    if (rows.length > 0) {
      console.log('  HEADERS:', rows[0].join(' | '));
      console.log('  ---');
      for (let i = 1; i < Math.min(rows.length, 4); i++) {
        console.log(`  Row ${i}:`, rows[i].join(' | '));
      }
    }
  }

  // DB expense summary
  console.log('\n\n=== DB EXPENSE SUMMARY ===');
  const [summary] = await pool.execute(`
    SELECT property, expenseYear, category, COUNT(*) as cnt, 
           SUM(amountJMD) as totalJMD, SUM(amountUSD) as totalUSD
    FROM property_expense_records
    GROUP BY property, expenseYear, category
    ORDER BY property, expenseYear, category
  `);
  console.log(`Total categories: ${summary.length}`);
  for (const row of summary) {
    console.log(`  ${row.property} | ${row.expenseYear} | ${row.category} | ${row.cnt} rows | JMD ${row.totalJMD} | USD ${row.totalUSD || 'null'}`);
  }

  // Sample DB rows
  console.log('\n=== SAMPLE DB EXPENSE ROWS ===');
  const [samples] = await pool.execute(`
    SELECT id, property, expenseDate, expenseYear, expenseDescription, category, 
           amountJMD, amountUSD, paidTo, paidFrom, supportingDocUrl, source
    FROM property_expense_records 
    ORDER BY expenseDate DESC LIMIT 5
  `);
  for (const row of samples) {
    console.log(JSON.stringify(row, null, 2));
  }

  // Check what the reconciliation report was looking at
  console.log('\n=== WHY RECONCILIATION SAID $0 ===');
  // The reconciliation likely looked for USD amounts or joined on propertyId
  const [usdCheck] = await pool.execute(`
    SELECT COUNT(*) as withUSD FROM property_expense_records WHERE amountUSD IS NOT NULL AND amountUSD > 0
  `);
  console.log(`Rows with amountUSD > 0: ${usdCheck[0].withUSD}`);
  
  const [jmdCheck] = await pool.execute(`
    SELECT COUNT(*) as withJMD FROM property_expense_records WHERE amountJMD > 0
  `);
  console.log(`Rows with amountJMD > 0: ${jmdCheck[0].withJMD}`);

  // Check if property column uses enum values that match property names
  const [propValues] = await pool.execute(`
    SELECT DISTINCT property FROM property_expense_records
  `);
  console.log(`\nDistinct property values in expenses: ${propValues.map(r => r.property).join(', ')}`);

  const [propNames] = await pool.execute(`
    SELECT id, name FROM properties
  `);
  console.log(`Properties table names: ${propNames.map(r => `${r.name} (${r.id})`).join(', ')}`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
