/**
 * Fix Booking.com income entries:
 * 1. Remove the incorrect Booking.com rows from 2025 and 2026 Income tabs
 *    (these were commission fees / unconfirmed payment notifications, not actual payouts)
 * 2. Update the Dashboard Platform Income Summary with corrected totals
 * 3. Add a note that Booking.com income was collected via Stripe but
 *    no Stripe payout emails were found in connected accounts
 */
import { createSign } from 'crypto';

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

async function getSheetValues(sheetName, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!${range}`)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  return d.values || [];
}

async function updateRange(sheetName, range, values) {
  const fullRange = `'${sheetName}'!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: fullRange, majorDimension: 'ROWS', values }),
  });
  return r.json();
}

async function clearRange(sheetName, range) {
  const fullRange = `'${sheetName}'!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(fullRange)}:clear`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

// ---- Process each income sheet ----
for (const year of ['2025', '2026']) {
  const sheetName = `${year} Income`;
  console.log(`\nProcessing ${sheetName}...`);
  
  const rows = await getSheetValues(sheetName, 'A1:H300');
  
  // Find the VRBO & Booking.com section header
  let vrboHeaderRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(c => c?.toString().includes('VRBO'))) {
      vrboHeaderRow = i; // 0-indexed
      break;
    }
  }
  
  if (vrboHeaderRow < 0) {
    console.log(`  No VRBO section found in ${sheetName}`);
    continue;
  }
  
  console.log(`  VRBO section header at row ${vrboHeaderRow + 1}`);
  
  // Find all rows in the VRBO section and identify Booking.com rows
  const bookingRowIndices = [];
  for (let i = vrboHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => c?.toString().trim())) break; // empty row = end of section
    if (row[2]?.toString().includes('Booking.com')) {
      bookingRowIndices.push(i);
      console.log(`  Booking.com row at ${i+1}: ${JSON.stringify(row).slice(0,100)}`);
    }
  }
  
  if (bookingRowIndices.length === 0) {
    console.log(`  No Booking.com rows found in ${sheetName}`);
    continue;
  }
  
  // Replace Booking.com rows with a placeholder note
  for (const rowIdx of bookingRowIndices) {
    const sheetRow = rowIdx + 1; // 1-indexed
    const result = await updateRange(sheetName, `A${sheetRow}:H${sheetRow}`, [
      ['', '', 'Booking.com', 'NOTE: Booking.com income collected via Stripe — no Stripe payout emails found in connected accounts. Verify via Stripe dashboard.', 0, 0, '', ''],
    ]);
    console.log(`  Updated row ${sheetRow}: ${result.updatedCells} cells`);
  }
  
  // Also update the subtotal rows to reflect $0 for Booking.com
  // Find the subtotal rows
  for (let i = vrboHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const combined = row.join(' ').toLowerCase();
    if (combined.includes('booking.com subtotal') || combined.includes('booking.com total')) {
      const sheetRow = i + 1;
      const result = await updateRange(sheetName, `A${sheetRow}:H${sheetRow}`, [
        ['', '', '', 'Booking.com Subtotal (unverified — check Stripe dashboard)', 0, 0, '', ''],
      ]);
      console.log(`  Updated Booking.com subtotal at row ${sheetRow}`);
    }
  }
}

// ---- Update Dashboard Platform Income Summary ----
console.log('\nUpdating Dashboard Platform Income Summary...');

const dashRows = await getSheetValues('Dashboard', 'A140:G175');
let summaryStartRow = -1;
for (let i = 0; i < dashRows.length; i++) {
  if (dashRows[i] && dashRows[i].some(c => c?.toString().includes("INCOME SUMMARY BY PLATFORM"))) {
    summaryStartRow = 140 + i;
    break;
  }
}

if (summaryStartRow < 0) {
  console.log('Could not find income summary section in Dashboard');
} else {
  console.log(`Found income summary at row ${summaryStartRow}`);
  
  // Corrected totals (Booking.com removed)
  const correctedSummary = [
    ["ARTISTE'S BOUTIQUE — INCOME SUMMARY BY PLATFORM", '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['Year', 'Platform', 'Payouts', 'Total (USD)', 'Total (JMD)', 'Exchange Rate', 'Notes'],
    // 2024
    ['2024', 'Airbnb', 79, 57474.64, 8994782, 156, ''],
    ['2024', 'VRBO', 19, 10884.98, 1698057, 156, ''],
    ['2024', 'Booking.com', 0, 0, 0, 156, 'No confirmed payouts — verify via Stripe dashboard'],
    ['2024 TOTAL', '', 98, 68359.62, 10692839, '', ''],
    ['', '', '', '', '', '', ''],
    // 2025
    ['2025', 'Airbnb', 41, 21908.12, 3461483, 158, ''],
    ['2025', 'VRBO', 7, 3417.10, 539902, 158, ''],
    ['2025', 'Booking.com', 0, 0, 0, 158, 'Stripe payouts not found in email — verify via Stripe dashboard'],
    ['2025 TOTAL', '', 48, 25325.22, 4001385, '', ''],
    ['', '', '', '', '', '', ''],
    // 2026 (Jan-Jun)
    ['2026 (Jan-Jun)', 'Airbnb', 7, 7426.29, 1188206, 160, ''],
    ['2026 (Jan-Jun)', 'VRBO', 12, 8351.22, 1336195, 160, ''],
    ['2026 (Jan-Jun)', 'Booking.com', 0, 0, 0, 160, 'Stripe payouts not found in email — verify via Stripe dashboard'],
    ['2026 TOTAL (Jan-Jun)', '', 19, 15777.51, 2524401, '', ''],
    ['', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['NOTE: Booking.com income was collected via Stripe per host. No Stripe payout emails were found', '', '', '', '', '', ''],
    ['in any connected Gmail account. Please export your Stripe dashboard CSV and share for full reconciliation.', '', '', '', '', '', ''],
  ];
  
  const range = `Dashboard!A${summaryStartRow}:G${summaryStartRow + correctedSummary.length - 1}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: correctedSummary }),
  });
  const result = await r.json();
  console.log(`Dashboard summary updated: ${result.updatedCells} cells`);
}

console.log('\n=== CORRECTED INCOME TOTALS ===');
console.log('2024: Airbnb $57,474.64 + VRBO $10,884.98 = $68,359.62 USD (JMD 10,692,839)');
console.log('      Booking.com: UNVERIFIED — check Stripe dashboard');
console.log('2025: Airbnb $21,908.12 + VRBO $3,417.10 = $25,325.22 USD (JMD 4,001,385)');
console.log('      Booking.com: UNVERIFIED — check Stripe dashboard');
console.log('2026: Airbnb $7,426.29 + VRBO $8,351.22 = $15,777.51 USD (JMD 2,524,401)');
console.log('      Booking.com: UNVERIFIED — check Stripe dashboard');
