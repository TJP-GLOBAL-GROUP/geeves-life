/**
 * Write Financial Year sections to the Dashboard tab for 2025 and 2026.
 * Mirrors the exact column layout of the 2024 section (rows 46-65).
 *
 * Column mapping (0-indexed):
 *  C(2)  = "Expenses by Month" / month label
 *  D(3)  = month number
 *  E(4)  = year
 *  F(5)  = ADMINISTRATIVE EXPENSE
 *  G(6)  = ASSETS: EQUIPMENT
 *  H(7)  = ASSETS: FURNITURE
 *  I(8)  = BANK FEES
 *  J(9)  = CLEANING FEE
 *  K(10) = CLEANING SUPPLIES
 *  L(11) = MAINTENANCE SUPPLIES
 *  M(12) = MORTGAGE PAYMENT
 *  N(13) = FIXTURES AND FITTINGS
 *  O(14) = PROPERTY TAX
 *  P(15) = PERSONAL EXPENSE
 *  Q(16) = REPAIR COST
 *  R(17) = TRANSPORTATION EXPENSE
 *  S(18) = UTILITIES
 *  T(19) = VEHICLE EXPENSE
 *  U(20) = VEHICLE LOAN
 *  V(21) = VEHICLE REPAIR COST
 *  W(22) = (blank)
 *  X(23) = TOTAL
 *  Y(24) = (blank)
 *  Z(25) = TAZ LOAN
 *  AA(26)= MANNY LOAN
 *  AB(27)= TOTAL (loans)
 *  AC(28)= (blank)
 *  AD(29)= Income by Month
 *  AE(30)= Airbnb
 *  AF(31)= VRBO
 *  AG(32)= Other
 *  AH(33)= TOTAL (income)
 */

import { createSign } from 'crypto';
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

async function sheetsUpdate(token, range, values) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  );
  const result = await resp.json();
  if (result.error) throw new Error(`Sheets error: ${JSON.stringify(result.error)}`);
  return result;
}

async function sheetsClear(token, range) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }
  );
  return resp.json();
}

const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORIES = [
  'ADMINISTRATIVE EXPENSE', 'ASSETS: EQUIPMENT', 'ASSETS: FURNITURE', 'BANK FEES',
  'CLEANING FEE', 'CLEANING SUPPLIES', 'MAINTENANCE SUPPLIES', 'MORTGAGE PAYMENT',
  'FIXTURES AND FITTINGS', 'PROPERTY TAX', 'PERSONAL EXPENSE', 'REPAIR COST',
  'TRANSPORTATION EXPENSE', 'UTILITIES', 'VEHICLE EXPENSE', 'VEHICLE LOAN', 'VEHICLE REPAIR COST'
];

