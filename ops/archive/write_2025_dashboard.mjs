/**
 * Write 2025 expense data to the Dashboard tab.
 * Column mapping (0-indexed, matching 2024 section):
 *  C(2)  = month label (e.g. "Jan-2025")
 *  D(3)  = month number
 *  E(4)  = year
 *  F(5)  = ADMINISTRATIVE EXPENSE
 *  G(6)  = ASSETS: EQUIPMENT
 *  H(7)  = ASSETS: FURNITURE
 *  I(8)  = BANK FEES
 *  J(9)  = CLEANING FEE
 *  K(10) = CLEANING SUPPLIES
 *  L(11) = MAINTENANCE SUPPLIES
 *  M(12) = MORTGAGE PAYMENT
 *  N(13) = FIXTURES AND FITTINGS
 *  O(14) = PROPERTY TAX
 *  P(15) = PERSONAL EXPENSE
 *  Q(16) = REPAIR COST
 *  R(17) = TRANSPORTATION EXPENSE
 *  S(18) = UTILITIES
 *  T(19) = VEHICLE EXPENSE
 *  U(20) = VEHICLE LOAN
 *  V(21) = VEHICLE REPAIR COST
 *  W(22) = (blank)
 *  X(23) = TOTAL
 *  Y(24) = (blank)
 *  Z(25) = TAZ LOAN
 */
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_KEY_PEM = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function base64url(str) { return Buffer.from(str).toString('base64url'); }

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(SERVICE_KEY_PEM, 'base64url');
  const jwt = `${signingInput}.${signature}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sheetsGet(token, range) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (data.error) throw new Error(`Sheets read error: ${JSON.stringify(data.error)}`);
  return data.values || [];
}

async function sheetsUpdate(token, range, values) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  );
  const data = await resp.json();
  if (data.error) throw new Error(`Sheets write error: ${JSON.stringify(data.error)}`);
  return data;
}

// Column index mapping (0-based)
const COL = {
  MONTH_LABEL: 2,
  MONTH_NUM: 3,
  YEAR: 4,
  'ADMINISTRATIVE EXPENSE': 5,
  'ASSETS: EQUIPMENT': 6,
  'ASSETS: FURNITURE': 7,
  'BANK FEES': 8,
  'CLEANING FEE': 9,
  'CLEANING SUPPLIES': 10,
  'MAINTENANCE SUPPLIES': 11,
  'MORTGAGE PAYMENT': 12,
  'FIXTURES AND FITTINGS': 13,
  'PROPERTY TAX': 14,
  'PERSONAL EXPENSE': 15,
  'REPAIR COST': 16,
  'TRANSPORTATION EXPENSE': 17,
  'UTILITIES': 18,
  'VEHICLE EXPENSE': 19,
  'VEHICLE LOAN': 20,
  'VEHICLE REPAIR COST': 21,
  TOTAL: 23,
  TAZ_LOAN: 25,
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NUM_COLS = 28; // A through AB

// Load 2025 expense data
const expenseData = JSON.parse(readFileSync('/home/ubuntu/upload/all_2025_expenses_final.json', 'utf8'));
const monthlyTotals = expenseData.monthly_totals;

const token = await getToken();
console.log('Got service account token');

// Read current dashboard to find where to write 2025
const dashRows = await sheetsGet(token, 'Dashboard!A1:AB120');
console.log(`Dashboard has ${dashRows.length} rows`);

// Find existing 2025 section or determine append position
let section2025Start = -1;
let lastDataRow = 0;

for (let i = 0; i < dashRows.length; i++) {
  const row = dashRows[i] || [];
  const rowStr = row.join('|').toLowerCase();
  
  if (rowStr.includes('jan-2025') || (rowStr.includes('jan') && rowStr.includes('2025'))) {
    if (section2025Start === -1) section2025Start = i;
  }
  if (row.some(c => c && c.toString().trim())) {
    lastDataRow = i;
  }
}

console.log(`Existing 2025 section: ${section2025Start >= 0 ? `row ${section2025Start+1}` : 'not found'}`);
console.log(`Last data row: ${lastDataRow + 1}`);

// Build 2025 rows
const rows2025 = [];
const yearTotals = {};

for (let m = 1; m <= 12; m++) {
  const monthData = monthlyTotals[m.toString()] || {};
  const row = new Array(NUM_COLS).fill('');
  
  row[COL.MONTH_LABEL] = `${MONTHS[m-1]}-2025`;
  row[COL.MONTH_NUM] = m.toString();
  row[COL.YEAR] = '2025';
  
  let rowTotal = 0;
  
  for (const [cat, colIdx] of Object.entries(COL)) {
    if (['MONTH_LABEL','MONTH_NUM','YEAR','TOTAL','TAZ_LOAN'].includes(cat)) continue;
    const amt = monthData[cat] || 0;
    row[colIdx] = `$${amt.toFixed(2)}`;
    rowTotal += amt;
    yearTotals[cat] = (yearTotals[cat] || 0) + amt;
  }
  
  row[COL.TOTAL] = `$${rowTotal.toFixed(2)}`;
  row[COL.TAZ_LOAN] = '$0.00';
  rows2025.push(row);
}

// Year total row
const yearTotalRow = new Array(NUM_COLS).fill('');
yearTotalRow[COL.MONTH_LABEL] = 'Year Total';
let grandTotal = 0;
for (const [cat, colIdx] of Object.entries(COL)) {
  if (['MONTH_LABEL','MONTH_NUM','YEAR','TOTAL','TAZ_LOAN'].includes(cat)) continue;
  const amt = yearTotals[cat] || 0;
  yearTotalRow[colIdx] = `$${amt.toFixed(2)}`;
  grandTotal += amt;
}
yearTotalRow[COL.TOTAL] = `$${grandTotal.toFixed(2)}`;
yearTotalRow[COL.TAZ_LOAN] = '$0.00';
rows2025.push(yearTotalRow);

// Determine write position
let writeRow; // 1-indexed
if (section2025Start >= 0) {
  writeRow = section2025Start + 1;
  console.log(`Overwriting existing 2025 section starting at row ${writeRow}`);
} else {
  writeRow = lastDataRow + 3; // 2 blank rows gap
  console.log(`Appending 2025 section at row ${writeRow}`);
}

// Write section header
const sectionHeaderRow = new Array(NUM_COLS).fill('');
sectionHeaderRow[COL.MONTH_LABEL] = '2025 EXPENSES';
const allRows = [sectionHeaderRow, ...rows2025];

const range = `Dashboard!A${writeRow}:AB${writeRow + allRows.length - 1}`;
console.log(`Writing to range: ${range}`);

const result = await sheetsUpdate(token, range, allRows);
console.log(`\n✅ 2025 Dashboard written successfully!`);
console.log(`   ${allRows.length} rows written (12 months + year total + header)`);
console.log(`\n=== 2025 EXPENSE SUMMARY ===`);
console.log(`Grand Total: JMD $${grandTotal.toLocaleString()}`);
console.log('\nBy category:');
for (const [cat, colIdx] of Object.entries(COL)) {
  if (['MONTH_LABEL','MONTH_NUM','YEAR','TOTAL','TAZ_LOAN'].includes(cat)) continue;
  const amt = yearTotals[cat] || 0;
  if (amt > 0) console.log(`  ${cat}: JMD $${amt.toLocaleString()}`);
}
