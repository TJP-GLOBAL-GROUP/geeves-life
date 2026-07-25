/**
 * Upload vendor evidence documents to S3 and insert into financial_documents table.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';

const MANIFEST_PATH = '/home/ubuntu/upload/vendor_evidence_manifest.json';
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

// Get Artiste's Boutique property ID
const db = await mysql.createConnection(DATABASE_URL);
const VERTICAL = 'artistes_boutique';

// Load manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
console.log(`Processing ${manifest.length} documents...`);

// Check which are already uploaded
const [existingDocs] = await db.execute(
  "SELECT s3Url FROM financial_documents WHERE vertical = ? AND documentType IN ('expense', 'vendor_bill', 'vendor_receipt')",
  [VERTICAL]
);
const existingUrls = new Set(existingDocs.map(d => d.s3Url).filter(Boolean));
console.log(`Already have ${existingUrls.size} expense docs in DB`);

let uploaded = 0;
let inserted = 0;
let skipped = 0;
const updatedManifest = [];

for (const doc of manifest) {
  const localFile = doc.local_file;
  
  if (!existsSync(localFile)) {
    console.log(`  SKIP (not found): ${path.basename(localFile)}`);
    updatedManifest.push(doc);
    skipped++;
    continue;
  }
  
  // Upload to S3 via Forge API
  let s3Url = doc.s3_url;
  
  if (!s3Url) {
    try {
      const fileBuffer = readFileSync(localFile);
      const ext = path.extname(localFile).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : 
                          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                          'application/octet-stream';
      
      const vendorSlug = doc.vendor.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileKey = `artiste-boutique/vendor-evidence/${doc.year}/${vendorSlug}/${doc.doc_type}_${doc.date}_${path.basename(localFile).replace(/[^a-z0-9._-]/gi, '_')}`;
      
      const resp = await fetch(`${FORGE_URL}/storage/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FORGE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: fileKey,
          content: fileBuffer.toString('base64'),
          contentType,
          encoding: 'base64',
        }),
      });
      
      if (resp.ok) {
        const data = await resp.json();
        s3Url = data.url || data.publicUrl || data.fileUrl || '';
        if (s3Url) {
          uploaded++;
          process.stdout.write(`  ✓ Uploaded: ${path.basename(localFile)}\n`);
        }
      } else {
        const errText = await resp.text();
        console.log(`  ✗ Upload failed (${resp.status}): ${errText.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ✗ Upload error: ${e.message}`);
    }
  }
  
  // Insert into financial_documents if we have a URL
  if (s3Url && !existingUrls.has(s3Url)) {
    try {
      const docDate = new Date(doc.date).getTime();
      const docType = doc.doc_type === 'bill' ? 'vendor_bill' : 'vendor_receipt';
      
      await db.execute(`
        INSERT INTO financial_documents 
        (vertical, documentType, documentDate, description, s3Url, originalFilename, statementYear, currency, taxYear, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE updatedAt = NOW()
      `, [
        VERTICAL,
        docType,
        docDate,
        `${doc.vendor} - ${doc.doc_type} - ${doc.date} - ${doc.category}`,
        s3Url,
        path.basename(doc.local_file),
        doc.year,
        doc.currency || 'JMD',
        doc.year,
      ]);
      inserted++;
      existingUrls.add(s3Url);
    } catch (e) {
      console.log(`  ✗ DB insert error: ${e.message.slice(0, 150)}`);
    }
  } else if (s3Url) {
    skipped++;
  }
  
  updatedManifest.push({ ...doc, s3_url: s3Url });
}

await db.end();

// Save updated manifest
writeFileSync(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));

console.log(`\n=== UPLOAD SUMMARY ===`);
console.log(`Uploaded to S3: ${uploaded}`);
console.log(`Inserted to DB: ${inserted}`);
console.log(`Skipped: ${skipped}`);
console.log(`Total processed: ${manifest.length}`);
