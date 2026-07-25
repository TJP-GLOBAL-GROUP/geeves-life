/**
 * Upload 2025 Artiste's Boutique expense documents to S3
 * Uses the Forge API (same approach as upload_expense_docs.mjs)
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DOCS_DIR = '/home/ubuntu/upload/expenses_2025';
const OUTPUT_FILE = '/home/ubuntu/upload/s3_urls_2025.json';

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
  const resp = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload failed ${resp.status}: ${text.slice(0, 200)}`);
  }
  const result = await resp.json();
  return { key, url: result.url };
}

const files = readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'));
console.log(`Found ${files.length} PDF files to upload`);

const urlMap = {};
let uploaded = 0;
let errors = 0;

for (const filename of files) {
  const filePath = join(DOCS_DIR, filename);
  try {
    const data = readFileSync(filePath);
    const key = `artistes-boutique/2025/${filename}`;
    const { url } = await storagePut(key, data, 'application/pdf');
    urlMap[filePath] = url;
    uploaded++;
    if (uploaded % 20 === 0) {
      console.log(`  Uploaded ${uploaded}/${files.length}...`);
    }
  } catch (err) {
    console.error(`  Error uploading ${filename}: ${err.message}`);
    errors++;
  }
}

writeFileSync(OUTPUT_FILE, JSON.stringify(urlMap, null, 2));
console.log(`\nDone! Uploaded: ${uploaded}, Errors: ${errors}`);
console.log(`URL map saved to ${OUTPUT_FILE}`);
