/**
 * Insert vendor evidence + Google Drive receipts into financial_documents DB
 * and update the 2025 Expenses sheet with new Artiste's Boutique receipts.
 */
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { createSign } from 'crypto';

const db = await mysql.createConnection(process.env.DATABASE_URL);
const VERTICAL = 'artistes_boutique';

// ─── 1. Fix vendor evidence DB inserts (153 docs already uploaded) ───────────
const manifest = JSON.parse(fs.readFileSync('/home/ubuntu/upload/vendor_evidence_manifest.json', 'utf8'));
const withUrls = manifest.filter(e => e.s3_url);
console.log(`Inserting ${withUrls.length} vendor evidence docs into DB...`);

let inserted = 0;
let failed = 0;

for (const entry of withUrls) {
  try {
    // documentDate must be a DATETIME string, not a timestamp number
    const docDateStr = entry.date ? `${entry.date} 00:00:00` : null;
    const docType = entry.doc_type === 'bill' ? 'invoice' : 'receipt';
    
    await db.execute(`
      INSERT IGNORE INTO financial_documents 
      (vertical, documentType, documentDate, description, s3Url, originalFilename, 
       statementYear, currency, taxYear, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      VERTICAL, docType, docDateStr,
      `${entry.vendor} - ${entry.doc_type} - ${entry.date} - ${entry.category}`,
      entry.s3_url,
      path.basename(entry.local_file),
      entry.year, entry.currency || 'JMD', entry.year,
    ]);
    inserted++;
  } catch (e) {
    failed++;
    if (failed <= 3) console.log(`  ✗ ${path.basename(entry.local_file)}: ${e.message.slice(0, 80)}`);
  }
}
console.log(`  Vendor evidence: ${inserted} inserted, ${failed} failed`);

// ─── 2. Upload + insert Google Drive Artiste's Boutique receipts ──────────────
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const RECEIPTS_DIR = '/home/ubuntu/upload/receipts_gdrive';
const catResults = JSON.parse(fs.readFileSync('/home/ubuntu/categorise_receipts.json', 'utf8'));

// Get AB receipts from categorisation
const abReceipts = catResults.results
  .filter(r => r.output && !r.error && r.output.vertical === 'artistes_boutique')
  .map(r => r.output);

console.log(`\nProcessing ${abReceipts.length} Artiste's Boutique receipts from Google Drive...`);

// Find the original filename from the input field
const inputToFilename = {};
for (const r of catResults.results) {
  if (r.output) {
    inputToFilename[r.input] = r.input; // input IS the filename
  }
}

function ensureTrailingSlash(v) { return v.endsWith('/') ? v : `${v}/`; }

async function storagePut(relKey, filePath) {
  const key = relKey.replace(/^\/+/, '');
  const baseUrl = FORGE_URL.replace(/\/+$/, '');
  const uploadUrl = new URL('v1/storage/upload', ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set('path', key);
  const fileBuffer = fs.readFileSync(filePath);
  const fname = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.pdf' ? 'application/pdf' :
                   (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' :
                   ext === '.png' ? 'image/png' : 'application/octet-stream';
  const blob = new Blob([fileBuffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, fname);
  const resp = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Upload failed (${resp.status}): ${msg.slice(0, 80)}`);
  }
  const result = await resp.json();
  return result.url || '';
}

const gdrive_s3_map = {}; // filename -> s3Url
let gdrive_uploaded = 0;
let gdrive_inserted = 0;

for (const receipt of abReceipts) {
  // Find the filename - it's stored in the input field of the categorisation result
  const matchingResult = catResults.results.find(r => 
    r.output === receipt || 
    (r.output && r.output.date === receipt.date && r.output.vendor_name === receipt.vendor_name)
  );
  const filename = matchingResult?.input;
  if (!filename) { console.log(`  ✗ No filename for ${receipt.vendor_name}`); continue; }
  
  const localFile = path.join(RECEIPTS_DIR, filename);
  if (!fs.existsSync(localFile)) { console.log(`  ✗ File not found: ${filename}`); continue; }
  
  // Upload to S3
  const vendorSlug = (receipt.vendor_name || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileKey = `artiste-boutique/gdrive-receipts/${receipt.date?.slice(0,4) || '2025'}/${vendorSlug}_${receipt.date}_${filename.replace(/[^a-z0-9._-]/gi, '_')}`;
  
  let s3Url = '';
  try {
    s3Url = await storagePut(fileKey, localFile);
    gdrive_uploaded++;
    gdrive_s3_map[filename] = s3Url;
  } catch (e) {
    console.log(`  ✗ Upload failed for ${filename}: ${e.message}`);
    continue;
  }
  
  // Insert into DB
  try {
    const docDateStr = receipt.date ? `${receipt.date} 00:00:00` : null;
    const year = parseInt(receipt.date?.slice(0,4) || '2025');
    await db.execute(`
      INSERT IGNORE INTO financial_documents 
      (vertical, documentType, documentDate, description, s3Url, originalFilename,
       statementYear, currency, taxYear, createdAt, updatedAt)
      VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      VERTICAL, docDateStr,
      `${receipt.vendor_name} - ${receipt.category} - ${receipt.date}`,
      s3Url, filename, year, receipt.currency || 'JMD', year,
    ]);
    gdrive_inserted++;
  } catch (e) {
    console.log(`  ✗ DB error for ${filename}: ${e.message.slice(0, 80)}`);
  }
}

console.log(`  GDrive receipts: ${gdrive_uploaded} uploaded, ${gdrive_inserted} inserted`);

// Save the s3 map for use in sheets update
fs.writeFileSync('/home/ubuntu/upload/gdrive_receipts_s3.json', JSON.stringify(gdrive_s3_map, null, 2));

// ─── 3. Update Google Sheets with 2025 AB receipts ───────────────────────────
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function base64url(str) { return Buffer.from(str).toString('base64url'); }

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SA_EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(SA_KEY, 'base64url');
  const jwt = `${signingInput}.${signature}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return resp.json();
}

async function sheetsAppend(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return resp.json();
}

console.log('\nUpdating Google Sheets with 2025 AB receipts...');
const token = await getAccessToken();

// Get the 2025 Expenses sheet headers to understand column layout
const headers = await sheetsGet(token, '2025 Expenses!A1:Z1');
console.log('2025 Expenses headers:', headers.values?.[0] || 'No headers found');

// Get existing rows to avoid duplicates
const existing2025 = await sheetsGet(token, '2025 Expenses!A:Z');
const existingRows = existing2025.values || [];
console.log(`Existing rows in 2025 Expenses: ${existingRows.length}`);

// Build rows for 2025 AB receipts from Google Drive
const ab2025 = abReceipts.filter(r => r.date?.startsWith('2025'));
console.log(`2025 AB receipts to add: ${ab2025.length}`);

// Map category to spreadsheet category column
const CATEGORY_MAP = {
  'MAINTENANCE SUPPLIES': 'MAINTENANCE SUPPLIES',
  'CLEANING SUPPLIES': 'CLEANING FEE',
  'UTILITIES': 'UTILITIES',
  'REPAIR COST': 'REPAIR COST',
  'FIXTURES AND FITTINGS': 'FIXTURES AND FITTINGS',
  'ADMINISTRATIVE EXPENSE': 'ADMINISTRATIVE EXPENSE',
  'FUEL': 'MAINTENANCE SUPPLIES',
};

// Determine sheet column structure from headers
const headerRow = existingRows[0] || [];
console.log('Header columns:', headerRow);

// Build new rows to append
// Standard format: Date | Description | Category | Amount (JMD) | Currency | Vendor | Source Doc URL
const newRows = [];
for (const receipt of ab2025) {
  const matchingResult = catResults.results.find(r => 
    r.output && r.output.date === receipt.date && r.output.vendor_name === receipt.vendor_name
  );
  const filename = matchingResult?.input || '';
  const s3Url = gdrive_s3_map[filename] || '';
  const category = CATEGORY_MAP[receipt.category] || receipt.category;
  
  newRows.push([
    receipt.date,
    receipt.description || receipt.vendor_name,
    category,
    receipt.amount || 0,
    receipt.currency || 'JMD',
    receipt.vendor_name,
    s3Url,
    'Google Drive Receipt',
  ]);
}

if (newRows.length > 0) {
  // Check if headers exist; if not, add them
  if (existingRows.length === 0) {
    const headerRowData = [['Date', 'Description', 'Category', 'Amount', 'Currency', 'Vendor', 'Source Doc URL', 'Source']];
    await sheetsAppend(token, '2025 Expenses!A1', headerRowData);
  }
  
  const result = await sheetsAppend(token, '2025 Expenses!A:H', newRows);
  console.log(`  Appended ${newRows.length} rows to 2025 Expenses sheet`);
  console.log('  Result:', JSON.stringify(result).slice(0, 100));
} else {
  console.log('  No 2025 rows to append');
}

await db.end();

console.log('\n=== COMPLETE ===');
console.log(`Vendor evidence DB inserts: ${inserted}`);
console.log(`GDrive receipts uploaded: ${gdrive_uploaded}, inserted: ${gdrive_inserted}`);
console.log(`2025 Expenses rows added: ${newRows.length}`);
