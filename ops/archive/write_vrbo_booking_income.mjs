/**
 * Upload VRBO and Booking.com income evidence to S3,
 * insert into financial_documents, and write to Income spreadsheet tabs.
 * 
 * VRBO: Uses "Deposit statement" emails as actual payout records.
 * Booking.com: Uses direct payment emails (Diamond Martin, Dajana Jurczak, etc.)
 */
import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

// Parse DATABASE_URL
function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error('Bad DB URL');
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5].split('?')[0] };
}

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

async function uploadToS3(filePath, fileKey) {
  try {
    const fileData = readFileSync(filePath);
    const resp = await fetch(`${FORGE_API_URL}/storage/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FORGE_API_KEY}`, 'Content-Type': 'application/octet-stream', 'X-File-Key': fileKey },
      body: fileData,
    });
    if (!resp.ok) {
      // Fallback: use manus-upload-file
      const out = execSync(`manus-upload-file --webdev "${filePath}" 2>&1`).toString();
      const m = out.match(/Storage Path:\s*(\/[^\s]+)/);
      return m ? `https://storage.manus.im${m[1]}` : null;
    }
    const data = await resp.json();
    return data.url || data.publicUrl || null;
  } catch (e) {
    try {
      const out = execSync(`manus-upload-file --webdev "${filePath}" 2>&1`).toString();
      const m = out.match(/https?:\/\/[^\s]+/);
      return m ? m[0] : null;
    } catch {
      return null;
    }
  }
}

// Load all results
const results = JSON.parse(readFileSync('/home/ubuntu/upload/vrbo_booking_results.json', 'utf8'));

// ---- VRBO: Extract actual deposit statement payouts ----
const vrboPayouts = results.filter(r => 
  r.platform === 'VRBO' && 
  r.amount_usd > 0 &&
  (r.subject?.toLowerCase().includes('deposit statement') || r.subject?.toLowerCase().includes('direct debit statement'))
);

// ---- Booking.com: Extract direct guest payments to Artiste's Boutique ----
// Filter for actual income emails (not spam/marketing/personal bookings)
const bookingIncomeKeywords = [
  'paid for your invoice',
  'guest agreement',
  'credit card authorization',
  'payment in progress',
  'artiste',
  'diamond martin',
  'dajana jurczak',
];
const bookingPayouts = results.filter(r => {
  if (r.platform !== 'Booking.com') return false;
  if (r.amount_usd <= 0) return false;
  const combined = (r.subject + ' ' + r.body_preview).toLowerCase();
  // Exclude personal bookings (Tarik booking as a guest)
  if (combined.includes('your booking') && !combined.includes('artiste')) return false;
  if (combined.includes('montego bay') || combined.includes('diamond villas') || combined.includes('breezy cove')) return false;
  if (combined.includes('venmo') || combined.includes('flight')) return false;
  return bookingIncomeKeywords.some(kw => combined.includes(kw));
});

console.log(`VRBO deposit payouts: ${vrboPayouts.length}`);
console.log(`Booking.com income: ${bookingPayouts.length}`);

// Show VRBO by year
const vrboByYear = {};
for (const r of vrboPayouts) {
  const y = r.date?.slice(0,4) || 'unknown';
  if (!vrboByYear[y]) vrboByYear[y] = { count: 0, total: 0, records: [] };
  vrboByYear[y].count++;
  vrboByYear[y].total += r.amount_usd;
  vrboByYear[y].records.push(r);
}
console.log('\nVRBO by year:');
for (const [y, d] of Object.entries(vrboByYear).sort()) {
  console.log(`  ${y}: ${d.count} payouts, $${d.total.toFixed(2)}`);
}

console.log('\nBooking.com income:');
for (const r of bookingPayouts) {
  console.log(`  ${r.date} | $${r.amount_usd} | ${r.subject?.slice(0,60)}`);
}

// ---- Upload PDFs to S3 ----
const db = await mysql.createConnection({ ...parseDbUrl(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } });
console.log('\nConnected to DB');

