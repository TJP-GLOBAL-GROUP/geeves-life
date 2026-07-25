/**
 * Update VRBO/Booking.com income rows with correct JMD exchange rates
 * and add a platform income summary section to the Dashboard.
 * 
 * Historical JMD/USD rates:
 * 2024: ~156 JMD/USD (avg)
 * 2025: ~158 JMD/USD (avg)
 * 2026: ~160 JMD/USD (avg)
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
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt}) });
  const d = await r.json();
  if (!d.access_token) throw new Error(JSON.stringify(d));
  return d.access_token;
}

const token = await getToken();
console.log('Got Sheets token');

const RATES = { '2024': 156, '2025': 158, '2026': 160 };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Load the VRBO/Booking results
const results = JSON.parse(readFileSync('/home/ubuntu/upload/vrbo_booking_results.json', 'utf8'));

// Filter to actual payouts
const vrboPayouts = results.filter(r => 
  r.platform === 'VRBO' && r.amount_usd > 0 &&
  (r.subject?.toLowerCase().includes('deposit statement') || r.subject?.toLowerCase().includes('direct debit statement'))
);

const bookingIncomeKeywords = ['paid for your invoice', 'guest agreement', 'credit card authorization', 'payment in progress', 'artiste', 'diamond martin', 'dajana jurczak'];
const bookingPayouts = results.filter(r => {
  if (r.platform !== 'Booking.com' || r.amount_usd <= 0) return false;
  const combined = (r.subject + ' ' + r.body_preview).toLowerCase();
  if (combined.includes('montego bay') || combined.includes('diamond villas') || combined.includes('breezy cove')) return false;
  if (combined.includes('venmo') || combined.includes('flight') || combined.includes('your booking')) return false;
  return bookingIncomeKeywords.some(kw => combined.includes(kw));
});

// Deduplicate Booking.com (same email appeared in multiple accounts)
const bookingDeduped = [];
const seenBookingIds = new Set();
for (const r of bookingPayouts) {
  const key = `${r.date}_${r.amount_usd}_${r.subject?.slice(0,30)}`;
  if (!seenBookingIds.has(key)) {
    seenBookingIds.add(key);
    bookingDeduped.push(r);
  }
}

console.log(`VRBO payouts: ${vrboPayouts.length}`);
console.log(`Booking.com payouts (deduped): ${bookingDeduped.length}`);

// Group by year
const byYear = { '2024': { vrbo: [], booking: [] }, '2025': { vrbo: [], booking: [] }, '2026': { vrbo: [], booking: [] } };
for (const r of vrboPayouts) {
  const y = r.date?.slice(0,4);
  if (byYear[y]) byYear[y].vrbo.push(r);
}
for (const r of bookingDeduped) {
  const y = r.date?.slice(0,4);
  if (byYear[y]) byYear[y].booking.push(r);
}

// For each year, update the income sheet with correct JMD amounts
for (const [year, data] of Object.entries(byYear)) {
  const rate = RATES[year];
  const sheetName = `${year} Income`;
  
  // Get current sheet data to find where the VRBO section starts
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!A1:H200`)}`;
  const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
  const getData = await getResp.json();
  const rows = getData.values || [];
  
  // Find the VRBO section header row
  let vrboSectionStart = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0]?.toString().includes('VRBO & Booking.com')) {
      vrboSectionStart = i + 1; // 0-indexed
      break;
    }
  }
  
  if (vrboSectionStart < 0) {
    console.log(`  ${sheetName}: VRBO section not found, skipping`);
    continue;
  }
  
  console.log(`\n${sheetName}: VRBO section starts at row ${vrboSectionStart + 1}`);
  
  // Build updated rows for the VRBO section
  const allPlatformRecords = [
    ...data.vrbo.map(r => ({ ...r, platform: 'VRBO' })),
    ...data.booking.map(r => ({ ...r, platform: 'Booking.com' })),
  ].sort((a, b) => a.date?.localeCompare(b.date));
  
  const headerRow = vrboSectionStart + 1; // Row after the section header
  const dataStartRow = headerRow + 1; // Row after the column headers
  
  // Build the new rows
  const newRows = [
    ['Date', 'Month', 'Platform', 'Description', 'Amount (USD)', 'Amount (JMD)', 'Exchange Rate', 'Source Doc'],
  ];
  
  let vrboTotal = 0, bookingTotal = 0;
  for (const r of allPlatformRecords) {
    const month = r.date ? MONTHS[parseInt(r.date.slice(5,7)) - 1] : '';
    const amtJmd = Math.round(r.amount_usd * rate);
    newRows.push([
      r.date || '',
      month,
      r.platform,
      r.subject?.slice(0,80) || '',
      r.amount_usd,
      amtJmd,
      rate,
      r.pdf_file ? '' : '', // S3 URL would go here
    ]);
    if (r.platform === 'VRBO') vrboTotal += r.amount_usd;
    else bookingTotal += r.amount_usd;
  }
  
  const grandTotal = vrboTotal + bookingTotal;
  newRows.push(['', '', '', 'VRBO Subtotal', vrboTotal.toFixed(2), Math.round(vrboTotal * rate), rate, '']);
  newRows.push(['', '', '', 'Booking.com Subtotal', bookingTotal.toFixed(2), Math.round(bookingTotal * rate), rate, '']);
  newRows.push(['', '', '', `${year} VRBO + Booking.com TOTAL`, grandTotal.toFixed(2), Math.round(grandTotal * rate), rate, '']);
  
  // Write the updated rows
  const startRow = vrboSectionStart + 2; // 1-indexed
  const range = `'${sheetName}'!A${startRow}:H${startRow + newRows.length - 1}`;
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const updateResp = await fetch(updateUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: newRows }),
  });
  const result = await updateResp.json();
  console.log(`  Updated ${result.updatedCells} cells`);
  console.log(`  VRBO: $${vrboTotal.toFixed(2)} (JMD ${Math.round(vrboTotal*rate).toLocaleString()})`);
  console.log(`  Booking.com: $${bookingTotal.toFixed(2)} (JMD ${Math.round(bookingTotal*rate).toLocaleString()})`);
  console.log(`  TOTAL: $${grandTotal.toFixed(2)} (JMD ${Math.round(grandTotal*rate).toLocaleString()})`);
}

// ---- Add Platform Income Summary to Dashboard ----
// Find the last row of the Dashboard and add a clean summary table
const dashUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('Dashboard!A1:Z140')}`;
const dashResp = await fetch(dashUrl, { headers: { Authorization: `Bearer ${token}` } });
const dashData = await dashResp.json();
const dashRows = dashData.values || [];

let lastDashRow = 0;
for (let i = dashRows.length - 1; i >= 0; i--) {
  if (dashRows[i] && dashRows[i].some(c => c && c.toString().trim())) {
    lastDashRow = i + 1;
    break;
  }
}

const summaryStartRow = lastDashRow + 3;
console.log(`\nAdding income summary to Dashboard at row ${summaryStartRow}`);

// Build income summary table
const summaryRows = [
  ['ARTISTE\'S BOUTIQUE — INCOME SUMMARY BY PLATFORM', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Year', 'Platform', 'Payouts', 'Total (USD)', 'Total (JMD)', 'Exchange Rate', ''],
];

const summaryData = {
  '2024': {
    airbnb: { count: 79, usd: 57474.64, jmd: 8994782 },
    vrbo: { count: vrboPayouts.filter(r => r.date?.startsWith('2024')).length, usd: 10884.98, jmd: Math.round(10884.98 * 156) },
    booking: { count: 0, usd: 0, jmd: 0 },
  },
  '2025': {
    airbnb: { count: 41, usd: 21908.12, jmd: 3461483 },
    vrbo: { count: vrboPayouts.filter(r => r.date?.startsWith('2025')).length, usd: 3417.10, jmd: Math.round(3417.10 * 158) },
    booking: { count: bookingDeduped.filter(r => r.date?.startsWith('2025')).length, usd: bookingDeduped.filter(r => r.date?.startsWith('2025')).reduce((s,r) => s+r.amount_usd, 0), jmd: 0 },
  },
  '2026': {
    airbnb: { count: 7, usd: 7426.29, jmd: 1188206 },
    vrbo: { count: vrboPayouts.filter(r => r.date?.startsWith('2026')).length, usd: 8351.22, jmd: Math.round(8351.22 * 160) },
    booking: { count: bookingDeduped.filter(r => r.date?.startsWith('2026')).length, usd: bookingDeduped.filter(r => r.date?.startsWith('2026')).reduce((s,r) => s+r.amount_usd, 0), jmd: 0 },
  },
};

// Fix Booking.com JMD
for (const [year, d] of Object.entries(summaryData)) {
  const rate = RATES[year];
  d.booking.jmd = Math.round(d.booking.usd * rate);
}

for (const [year, d] of Object.entries(summaryData).sort()) {
  const rate = RATES[year];
  const totalUsd = d.airbnb.usd + d.vrbo.usd + d.booking.usd;
  const totalJmd = d.airbnb.jmd + d.vrbo.jmd + d.booking.jmd;
  
  summaryRows.push([year, 'Airbnb', d.airbnb.count, d.airbnb.usd.toFixed(2), d.airbnb.jmd, rate, '']);
  summaryRows.push([year, 'VRBO', d.vrbo.count, d.vrbo.usd.toFixed(2), d.vrbo.jmd, rate, '']);
  if (d.booking.usd > 0) {
    summaryRows.push([year, 'Booking.com (Direct)', d.booking.count, d.booking.usd.toFixed(2), d.booking.jmd, rate, '']);
  }
  summaryRows.push([`${year} TOTAL`, '', d.airbnb.count + d.vrbo.count + d.booking.count, totalUsd.toFixed(2), totalJmd, '', '']);
  summaryRows.push(['', '', '', '', '', '', '']);
}

const summaryRange = `Dashboard!A${summaryStartRow}:G${summaryStartRow + summaryRows.length - 1}`;
const summaryUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(summaryRange)}?valueInputOption=USER_ENTERED`;
const summaryResp = await fetch(summaryUpdateUrl, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ range: summaryRange, majorDimension: 'ROWS', values: summaryRows }),
});
const summaryResult = await summaryResp.json();
console.log(`Dashboard summary: ${summaryResult.updatedCells} cells updated at rows ${summaryStartRow}+`);

// Print final summary
console.log('\n=== COMPLETE INCOME SUMMARY ===');
for (const [year, d] of Object.entries(summaryData).sort()) {
  const rate = RATES[year];
  const totalUsd = d.airbnb.usd + d.vrbo.usd + d.booking.usd;
  const totalJmd = d.airbnb.jmd + d.vrbo.jmd + d.booking.jmd;
  console.log(`\n${year}:`);
  console.log(`  Airbnb:       ${d.airbnb.count} payouts  $${d.airbnb.usd.toLocaleString()} USD  JMD ${d.airbnb.jmd.toLocaleString()}`);
  console.log(`  VRBO:         ${d.vrbo.count} payouts  $${d.vrbo.usd.toLocaleString()} USD  JMD ${d.vrbo.jmd.toLocaleString()}`);
  if (d.booking.usd > 0) {
    console.log(`  Booking.com:  ${d.booking.count} payments $${d.booking.usd.toFixed(2)} USD  JMD ${d.booking.jmd.toLocaleString()}`);
  }
  console.log(`  ─────────────────────────────────────────────────`);
  console.log(`  TOTAL:        $${totalUsd.toLocaleString()} USD  JMD ${totalJmd.toLocaleString()}`);
}
