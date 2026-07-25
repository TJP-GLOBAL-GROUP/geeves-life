/**
 * Create a "Walmart Orders 2025" tab in the property management spreadsheet
 * with all 185 orders and their receipt URLs for audit reference.
 */
import { google } from 'googleapis';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';
const TAB_NAME = 'Walmart Orders 2025';

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

async function main() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Get all orders from DB
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [orders] = await conn.execute(
    `SELECT id, orderDate, orderType, totalAmount, seller, location, 
            rawDescription, walmartOrderId, walmartUrl, receiptUrl,
            categorizationStatus
     FROM walmart_orders 
     WHERE householdId = '1S9K7Jw7DtkJJTP2Jgtr6' 
     ORDER BY orderDate ASC`
  );
  conn.destroy();
  
  console.log(`Preparing ${orders.length} orders for spreadsheet...`);
  
  // Check if tab already exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTab = spreadsheet.data.sheets.find(s => s.properties.title === TAB_NAME);
  
  if (existingTab) {
    // Clear existing tab
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${TAB_NAME}'!A:Z`,
    });
    console.log('Cleared existing tab');
  } else {
    // Create new tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: TAB_NAME }
          }
        }]
      }
    });
    console.log('Created new tab');
  }
  
  // Build header row
  const headers = [
    'Date', 'Order Type', 'Amount', 'Seller', 'Location',
    'Description', 'Walmart Order ID', 'Walmart URL', 'Receipt Image URL',
    'Categorization Status', 'Vertical', 'Category'
  ];
  
  // Build data rows
  const rows = orders.map(o => [
    o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '',
    o.orderType || '',
    o.totalAmount ? Number(o.totalAmount).toFixed(2) : '',
    o.seller || '',
    o.location || '',
    (o.rawDescription || '').replace(/\n\[Receipt:.*?\]/g, '').substring(0, 100),
    o.walmartOrderId || '',
    o.walmartUrl || '',
    o.receiptUrl || '',
    o.categorizationStatus || 'pending',
    '', // Vertical - to be filled after categorization
    '', // Category - to be filled after categorization
  ]);
  
  // Write to spreadsheet
  const allData = [headers, ...rows];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: allData },
  });
  
  console.log(`Written ${rows.length} rows to "${TAB_NAME}" tab`);
  
  // Format header row (bold, freeze)
  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const newTab = sheetInfo.data.sheets.find(s => s.properties.title === TAB_NAME);
  const sheetId = newTab.properties.sheetId;
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          }
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          }
        }
      ]
    }
  });
  
  console.log('Formatted header row');
  console.log('Done!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
