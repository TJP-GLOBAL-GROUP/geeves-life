/**
 * Update the 2025 Expenses sheet G column (Source Documentation Link)
 * with the S3 storage paths from the uploaded vendor evidence files.
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

// Parse the S3 path files
function parsePathFile(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').trim().split('\n');
    const map = {};
    for (const line of lines) {
      const [fname, path] = line.split('|');
      if (fname && path) {
        map[fname.trim()] = path.trim();
      }
    }
    return map;
  } catch (e) {
    return {};
  }
}

const wcpPaths = parsePathFile('/tmp/wcp_s3_paths.txt');
const tajPaths = parsePathFile('/tmp/taj_s3_paths.txt');
const crPaths = parsePathFile('/tmp/cr_s3_paths.txt');

console.log(`WCP paths: ${Object.keys(wcpPaths).length}`);
console.log(`TAJ paths: ${Object.keys(tajPaths).length}`);
console.log(`CR paths: ${Object.keys(crPaths).length}`);

// Load the records to know which row maps to which file
const records = JSON.parse(readFileSync('/home/ubuntu/upload/all_vendor_2025_records.json', 'utf8'));

const token = await getToken();

// Get current sheet data to find the rows we need to update
const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'2025 Expenses'!A1:G80")}`;
const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
const getData = await getResp.json();
const rows = getData.values || [];
console.log(`\nTotal rows in sheet: ${rows.length}`);

// The vendor records start at row 36 (0-indexed: 35)
// Build update data for column G
const updates = [];

for (let i = 0; i < records.length; i++) {
  const record = records[i];
  const sheetRowIndex = 35 + i; // 0-indexed, row 36 is index 35
  const sheetRowNum = sheetRowIndex + 1; // 1-indexed for API
  
  // Find the S3 path for this record
  let s3Path = '';
  const fileBasename = record.file ? record.file.split('/').pop() : '';
  
  if (record.vendor === 'Water_Crystal_Pools') {
    s3Path = wcpPaths[fileBasename] || '';
  } else if (record.vendor === 'TAJ_Property_Tax') {
    s3Path = tajPaths[fileBasename] || '';
  } else if (record.vendor === 'Courtney_Robinson') {
    s3Path = crPaths[fileBasename] || '';
  }
  
  if (s3Path) {
    updates.push({
      range: `'2025 Expenses'!G${sheetRowNum}`,
      values: [[s3Path]],
    });
  }
}

console.log(`\nUpdating ${updates.length} rows with S3 paths...`);

// Batch update
if (updates.length > 0) {
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const batchResp = await fetch(batchUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates,
    }),
  });
  const batchResult = await batchResp.json();
  console.log('Batch update result:', batchResult.totalUpdatedCells, 'cells updated');
}

// Now update the Dashboard 2025 section with the correct totals
// Calculate totals by category
const catTotals = {};
for (const r of records) {
  catTotals[r.category] = (catTotals[r.category] || 0) + (r.amount_jmd || 0);
}

// Also add the 6 GDrive receipts from earlier
const gdriveRecords = JSON.parse(readFileSync('/home/ubuntu/categorise_receipts.json', 'utf8'));
const ab2025gdrive = gdriveRecords.results
  .filter(r => r.output && !r.error && r.output.vertical === 'artistes_boutique' && r.output.date?.startsWith('2025'));

for (const r of ab2025gdrive) {
  const cat = r.output.category;
  const amt = r.output.currency === 'JMD' ? (r.output.amount || 0) : 0;
  catTotals[cat] = (catTotals[cat] || 0) + amt;
}

console.log('\n=== Final 2025 Expense Totals by Category ===');
const grandTotal = Object.values(catTotals).reduce((a,b) => a+b, 0);
for (const [cat, total] of Object.entries(catTotals).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${cat.padEnd(30)}: JMD ${total.toLocaleString('en-US', {minimumFractionDigits:2})}`);
}
console.log(`  ${'GRAND TOTAL'.padEnd(30)}: JMD ${grandTotal.toLocaleString('en-US', {minimumFractionDigits:2})}`);

// Save totals for dashboard update
import { writeFileSync } from 'fs';
writeFileSync('/home/ubuntu/upload/expense_2025_totals.json', JSON.stringify(catTotals, null, 2));
console.log('\nSaved totals to /home/ubuntu/upload/expense_2025_totals.json');
