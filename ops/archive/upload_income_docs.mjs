/**
 * Upload all income evidence PDFs to S3 using the Forge storage API
 * Uses the same storagePut pattern as upload_expense_docs.mjs
 */
import fs from 'fs';
import path from 'path';

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const INCOME_DIR = '/home/ubuntu/upload/income_docs';
const OUT_FILE = '/home/ubuntu/upload/income_s3_urls.json';

function normalizeKey(k) { return k.replace(/^\/+/, ''); }
function ensureTrailingSlash(v) { return v.endsWith('/') ? v : `${v}/`; }

async function storagePut(relKey, filePath) {
  const key = normalizeKey(relKey);
  const baseUrl = FORGE_URL.replace(/\/+$/, '');
  const uploadUrl = new URL('v1/storage/upload', ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set('path', key);
  const fileBuffer = fs.readFileSync(filePath);
  const fname = path.basename(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, fname);
  const resp = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Upload failed (${resp.status}): ${msg}`);
  }
  const result = await resp.json();
  return result.url || '';
}

// Load existing results if any
let existing = {};
if (fs.existsSync(OUT_FILE)) {
  const arr = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  for (const r of arr) if (r.s3Url) existing[r.filename] = r.s3Url;
  console.log(`Loaded ${Object.keys(existing).length} existing uploads`);
}

const files = fs.readdirSync(INCOME_DIR).filter(f => f.endsWith('.pdf')).sort();
console.log(`Total income PDFs: ${files.length}`);

const results = [];
let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const fname of files) {
  if (existing[fname]) {
    results.push({ filename: fname, s3Url: existing[fname] });
    skipped++;
    continue;
  }

  const fpath = path.join(INCOME_DIR, fname);
  const s3Key = `artistes-boutique/income-docs/${fname}`;

  try {
    const url = await storagePut(s3Key, fpath);
    results.push({ filename: fname, s3Url: url });
    if (url) uploaded++;
    else failed++;
  } catch (e) {
    results.push({ filename: fname, s3Url: '' });
    failed++;
  }

  if ((uploaded + failed) % 25 === 0 && (uploaded + failed) > 0) {
    console.log(`  Uploaded: ${uploaded}, Failed: ${failed}, Skipped: ${skipped}`);
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nDone: ${uploaded} uploaded, ${failed} failed, ${skipped} already done`);
const sample = results.find(r => r.s3Url);
if (sample) console.log(`Sample URL: ${sample.s3Url}`);
