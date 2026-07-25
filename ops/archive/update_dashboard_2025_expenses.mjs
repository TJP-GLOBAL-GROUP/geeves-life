/**
 * Update the Dashboard tab with the 2025 expense totals.
 * Mirrors the 2024 Dashboard structure.
 * 
 * 2025 Expense Totals:
 * - CLEANING FEE:         JMD 719,360
 * - PROPERTY TAX:         JMD 470,836
 * - MAINTENANCE SUPPLIES: JMD 453,503
 * - REPAIR COST:          JMD 304,650
 * - UTILITIES:            JMD 64,690
 * - CLEANING SUPPLIES:    JMD 20,003
 * - FIXTURES & FITTINGS:  JMD 15,129
 * - GRAND TOTAL:          JMD 2,048,172
 */
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function base64url(s) { return Buffer.from(s).toString('base64url'); }

async function getToken() {
  const now = Math.floor(Date.now()/1000);
  const h = { alg:'RS256', typ:'JWT' };
  const p = { iss:SA_EMAIL, scope:'https://www.googleapis.com/auth/spreadsheets', aud:'https://oauth2.googleapis.com/token', exp:now+3600, iat:now };
  const si = `${base64url(JSON.stringify(h))}.${base64url(JSON.stringify(p))}`;
  const sign = createSign('RSA-SHA256'); sign.update(si);
  const jwt = `${si}.${sign.sign(SA_KEY,'base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt})
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

const token = await getToken();
console.log('Got token');

// First, read the Dashboard to understand its structure
const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('Dashboard!A1:J120')}`;
const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
const getData = await getResp.json();
const rows = getData.values || [];

console.log(`Dashboard rows: ${rows.length}`);

// Find the 2024 expense section structure
let expenseHeaderRow = -1;
let expenseDataStart = -1;
let expenseDataEnd = -1;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (row[0] && row[0].toString().includes('EXPENSE') && row[0].toString().includes('2024')) {
    expenseHeaderRow = i;
    console.log(`Found 2024 expense header at row ${i+1}: ${JSON.stringify(row)}`);
  }
  if (row[0] && row[0].toString().includes('CLEANING FEE') && expenseHeaderRow > 0 && expenseDataStart < 0) {
    expenseDataStart = i;
    console.log(`Expense data starts at row ${i+1}`);
  }
  if (row[0] && row[0].toString().includes('TOTAL') && expenseDataStart > 0 && expenseDataEnd < 0) {
    expenseDataEnd = i;
    console.log(`Expense data ends at row ${i+1}: ${JSON.stringify(row)}`);
  }
}

// Show the 2024 expense section
console.log('\n2024 expense section:');
for (let i = Math.max(0, expenseHeaderRow); i <= Math.min(rows.length-1, expenseDataEnd + 2); i++) {
  console.log(`  Row ${i+1}: ${JSON.stringify(rows[i])}`);
}

// Find where the 2025 section should go (after the 2024 section)
const insert2025After = expenseDataEnd + 2; // Leave a blank row
console.log(`\nWill insert 2025 section after row ${insert2025After + 1}`);

// Load the 2025 expense totals
const catTotals = JSON.parse(readFileSync('/home/ubuntu/upload/expense_2025_totals.json', 'utf8'));
const grandTotal = Object.values(catTotals).reduce((a,b) => a+b, 0);

// Build the 2025 expense section mirroring 2024 structure
// Look at the 2024 structure to understand the column layout
const sampleRow = rows[expenseDataStart] || [];
console.log('\nSample 2024 expense row structure:', JSON.stringify(sampleRow));

// The 2025 section will be appended after the current last row
// First find the actual last row with data
let lastRow = rows.length;
for (let i = rows.length - 1; i >= 0; i--) {
  if (rows[i] && rows[i].some(c => c && c.toString().trim())) {
    lastRow = i + 1;
    break;
  }
}
console.log(`\nLast row with data: ${lastRow}`);

// Build 2025 expense section
const CATEGORY_ORDER = [
  'CLEANING FEE',
  'MAINTENANCE SUPPLIES', 
  'REPAIR COST',
  'UTILITIES',
  'CLEANING SUPPLIES',
  'FIXTURES AND FITTINGS',
  'PROPERTY TAX',
  'ADMINISTRATIVE EXPENSE',
];

const startRow = lastRow + 3; // Leave 2 blank rows

const sectionRows = [
  ['ARTISTE\'S BOUTIQUE - 2025 EXPENSES', '', '', '', '', '', '', '', '', ''],
  ['Category', 'Amount (JMD)', 'Amount (USD)', 'Source Count', '', '', '', '', '', ''],
];

let totalJMD = 0;
for (const cat of CATEGORY_ORDER) {
  const amt = catTotals[cat] || 0;
  if (amt > 0) {
    sectionRows.push([cat, amt, 0, '', '', '', '', '', '', '']);
    totalJMD += amt;
  }
}

// Add any categories not in the ordered list
for (const [cat, amt] of Object.entries(catTotals)) {
  if (!CATEGORY_ORDER.includes(cat) && amt > 0) {
    sectionRows.push([cat, amt, 0, '', '', '', '', '', '', '']);
    totalJMD += amt;
  }
}

sectionRows.push(['TOTAL EXPENSES 2025', totalJMD, 0, '', '', '', '', '', '', '']);

console.log(`\nWriting ${sectionRows.length} rows starting at row ${startRow}...`);

const range = `Dashboard!A${startRow}:J${startRow + sectionRows.length - 1}`;
const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
const updateResp = await fetch(updateUrl, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ range, majorDimension: 'ROWS', values: sectionRows }),
});
const updateResult = await updateResp.json();
console.log('Write result:', updateResult.updatedRange || JSON.stringify(updateResult).slice(0,100));

console.log('\n=== 2025 Expense Summary Written to Dashboard ===');
for (const row of sectionRows) {
  if (row[1]) console.log(`  ${row[0].padEnd(30)}: JMD ${Number(row[1]).toLocaleString('en-US', {minimumFractionDigits:2})}`);
}
