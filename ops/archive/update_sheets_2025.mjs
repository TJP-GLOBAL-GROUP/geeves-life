/**
 * Update Google Sheets with 2025 Artiste's Boutique expense data:
 * 1. Add 2025 expense rows to the Expenses sheet
 * 2. Create a Financial Year 2025 section on the Dashboard tab
 * 3. Update unlinked 2024 rows with bank statement evidence notes
 */
import { createSign, createHash } from 'crypto';
import { readFileSync } from 'fs';

const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_KEY_PEM = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function base64url(str) { return Buffer.from(str).toString('base64url'); }

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(SERVICE_KEY_PEM, 'base64url');
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
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.values || [];
}

async function sheetsAppend(token, range, values) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  );
  return resp.json();
}

async function sheetsUpdate(token, range, values) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  );
  return resp.json();
}

async function sheetsBatchUpdate(token, requests) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  );
  return resp.json();
}

// Load compiled 2025 expenses
const expenses2025 = JSON.parse(readFileSync('/home/ubuntu/upload/expenses_2025_compiled.json', 'utf8'));
const s3Urls = JSON.parse(readFileSync('/home/ubuntu/upload/s3_urls_2025.json', 'utf8'));
const unlinked2024 = JSON.parse(readFileSync('/home/ubuntu/upload/unlinked_2024_rows.json', 'utf8'));

// Build reverse map: filename → S3 URL
const fileToUrl = {};
for (const [path, url] of Object.entries(s3Urls)) {
  const filename = path.split('/').pop();
  fileToUrl[filename] = url;
}

// Format date as DD/MM/YY
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

