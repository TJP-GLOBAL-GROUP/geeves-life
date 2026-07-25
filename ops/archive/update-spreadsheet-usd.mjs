/**
 * Update the Google Sheets expense tabs with USD equivalent values.
 * 
 * The Artiste's Boutique expenses are in JMD. We'll add a USD column
 * to each expense detail tab showing the converted amount.
 */

import { google } from 'googleapis';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const pool = await mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 3,
  });

  // Auth
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get all sheet tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];
  
  // Find expense detail tabs for Artiste's Boutique (JMD expenses)
  const expenseTabs = sheetNames.filter(n => 
    n.toLowerCase().includes('expense') && n.toLowerCase().includes('detail')
  );
  console.log('Expense detail tabs found:', expenseTabs);

  // Get all expense records with USD values from DB
  const [expenses] = await pool.execute(`
    SELECT id, expenseDate, expenseDescription, amountJMD, amountUSD, exchangeRateUsed, category
    FROM property_expense_records
    WHERE amountUSD IS NOT NULL AND amountUSD > 0
    ORDER BY expenseDate
  `);
  console.log(`DB has ${expenses.length} expenses with USD values.`);

  // Process each expense tab
  for (const tabName of expenseTabs) {
    console.log(`\nProcessing tab: "${tabName}"`);
    
    // Read the tab to find the structure
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1:Z5`,
    });
    const headers = response.data.values?.[0] || [];
    console.log(`  Headers: ${headers.join(' | ')}`);

    // Find the Amount column and check if USD Equivalent already exists
    const amountCol = headers.findIndex(h => h?.toLowerCase().includes('amount'));
    const usdCol = headers.findIndex(h => h?.toLowerCase().includes('usd equivalent') || h?.toLowerCase() === 'usd');
    const rateCol = headers.findIndex(h => h?.toLowerCase().includes('exchange rate'));
    const currencyCol = headers.findIndex(h => h?.toLowerCase().includes('currency'));

    if (amountCol === -1) {
      console.log(`  No 'Amount' column found, skipping.`);
      continue;
    }

    // Read all data rows
    const allData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1:Z`,
    });
    const allRows = allData.data.values || [];
    console.log(`  Total rows: ${allRows.length}`);

    if (allRows.length <= 1) continue;

    // Strategy: The spreadsheet has max 13 columns (A-M). 
    // We'll write USD Equivalent into column M and Exchange Rate into column L (Currency)
    // But first, expand the grid if needed.
    let usdTargetCol = usdCol;
    let rateTargetCol = rateCol;
    
    // Expand the sheet if we need new columns
    const needsExpansion = usdTargetCol === -1 || rateTargetCol === -1;
    if (needsExpansion) {
      const sheetId = meta.data.sheets.find(s => s.properties?.title === tabName)?.properties?.sheetId;
      if (sheetId !== undefined) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [{
                appendDimension: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  length: 2,
                }
              }]
            }
          });
          console.log(`  Expanded grid by 2 columns.`);
        } catch (e) {
          console.log(`  Grid expansion note: ${e.message.slice(0, 80)}`);
        }
      }
    }
    // Assign target columns - always ensure both are valid
    if (usdTargetCol === -1) usdTargetCol = headers.length;
    if (rateTargetCol === -1) rateTargetCol = usdTargetCol + 1;

    // Build the update data
    const colLetter = (idx) => {
      if (idx < 26) return String.fromCharCode(65 + idx);
      return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
    };

    // Prepare column values: header + data rows
    const usdValues = ['USD Equivalent'];
    const rateValues = ['Exchange Rate (JMD/USD)'];

    // Match spreadsheet rows to DB records by date + amount
    const dateCol = headers.findIndex(h => h?.toLowerCase().includes('date'));
    
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      const rowDate = row[dateCol] || '';
      const rowAmount = row[amountCol] || '';
      
      // Parse the JMD amount from spreadsheet
      const jmdAmount = parseFloat(String(rowAmount).replace(/[$,]/g, ''));
      
      if (!rowDate || isNaN(jmdAmount) || jmdAmount === 0) {
        usdValues.push('');
        rateValues.push('');
        continue;
      }

      // Find matching DB record
      const match = expenses.find(e => {
        const eDate = e.expenseDate instanceof Date 
          ? e.expenseDate.toISOString().slice(0, 10) 
          : String(e.expenseDate).slice(0, 10);
        const eJmd = parseFloat(e.amountJMD);
        return eDate === rowDate && Math.abs(eJmd - jmdAmount) < 1;
      });

      if (match) {
        usdValues.push(`$${parseFloat(match.amountUSD).toFixed(2)}`);
        rateValues.push(parseFloat(match.exchangeRateUsed).toFixed(4));
      } else {
        // Try to calculate from exchange_rates table directly
        const [rateRow] = await pool.execute(`
          SELECT rate FROM exchange_rates 
          WHERE baseCurrency = 'USD' AND targetCurrency = 'JMD' AND rateDate = ?
        `, [rowDate]);
        
        if (rateRow.length > 0) {
          const rate = parseFloat(rateRow[0].rate);
          const usd = (jmdAmount / rate).toFixed(2);
          usdValues.push(`$${usd}`);
          rateValues.push(rate.toFixed(4));
        } else {
          usdValues.push('');
          rateValues.push('');
        }
      }
    }

    // Write the USD column
    const usdColLetter = colLetter(usdTargetCol);
    const rateColLetter = colLetter(rateTargetCol);
    
    console.log(`  Writing USD values to column ${usdColLetter} (${usdValues.filter(v => v).length - 1} values)`);
    console.log(`  Writing exchange rates to column ${rateColLetter}`);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!${usdColLetter}1:${usdColLetter}${allRows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: usdValues.map(v => [v]),
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!${rateColLetter}1:${rateColLetter}${allRows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rateValues.map(v => [v]),
      },
    });

    const filledCount = usdValues.filter(v => v && v !== 'USD Equivalent').length;
    console.log(`  Done: ${filledCount} rows with USD values.`);
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
