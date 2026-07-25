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

// Load data
const gdrive_s3 = JSON.parse(readFileSync('/home/ubuntu/upload/gdrive_receipts_s3.json', 'utf8'));
const catResults = JSON.parse(readFileSync('/home/ubuntu/categorise_receipts.json', 'utf8'));

// Get 2025 AB receipts
const ab2025 = catResults.results
  .filter(r => r.output && !r.error && r.output.vertical === 'artistes_boutique' && r.output.date?.startsWith('2025'))
  .map(r => ({ ...r.output, filename: r.input }));

console.log(`Found ${ab2025.length} 2025 AB receipts to add`);

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

// Build correctly-aligned rows
// Sheet columns: Date | Month | Category | Description | Amount (JMD) | Amount (USD) | Source Documentation Link
const newRows = ab2025.map(r => {
  const s3Url = gdrive_s3[r.filename] || '';
  const month = parseInt(r.date?.slice(5,7) || '1');
  const monthName = MONTH_NAMES[month] || '';
  const amtJMD = r.currency === 'JMD' ? (r.amount || 0) : 0;
  const amtUSD = r.currency === 'USD' ? (r.amount || 0) : 0;
  return [r.date, monthName, r.category, r.description || r.vendor_name, amtJMD, amtUSD, s3Url];
});

// Append to sheet
const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'2025 Expenses'!A:G")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
const appendResp = await fetch(appendUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ values: newRows }),
});
const appendResult = await appendResp.json();
console.log('Append result:', appendResult.updates?.updatedRange || JSON.stringify(appendResult).slice(0,120));

// Verify final state
const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'2025 Expenses'!A1:G40")}`;
const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
const getData = await getResp.json();
const rows = getData.values || [];
console.log(`\nFinal row count: ${rows.length}`);
console.log('Last 8 rows:');
for (const row of rows.slice(-8)) {
  console.log(' ', row.slice(0,5).join(' | '));
}