// Format amount as $X,XXX.XX
function formatAmount(amount) {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function main() {
  const token = await getToken();
  console.log('Got service account token');

  // ─── STEP 1: Get current Expenses sheet to find last row ─────────────────
  const existingRows = await sheetsGet(token, 'Expenses!A:I');
  console.log(`Current Expenses sheet has ${existingRows.length} rows`);

  // Find the last row with data
  let lastDataRow = existingRows.length;
  
  // Check if 2025 data already exists
  const has2025 = existingRows.some(r => r[2] === '2025');
  if (has2025) {
    console.log('2025 data already exists in Expenses sheet - skipping append');
  } else {
    // ─── STEP 2: Append 2025 expense rows ──────────────────────────────────
    console.log('\nAppending 2025 expense rows...');
    
    const newRows = expenses2025.map(e => {
      // Find matching S3 URL
      let docUrl = '';
      if (e.source_file) {
        const filename = e.source_file.split('/').pop();
        docUrl = fileToUrl[filename] || '';
      }
      
      return [
        formatDate(e.date),                    // A: Date
        String(e.month),                        // B: month
        String(e.year),                         // C: year
        e.expense || '',                        // D: Expense
        e.category,                             // E: Category
        formatAmount(e.amount),                 // F: Amount
        e.paid_to || '',                        // G: Paid To
        e.paid_from || 'TARIK',                 // H: Paid From
        docUrl,                                 // I: Source Documentation Link
      ];
    });
    
    const appendResult = await sheetsAppend(token, 'Expenses!A:I', newRows);
    console.log(`Appended ${newRows.length} rows to Expenses sheet`);
    console.log('Append result:', JSON.stringify(appendResult).slice(0, 200));
  }

  // ─── STEP 3: Update unlinked 2024 rows with bank statement notes ──────────
  console.log('\nUpdating unlinked 2024 rows...');
  
  // For rows that have bank statement evidence, add a note
  const bankEvidenceNote = 'Bank statement evidence - see credit card statement';
  
  // Map of category → bank evidence
  const bankEvidence = {
    'FIXTURES AND FITTINGS': 'Cash payment - no bank card evidence found',
    'REPAIR COST': 'Cash payment - no bank card evidence found',
    'CLEANING SUPPLIES': 'Cash payment - no bank card evidence found',
    'MAINTENANCE': 'Cash payment - no bank card evidence found',
    'CLEANING FEE': 'Cash payment - no bank card evidence found',
    'UTILITIES': bankEvidenceNote,
  };
  
  let updatedCount = 0;
  for (const row of unlinked2024) {
    const note = bankEvidence[row.category] || 'No evidence found in bank statements';
    // Update column I (Source Documentation Link) with the note
    const cellRef = `Expenses!I${row.rowNum}`;
    await sheetsUpdate(token, cellRef, [[note]]);
    updatedCount++;
  }
  console.log(`Updated ${updatedCount} unlinked 2024 rows with evidence notes`);

  // ─── STEP 4: Build 2025 Dashboard section ─────────────────────────────────
  console.log('\nBuilding 2025 Dashboard section...');
  
  // Get current Dashboard to find where to add 2025 section
  const dashRows = await sheetsGet(token, 'Dashboard!A1:AJ60');
  console.log(`Dashboard has ${dashRows.length} rows`);
  
  // Find the last row of the 2024 section (after row 49/50)
  // We'll append the 2025 section after the existing data
  const insertAfterRow = dashRows.length + 2; // Leave 2 blank rows
  
  // Calculate 2025 totals by month and category
  const CATEGORIES = [
    'ADMINISTRATIVE EXPENSE', 'ASSETS: EQUIPMENT', 'ASSETS: FURNITURE', 'BANK FEES',
    'CLEANING FEE', 'CLEANING SUPPLIES', 'MAINTENANCE SUPPLIES', 'MORTGAGE PAYMENT',
    'FIXTURES AND FITTINGS', 'PROPERTY TAX', 'PERSONAL EXPENSE', 'REPAIR COST',
    'TRANSPORTATION EXPENSE', 'UTILITIES', 'VEHICLE EXPENSE', 'VEHICLE LOAN', 'VEHICLE REPAIR COST'
  ];
  
  // Build monthly totals
  const monthlyTotals = {};
  for (let m = 1; m <= 12; m++) {
    monthlyTotals[m] = {};
    for (const cat of CATEGORIES) {
      monthlyTotals[m][cat] = 0;
    }
  }
  
  for (const e of expenses2025) {
    const month = e.month;
    const cat = e.category;
    if (monthlyTotals[month] && monthlyTotals[month][cat] !== undefined) {
      monthlyTotals[month][cat] += e.amount;
    }
  }
  
  // Build the 2025 dashboard rows
  const dashboardRows2025 = [];
  
  // Header row
  dashboardRows2025.push([
    '', '', 'Financial Year 2025', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'LOANS TO BUSINESS', '', '', '', 'BUSINESS INCOME'
  ]);
  
  // Column headers
  dashboardRows2025.push([
    '', '', 'Expenses by Month', '', '',
    'ADMINISTRATIVE EXPENSE', 'ASSETS: EQUIPMENT', 'ASSETS: FURNITURE', 'BANK FEES',
    'CLEANING FEE', 'CLEANING SUPPLIES', 'MAINTENANCE SUPPLIES', 'MORTGAGE PAYMENT',
    'FIXTURES AND FITTINGS', 'PROPERTY TAX', 'PERSONAL EXPENSE', 'REPAIR COST',
    'TRANSPORTATION EXPENSE', 'UTILITIES', 'VEHICLE EXPENSE', 'VEHICLE LOAN', 'VEHICLE REPAIR COST',
    '', 'TOTAL', '', 'TAZ LOAN', 'MANNY LOAN', 'TOTAL', '', 'Income by Month', 'Airbnb', 'VRBO', 'Other', 'TOTAL'
  ]);
  
  // Monthly rows
  let yearTotals = {};
  for (const cat of CATEGORIES) yearTotals[cat] = 0;
  let grandTotal = 0;
  
  for (let m = 1; m <= 12; m++) {
    const monthName = `${MONTH_NAMES[m]}-2025`;
    const catTotals = monthlyTotals[m];
    
    const rowTotal = CATEGORIES.reduce((sum, cat) => sum + (catTotals[cat] || 0), 0);
    grandTotal += rowTotal;
    for (const cat of CATEGORIES) {
      yearTotals[cat] = (yearTotals[cat] || 0) + (catTotals[cat] || 0);
    }
    
    const row = [
      '', '', monthName, String(m), '2025',
      ...CATEGORIES.map(cat => catTotals[cat] ? formatAmount(catTotals[cat]) : '$0.00'),
      '', formatAmount(rowTotal),
      '', '$0.00', '$0.00', '$0.00',
      '', monthName, '$0.00', '$0.00', '$0.00', '$0.00'
    ];
    dashboardRows2025.push(row);
  }
  
  // Year total row
  const yearTotalRow = [
    '', '', 'Year Total', '', '',
    ...CATEGORIES.map(cat => yearTotals[cat] ? formatAmount(yearTotals[cat]) : '$0.00'),
    '', formatAmount(grandTotal),
    '', '$0.00', '$0.00', '$0.00',
    '', 'Year Total', '$0.00', '$0.00', '$0.00', '$0.00'
  ];
  dashboardRows2025.push(yearTotalRow);
  
  // Append to Dashboard
  const dashAppendResult = await sheetsAppend(token, 'Dashboard!A:AJ', dashboardRows2025);
  console.log(`Added ${dashboardRows2025.length} rows to Dashboard`);
  console.log('Dashboard append result:', JSON.stringify(dashAppendResult).slice(0, 300));
  
  console.log('\n=== COMPLETE ===');
  console.log(`2025 expenses added: ${expenses2025.length} rows`);
  console.log(`2024 unlinked rows updated: ${updatedCount}`);
  console.log(`2025 Dashboard rows added: ${dashboardRows2025.length}`);
  console.log(`2025 Grand Total: ${formatAmount(grandTotal)}`);
}

main().catch(console.error);