function fmt(amount) {
  if (!amount || amount === 0) return '$0.00';
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build the 20-row block for a given year.
 * Returns array of arrays, each padded to 34 columns (A-AH).
 * startRow is the 1-based row number where the block begins.
 *
 * Block structure (same as 2024):
 *  Row 0: "Financial Year YYYY" in col C (index 2)
 *  Row 1: Column headers in cols C-AH
 *  Rows 2-13: Monthly data (Jan-Dec)
 *  Row 14: Year Total
 *  Row 15: USD exchange rate row (blank for now)
 *  Row 16: blank
 *  Row 17: Grand Total / Total Assets row
 */
function buildYearBlock(year, expensesByMonth, incomeByMonth) {
  const PAD = 34; // columns A-AH

  function row(data) {
    const r = new Array(PAD).fill('');
    for (const [idx, val] of Object.entries(data)) {
      r[parseInt(idx)] = val;
    }
    return r;
  }

  const rows = [];

  // Row 0: Year header
  rows.push(row({ 2: `Financial Year ${year}`, 25: 'LOANS TO BUSINESS', 29: 'BUSINESS INCOME' }));

  // Row 1: Column headers
  rows.push(row({
    2: 'Expenses by Month',
    5: 'ADMINISTRATIVE EXPENSE',
    6: 'ASSETS: EQUIPMENT',
    7: 'ASSETS: FURNITURE',
    8: 'BANK FEES',
    9: 'CLEANING FEE',
    10: 'CLEANING SUPPLIES',
    11: 'MAINTENANCE SUPPLIES',
    12: 'MORTGAGE PAYMENT',
    13: 'FIXTURES AND FITTINGS',
    14: 'PROPERTY TAX',
    15: 'PERSONAL EXPENSE',
    16: 'REPAIR COST',
    17: 'TRANSPORTATION EXPENSE',
    18: 'UTILITIES',
    19: 'VEHICLE EXPENSE',
    20: 'VEHICLE LOAN',
    21: 'VEHICLE REPAIR COST',
    23: 'TOTAL',
    25: 'TAZ LOAN',
    26: 'MANNY LOAN',
    27: 'TOTAL',
    29: 'Income by Month',
    30: 'Airbnb',
    31: 'VRBO',
    32: 'Other',
    33: 'TOTAL',
  }));

  // Monthly rows
  let yearTotals = {};
  for (const cat of CATEGORIES) yearTotals[cat] = 0;
  let grandExpenseTotal = 0;
  let grandAirbnb = 0, grandVrbo = 0, grandOther = 0;

  for (let m = 1; m <= 12; m++) {
    const monthLabel = `${MONTH_NAMES[m]}-${year}`;
    const catAmounts = expensesByMonth[m] || {};
    const income = incomeByMonth[m] || { airbnb: 0, vrbo: 0, other: 0 };

    const rowTotal = CATEGORIES.reduce((s, c) => s + (catAmounts[c] || 0), 0);
    grandExpenseTotal += rowTotal;
    for (const cat of CATEGORIES) yearTotals[cat] += (catAmounts[cat] || 0);
    grandAirbnb += income.airbnb;
    grandVrbo += income.vrbo;
    grandOther += income.other;

    const incomeTotal = income.airbnb + income.vrbo + income.other;

    const dataRow = {
      2: monthLabel,
      3: String(m),
      4: String(year),
      23: fmt(rowTotal),
      25: '$0.00',
      26: '$0.00',
      27: '$0.00',
      29: monthLabel,
      30: fmt(income.airbnb),
      31: fmt(income.vrbo),
      32: fmt(income.other),
      33: fmt(incomeTotal),
    };
    for (let ci = 0; ci < CATEGORIES.length; ci++) {
      dataRow[5 + ci] = fmt(catAmounts[CATEGORIES[ci]] || 0);
    }
    rows.push(row(dataRow));
  }

  // Year Total row
  const totalRow = {
    2: 'Year Total',
    23: fmt(grandExpenseTotal),
    25: '$0.00',
    26: '$0.00',
    27: '$0.00',
    29: 'Year Total',
    30: fmt(grandAirbnb),
    31: fmt(grandVrbo),
    32: fmt(grandOther),
    33: fmt(grandAirbnb + grandVrbo + grandOther),
  };
  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    totalRow[5 + ci] = fmt(yearTotals[CATEGORIES[ci]] || 0);
  }
  rows.push(row(totalRow));

  // Blank row
  rows.push(new Array(PAD).fill(''));

  // Grand Total row
  rows.push(row({
    2: 'Grand Total',
    6: fmt(yearTotals['ASSETS: EQUIPMENT'] || 0),
    23: fmt(grandExpenseTotal),
    24: 'Total Loans',
    25: '$0.00',
    26: '$0.00',
    27: '$0.00',
  }));
  rows.push(row({ 2: 'Total Assets', 6: fmt(yearTotals['ASSETS: EQUIPMENT'] || 0) }));

  return rows;
}

// ─── Load data ───────────────────────────────────────────────────────────────

// 2025 expenses
const expenses2025 = JSON.parse(readFileSync('/home/ubuntu/upload/expenses_2025_compiled.json', 'utf8'));

function buildExpensesByMonth(expenses) {
  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = {};
  for (const e of expenses) {
    const m = e.month;
    const cat = e.category;
    if (!byMonth[m]) byMonth[m] = {};
    byMonth[m][cat] = (byMonth[m][cat] || 0) + e.amount;
  }
  return byMonth;
}

const expenses2025ByMonth = buildExpensesByMonth(expenses2025);

// Income placeholders (will be updated in Phase 6)
const emptyIncome = {};
for (let m = 1; m <= 12; m++) emptyIncome[m] = { airbnb: 0, vrbo: 0, other: 0 };

async function main() {
  const token = await getToken();
  console.log('Got service account token');

  // ─── Write 2025 section starting at row 68 ───────────────────────────────
  const year2025Rows = buildYearBlock(2025, expenses2025ByMonth, emptyIncome);
  console.log(`\nWriting 2025 section (${year2025Rows.length} rows) starting at Dashboard row 68...`);
  await sheetsClear(token, 'Dashboard!A68:AH90');
  const result2025 = await sheetsUpdate(token, `Dashboard!A68:AH${68 + year2025Rows.length - 1}`, year2025Rows);
  console.log(`2025 section written: ${result2025.updatedRows} rows, ${result2025.updatedCells} cells`);

  console.log('\n✓ Phase 1 complete — 2025 Dashboard expense section written correctly');
  console.log(`  2025 Grand Expense Total: ${fmt(expenses2025.reduce((s, e) => s + e.amount, 0))}`);
}

main().catch(console.error);
