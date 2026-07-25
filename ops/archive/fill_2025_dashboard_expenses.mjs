/**
 * Fill in the 2025 expense monthly data in the Dashboard.
 * 
 * Column mapping (0-indexed):
 * F(5)  = ADMINISTRATIVE EXPENSE
 * J(9)  = CLEANING FEE
 * K(10) = CLEANING SUPPLIES
 * L(11) = MAINTENANCE SUPPLIES
 * N(13) = FIXTURES AND FITTINGS
 * O(14) = PROPERTY TAX
 * Q(16) = REPAIR COST
 * S(18) = UTILITIES
 * X(23) = TOTAL
 * 
 * Rows 70-81 = Jan-Dec 2025 (row 70 = Jan, row 81 = Dec)
 * Row 82 = Year Total
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
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt}) });
  const d = await r.json();
  if (!d.access_token) throw new Error(JSON.stringify(d));
  return d.access_token;
}

const token = await getToken();
console.log('Got token');

// Load all 2025 vendor records
const allRecords = JSON.parse(readFileSync('/home/ubuntu/upload/all_vendor_2025_records.json', 'utf8'));

// Also load the GDrive 2025 receipts
const gdriveData = JSON.parse(readFileSync('/home/ubuntu/categorise_receipts.json', 'utf8'));
const ab2025gdrive = gdriveData.results
  .filter(r => r.output && !r.error && 
    r.output.vertical === 'artistes_boutique' && 
    r.output.date?.startsWith('2025') &&
    r.output.currency === 'JMD');

// Combine all records
const combined = [...allRecords];
for (const r of ab2025gdrive) {
  combined.push({
    date: r.output.date,
    category: r.output.category,
    amount_jmd: r.output.amount || 0,
  });
}

// Column mapping: category -> column letter
const COL_MAP = {
  'ADMINISTRATIVE EXPENSE': 'F',
  'CLEANING FEE': 'J',
  'CLEANING SUPPLIES': 'K',
  'MAINTENANCE SUPPLIES': 'L',
  'FIXTURES AND FITTINGS': 'N',
  'PROPERTY TAX': 'O',
  'REPAIR COST': 'Q',
  'UTILITIES': 'S',
};

// Aggregate by month and category
// months: Jan=1 -> row 70, Dec=12 -> row 81
const monthlyData = {}; // month (1-12) -> category -> total
for (let m = 1; m <= 12; m++) monthlyData[m] = {};

for (const r of combined) {
  if (!r.date || !r.date.startsWith('2025')) continue;
  const month = parseInt(r.date.slice(5, 7));
  if (!month || month < 1 || month > 12) continue;
  const cat = r.category;
  if (!COL_MAP[cat]) continue;
  monthlyData[month][cat] = (monthlyData[month][cat] || 0) + (r.amount_jmd || 0);
}

// Build batch updates
const updates = [];

for (let month = 1; month <= 12; month++) {
  const rowNum = 69 + month; // Row 70 = Jan (month=1)
  const monthData = monthlyData[month];
  
  let rowTotal = 0;
  for (const [cat, col] of Object.entries(COL_MAP)) {
    const amt = monthData[cat] || 0;
    if (amt > 0) {
      updates.push({
        range: `Dashboard!${col}${rowNum}`,
        values: [[amt]],
      });
      rowTotal += amt;
    }
  }
  
  if (rowTotal > 0) {
    updates.push({
      range: `Dashboard!X${rowNum}`,
      values: [[rowTotal]],
    });
    console.log(`  Month ${month} (row ${rowNum}): JMD ${rowTotal.toLocaleString()}`);
  }
}

// Year total row (row 82)
const yearTotals = {};
for (let m = 1; m <= 12; m++) {
  for (const [cat, amt] of Object.entries(monthlyData[m])) {
    yearTotals[cat] = (yearTotals[cat] || 0) + amt;
  }
}
let grandTotal = 0;
for (const [cat, col] of Object.entries(COL_MAP)) {
  const amt = yearTotals[cat] || 0;
  if (amt > 0) {
    updates.push({ range: `Dashboard!${col}82`, values: [[amt]] });
    grandTotal += amt;
  }
}
if (grandTotal > 0) {
  updates.push({ range: `Dashboard!X82`, values: [[grandTotal]] });
}

console.log(`\nTotal updates: ${updates.length}`);
console.log(`Grand Total 2025: JMD ${grandTotal.toLocaleString('en-US', {minimumFractionDigits:2})}`);

// Also clear the incorrectly appended section at rows 121-130
const clearUpdates = [];
for (let r = 121; r <= 130; r++) {
  clearUpdates.push({ range: `Dashboard!A${r}:Z${r}`, values: [['']] });
}

if (updates.length > 0) {
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const batchResp = await fetch(batchUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: [...updates, ...clearUpdates] }),
  });
  const result = await batchResp.json();
  console.log(`\nBatch update: ${result.totalUpdatedCells} cells updated`);
}

console.log('\n=== 2025 Dashboard Expense Summary ===');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
for (let m = 1; m <= 12; m++) {
  const total = Object.values(monthlyData[m]).reduce((a,b) => a+b, 0);
  if (total > 0) {
    console.log(`  ${MONTHS[m-1]}: JMD ${total.toLocaleString()}`);
  }
}
console.log(`  YEAR TOTAL: JMD ${grandTotal.toLocaleString('en-US', {minimumFractionDigits:2})}`);