// Get Artiste's Boutique vertical ID
const [propRows] = await db.query("SELECT id, name FROM properties WHERE name LIKE '%Artiste%' OR name LIKE '%Dillsbury%' LIMIT 1");
const propertyId = propRows[0]?.id;
const vertical = 'artistes_boutique';
console.log(`Property: ${propRows[0]?.name} (${propertyId}), vertical: ${vertical}`);

let uploadedCount = 0;
const allIncomeRecords = [];

// Process VRBO payouts
for (const r of vrboPayouts) {
  const pdfFile = r.pdf_file;
  let s3Url = null;
  
  if (pdfFile && existsSync(pdfFile)) {
    const fileKey = `artistes-boutique/vrbo-income/${r.date}_${r.msg_id?.slice(0,8)}.pdf`;
    s3Url = await uploadToS3(pdfFile, fileKey);
    if (s3Url) uploadedCount++;
  }
  
  // Insert into financial_documents
  if (s3Url) {
    try {
      await db.query(
        `INSERT INTO financial_documents (vertical, documentType, title, fileUrl, fileKey, uploadedAt, metadata)
         VALUES (?, 'receipt', ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE fileUrl = VALUES(fileUrl)`,
        [
          vertical,
          `VRBO Payout - ${r.date}`,
          s3Url,
          s3Url,
          JSON.stringify({ platform: 'VRBO', date: r.date, amount_usd: r.amount_usd, subject: r.subject }),
        ]
      );
    } catch (e) {
      console.log(`  DB insert error: ${e.message}`);
    }
  }
  
  allIncomeRecords.push({
    platform: 'VRBO',
    date: r.date,
    year: r.date?.slice(0,4),
    month: r.date?.slice(5,7),
    amount_usd: r.amount_usd,
    amount_jmd: Math.round(r.amount_usd * 158), // approximate JMD rate
    description: r.subject?.slice(0,80),
    s3_url: s3Url,
    type: 'payout',
  });
}

// Process Booking.com income
for (const r of bookingPayouts) {
  const pdfFile = r.pdf_file;
  let s3Url = null;
  
  if (pdfFile && existsSync(pdfFile)) {
    const fileKey = `artistes-boutique/booking-income/${r.date}_${r.msg_id?.slice(0,8)}.pdf`;
    s3Url = await uploadToS3(pdfFile, fileKey);
    if (s3Url) uploadedCount++;
  }
  
  if (s3Url) {
    try {
      await db.query(
        `INSERT INTO financial_documents (vertical, documentType, title, fileUrl, fileKey, uploadedAt, metadata)
         VALUES (?, 'receipt', ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE fileUrl = VALUES(fileUrl)`,
        [
          vertical,
          `Booking.com Payment - ${r.date}`,
          s3Url,
          s3Url,
          JSON.stringify({ platform: 'Booking.com', date: r.date, amount_usd: r.amount_usd, subject: r.subject }),
        ]
      );
    } catch (e) {
      console.log(`  DB insert error: ${e.message}`);
    }
  }
  
  allIncomeRecords.push({
    platform: 'Booking.com',
    date: r.date,
    year: r.date?.slice(0,4),
    month: r.date?.slice(5,7),
    amount_usd: r.amount_usd,
    amount_jmd: Math.round(r.amount_usd * 158),
    description: r.subject?.slice(0,80),
    s3_url: s3Url,
    type: 'payment',
  });
}

await db.end();
console.log(`\nUploaded ${uploadedCount} files to S3`);
console.log(`Total income records: ${allIncomeRecords.length}`);

// ---- Write to Google Sheets ----
const sheetToken = await getToken();

// Get existing Income sheets
const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`;
const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${sheetToken}` } });
const metaMeta = await metaResp.json();
const sheetNames = (metaMeta.sheets || []).map(s => s.properties.title);
console.log('\nExisting sheets:', sheetNames.join(', '));

// Group records by year
const byYear = {};
for (const r of allIncomeRecords) {
  if (!byYear[r.year]) byYear[r.year] = [];
  byYear[r.year].push(r);
}

