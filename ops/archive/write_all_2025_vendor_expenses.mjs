/**
 * Upload vendor evidence files to S3 and write all 41 vendor records
 * to the 2025 Expenses sheet in the correct columns.
 * 
 * Sources:
 * - Water Crystal Pool invoices (9 records, JMD 400,100)
 * - TAJ Property Tax (1 record, JMD 470,836)
 * - Courtney Robinson transfers (30 records, JMD 910,010)
 * Total: 41 records, JMD 1,783,346
 */
import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function base64url(s) { return Buffer.from(s).toString('base64url'); }

async function getSheetToken() {
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

async function uploadToS3(localPath, s3Key) {
  try {
    const fileBytes = readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = ext === '.pdf' ? 'application/pdf' : 
                     ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                     ext === '.png' ? 'image/png' : 'application/octet-stream';
    
    const resp = await fetch(`${FORGE_API_URL}/storage/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FORGE_API_KEY}`,
        'Content-Type': mimeType,
        'X-File-Key': s3Key,
      },
      body: fileBytes,
    });
    
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Upload failed: ${resp.status} ${text.slice(0,100)}`);
    }
    
    const result = await resp.json();
    return result.url || result.publicUrl || `${FORGE_API_URL}/storage/files/${s3Key}`;
  } catch (e) {
    // Fallback: use manus-upload-file
    try {
      const output = execSync(`manus-upload-file --webdev "${localPath}"`, { encoding: 'utf8', timeout: 30000 });
      const urlMatch = output.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0] : '';
    } catch (e2) {
      console.error(`  Upload failed for ${localPath}: ${e2.message}`);
      return '';
    }
  }
}

const records = JSON.parse(readFileSync('/home/ubuntu/upload/all_vendor_2025_records.json', 'utf8'));
console.log(`Processing ${records.length} records...`);

const sheetToken = await getSheetToken();

// First, get current row count to know where to append
const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'2025 Expenses'!A:A")}`;
const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${sheetToken}` } });
const getData = await getResp.json();
const currentRows = (getData.values || []).length;
console.log(`Current rows in 2025 Expenses: ${currentRows}`);

// Build rows with S3 URLs
const newRows = [];
let uploaded = 0;
let failed = 0;

for (const record of records) {
  let s3Url = '';
  
  if (record.file && existsSync(record.file)) {
    const fname = path.basename(record.file);
    const s3Key = `artiste-boutique/vendor-evidence/2025/${record.vendor}/${fname}`;
    console.log(`  Uploading ${fname}...`);
    s3Url = await uploadToS3(record.file, s3Key);
    if (s3Url) uploaded++;
    else failed++;
  }
  
  newRows.push([
    record.date,
    record.month,
    record.category,
    record.description,
    record.amount_jmd || 0,
    record.amount_usd || 0,
    s3Url,
  ]);
}

console.log(`\nUploaded: ${uploaded}, Failed: ${failed}`);
console.log(`Writing ${newRows.length} rows to sheet starting at row ${currentRows + 1}...`);

// Write to sheet using PUT to exact range
const startRow = currentRows + 1;
const endRow = startRow + newRows.length - 1;
const range = `'2025 Expenses'!A${startRow}:G${endRow}`;
const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
const updateResp = await fetch(updateUrl, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${sheetToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ range, majorDimension: 'ROWS', values: newRows }),
});
const updateResult = await updateResp.json();
console.log('Write result:', updateResult.updatedRange || JSON.stringify(updateResult).slice(0,100));

// Summary by category
const catTotals = {};
for (const r of records) {
  catTotals[r.category] = (catTotals[r.category] || 0) + (r.amount_jmd || 0);
}
console.log('\n=== 2025 Vendor Expense Summary ===');
for (const [cat, total] of Object.entries(catTotals).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${cat.padEnd(30)}: JMD ${total.toLocaleString('en-US', {minimumFractionDigits:2})}`);
}
const grandTotal = Object.values(catTotals).reduce((a,b) => a+b, 0);
console.log(`  ${'GRAND TOTAL'.padEnd(30)}: JMD ${grandTotal.toLocaleString('en-US', {minimumFractionDigits:2})}`);
