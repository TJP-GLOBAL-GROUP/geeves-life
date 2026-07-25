/**
 * Upload all expense evidence documents to S3
 * Uses the project's storagePut helper
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const DOCS_DIR = '/home/ubuntu/upload/expense_docs';
const OUTPUT_FILE = '/home/ubuntu/upload/s3_upload_results.json';

function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, '');
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

async function storagePut(relKey, data, contentType = 'application/pdf') {
  const key = normalizeKey(relKey);
  const baseUrl = FORGE_URL.replace(/\/+$/, '');
  const uploadUrl = new URL('v1/storage/upload', ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set('path', key);
  
  const blob = new Blob([data], { type: contentType });
  const form = new FormData();
  form.append('file', blob, key.split('/').pop() ?? key);
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_KEY}` },
    body: form,
  });
  
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Upload failed (${response.status}): ${message}`);
  }
  
  const result = await response.json();
  return { key, url: result.url };
}

// Get all files from expense_docs directory
const categories = readdirSync(DOCS_DIR).filter(f => {
  const stat = statSync(join(DOCS_DIR, f));
  return stat.isDirectory();
});

console.log(`Found ${categories.length} categories`);

const results = {};
let totalUploaded = 0;
let totalFailed = 0;

for (const category of categories) {
  const catDir = join(DOCS_DIR, category);
  const files = readdirSync(catDir).filter(f => f.endsWith('.pdf'));
  
  console.log(`\n[${category}] ${files.length} files`);
  results[category] = [];
  
  for (const filename of files) {
    const filePath = join(catDir, filename);
    const s3Key = `household/${HOUSEHOLD_ID}/documents/artistes-boutique/2024/${category}/${filename}`;
    
    try {
      const data = readFileSync(filePath);
      const { key, url } = await storagePut(s3Key, data, 'application/pdf');
      
      results[category].push({
        filename,
        localPath: filePath,
        s3Key: key,
        s3Url: url,
        size: data.length,
      });
      
      totalUploaded++;
      process.stdout.write('.');
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`\n  ERROR uploading ${filename}: ${err.message}`);
      results[category].push({
        filename,
        localPath: filePath,
        s3Key: null,
        s3Url: null,
        error: err.message,
      });
      totalFailed++;
    }
  }
  
  console.log(`\n  Done: ${results[category].filter(r => r.s3Url).length} uploaded`);
}

// Save results
writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

console.log(`\n\n=== SUMMARY ===`);
console.log(`Total uploaded: ${totalUploaded}`);
console.log(`Total failed: ${totalFailed}`);
console.log(`Results saved to: ${OUTPUT_FILE}`);