// For each year, find or create the income sheet and append VRBO/Booking rows
for (const [year, records] of Object.entries(byYear).sort()) {
  const sheetName = `${year} Income`;
  console.log(`\nProcessing ${sheetName}: ${records.length} records`);
  
  if (!sheetNames.includes(sheetName)) {
    console.log(`  Sheet "${sheetName}" not found, skipping`);
    continue;
  }
  
  // Get existing data to find the last row and check for existing VRBO/Booking rows
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!A1:H200`)}`;
  const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${sheetToken}` } });
  const getData = await getResp.json();
  const rows = getData.values || [];
  
  // Check if VRBO/Booking rows already exist
  const existingPlatforms = new Set(rows.map(r => r[1]).filter(Boolean));
  console.log(`  Existing platforms in sheet: ${[...existingPlatforms].join(', ')}`);
  
  // Find last row with data
  let lastRow = rows.length;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i] && rows[i].some(c => c && c.toString().trim())) {
      lastRow = i + 1;
      break;
    }
  }
  
  // Check if we need to add a header separator
  const startRow = lastRow + 2;
  
  // Build rows to append
  const newRows = [
    [`--- ${year} VRBO & Booking.com Income ---`, '', '', '', '', '', '', ''],
    ['Date', 'Platform', 'Type', 'Description', 'Amount (USD)', 'Amount (JMD est.)', 'Exchange Rate', 'Source Doc'],
  ];
  
  let vrboTotal = 0, bookingTotal = 0;
  for (const r of records.sort((a,b) => a.date?.localeCompare(b.date))) {
    newRows.push([
      r.date,
      r.platform,
      r.type,
      r.description,
      r.amount_usd,
      r.amount_jmd,
      158,
      r.s3_url || '',
    ]);
    if (r.platform === 'VRBO') vrboTotal += r.amount_usd;
    else bookingTotal += r.amount_usd;
  }
  
  newRows.push(['', '', '', 'VRBO Total', vrboTotal.toFixed(2), Math.round(vrboTotal * 158), '', '']);
  newRows.push(['', '', '', 'Booking.com Total', bookingTotal.toFixed(2), Math.round(bookingTotal * 158), '', '']);
  newRows.push(['', '', '', 'COMBINED TOTAL', (vrboTotal + bookingTotal).toFixed(2), Math.round((vrboTotal + bookingTotal) * 158), '', '']);
  
  console.log(`  Appending ${newRows.length} rows starting at row ${startRow}`);
  console.log(`  VRBO: $${vrboTotal.toFixed(2)}, Booking.com: $${bookingTotal.toFixed(2)}`);
  
  const range = `'${sheetName}'!A${startRow}:H${startRow + newRows.length - 1}`;
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const updateResp = await fetch(updateUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${sheetToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: newRows }),
  });
  const updateResult = await updateResp.json();
  console.log(`  Updated: ${updateResult.updatedRange || JSON.stringify(updateResult).slice(0,100)}`);
}

// ---- Update Dashboard VRBO column ----
// The Dashboard has columns for income by platform
// Check what income columns exist in the Dashboard
const dashUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('Dashboard!A1:Z30')}`;
const dashResp = await fetch(dashUrl, { headers: { Authorization: `Bearer ${sheetToken}` } });
const dashData = await dashResp.json();
const dashRows = dashData.values || [];

console.log('\nDashboard income section (rows 1-30):');
for (let i = 0; i < dashRows.length; i++) {
  const row = dashRows[i];
  if (row && row.some(c => c && c.toString().trim())) {
    console.log(`  Row ${i+1}: ${JSON.stringify(row).slice(0,120)}`);
  }
}

// Final summary
console.log('\n=== FINAL SUMMARY ===');
for (const [year, records] of Object.entries(byYear).sort()) {
  const vrbo = records.filter(r => r.platform === 'VRBO');
  const booking = records.filter(r => r.platform === 'Booking.com');
  const vrboTotal = vrbo.reduce((s,r) => s + r.amount_usd, 0);
  const bookingTotal = booking.reduce((s,r) => s + r.amount_usd, 0);
  console.log(`\n${year}:`);
  console.log(`  VRBO:         ${vrbo.length} payouts, $${vrboTotal.toFixed(2)} USD`);
  console.log(`  Booking.com:  ${booking.length} payments, $${bookingTotal.toFixed(2)} USD`);
  console.log(`  COMBINED:     $${(vrboTotal + bookingTotal).toFixed(2)} USD`);
}
