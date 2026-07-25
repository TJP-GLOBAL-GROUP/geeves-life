/**
 * Upload vendor evidence documents to S3 using the Forge storage API
 * and insert records into financial_documents table.
 */
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const MANIFEST_PATH = '/home/ubuntu/upload/vendor_evidence_manifest.json';

function normalizeKey(k) { return k.replace(/^\/+/, ''); }
function ensureTrailingSlash(v) { return v.endsWith('/') ? v : `${v}/`; }

async function storagePut(relKey, filePath) {
  const key = normalizeKey(relKey);
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
    throw new Error(`Upload failed (${resp.status}): ${msg.slice(0, 100)}`);
  }
  const result = await resp.json();
  return result.url || '';
}

// Connect to DB
const db = await mysql.createConnection(process.env.DATABASE_URL);
const VERTICAL = 'artistes_boutique';

// Check existing docs
const [existingDocs] = await db.execute(
  "SELECT s3Url FROM financial_documents WHERE vertical = ? AND documentType IN ('vendor_bill', 'vendor_receipt')",
  [VERTICAL]
);
const existingUrls = new Set(existingDocs.map(d => d.s3Url).filter(Boolean));
console.log(`Already have ${existingUrls.size} vendor docs in DB`);

// Load manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const pending = manifest.filter(e => !e.s3_url && fs.existsSync(e.local_file));
const done = manifest.filter(e => e.s3_url || !fs.existsSync(e.local_file));
console.log(`Processing: ${pending.length} to upload, ${done.length} already done`);

let uploaded = 0;
let inserted = 0;
let failed = 0;
const updatedManifest = [...done];

for (const entry of pending) {
  const localFile = entry.local_file;
  const fname = path.basename(localFile);
  const vendorSlug = entry.vendor.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileKey = `artiste-boutique/vendor-evidence/${entry.year}/${vendorSlug}/${entry.doc_type}_${entry.date}_${fname.replace(/[^a-z0-9._-]/gi, '_')}`;
  
  let s3Url = '';
  try {
    s3Url = await storagePut(fileKey, localFile);
    if (s3Url) {
      uploaded++;
      if (uploaded % 10 === 0) console.log(`  Uploaded ${uploaded}/${pending.length}...`);
    }
  } catch (e) {
    console.log(`  ✗ Upload failed for ${fname}: ${e.message}`);
    failed++;
    updatedManifest.push(entry);
    continue;
  }
  
  // Insert into DB
  if (s3Url && !existingUrls.has(s3Url)) {
    // Map to valid enum: bill->invoice, payment_receipt->receipt, email->email_evidence
    const docType = entry.doc_type === 'bill' ? 'invoice' : 
                    entry.doc_type === 'payment_receipt' ? 'receipt' : 'other';
    const docDate = new Date(entry.date).getTime();
    
    try {
      await db.execute(`
        INSERT INTO financial_documents 
        (vertical, documentType, documentDate, description, s3Url, originalFilename, 
         statementYear, currency, taxYear, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        VERTICAL, docType, docDate,
        `${entry.vendor} - ${entry.doc_type} - ${entry.date} - ${entry.category}`,
        s3Url, fname, entry.year, entry.currency || 'JMD', entry.year,
      ]);
      inserted++;
      existingUrls.add(s3Url);
    } catch (e) {
      console.log(`  ✗ DB error for ${fname}: ${e.message.slice(0, 100)}`);
    }
  }
  
  updatedManifest.push({ ...entry, s3_url: s3Url });
}

await db.end();

// Save updated manifest
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));

console.log(`\n=== VENDOR EVIDENCE UPLOAD SUMMARY ===`);
console.log(`Uploaded to S3: ${uploaded}`);
console.log(`Inserted to DB: ${inserted}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${manifest.length}`);

// Summary by vendor
const vendorCounts = {};
for (const e of updatedManifest) {
  if (e.s3_url) vendorCounts[e.vendor] = (vendorCounts[e.vendor] || 0) + 1;
}
console.log('\nDocs with S3 URLs by vendor:');
for (const [v, c] of Object.entries(vendorCounts).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${v}: ${c}`);
}
