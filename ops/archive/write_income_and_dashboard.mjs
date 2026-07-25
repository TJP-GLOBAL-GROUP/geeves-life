/**
 * Write income tabs (2024 Income, 2025 Income, 2026 Income) and
 * update the Dashboard tab income columns for all three years.
 * 
 * Also writes 2025 and 2026 expense sections to the Dashboard tab.
 */
import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import { createConnection } from 'mysql2/promise';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

// ── Google Auth ────────────────────────────────────────────────────────────
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const SA_KEY = SA_KEY_RAW.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ── Load data ─────────────────────────────────────────────────────────────
const allIncome = JSON.parse(fs.readFileSync('/home/ubuntu/upload/all_income_records.json', 'utf8'));
const incomeUrls = JSON.parse(fs.readFileSync('/home/ubuntu/upload/income_s3_urls.json', 'utf8'));
const urlMap = {};
for (const r of incomeUrls) if (r.s3Url) urlMap[r.filename] = r.s3Url;

// Load 2025 and 2026 expense data
let expenses2025 = [], expenses2026 = [];
try { expenses2025 = JSON.parse(fs.readFileSync('/home/ubuntu/upload/expenses_2025_compiled.json', 'utf8')); } catch {}
try { expenses2026 = JSON.parse(fs.readFileSync('/home/ubuntu/upload/expenses_2026_compiled.json', 'utf8')); } catch {}

// Load JMD exchange rates (approximate)
const JMD_RATES = {
  2024: 156.5,  // avg JMD/USD 2024
  2025: 158.0,  // avg JMD/USD 2025
  2026: 160.0,  // avg JMD/USD 2026
};

function toJMD(usd, year) {
  return Math.round(usd * (JMD_RATES[year] || 158));
}

// ── Helper: get or create sheet ────────────────────────────────────────────
async function getOrCreateSheet(title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.find(s => s.properties.title === title);
  if (existing) return existing.properties.sheetId;

  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

// ── Helper: clear and write a sheet ───────────────────────────────────────
async function writeSheet(title, rows) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${title}'!A:Z`,
  });
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${title}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
  console.log(`  Written ${rows.length} rows to '${title}'`);
}

// ── Build income rows for a year ───────────────────────────────────────────
function buildIncomeRows(year) {
  const yearData = allIncome
    .filter(p => p.year === year)
    .sort((a, b) => a.date.localeCompare(b.date));

  const headers = [
    'Date', 'Month', 'Platform', 'Amount (USD)', 'Amount (JMD)',
    'Description / Reference', 'Source Documentation Link'
  ];

  const rows = [headers];
  for (const p of yearData) {
    const amtJMD = toJMD(p.amount_usd, year);
    // Find S3 URL from files array
    let docUrl = '';
    if (p.files && p.files.length > 0) {
      const fname = path.basename(p.files[0]);
      docUrl = urlMap[fname] || '';
    }
    const monthName = new Date(p.date + 'T00:00:00').toLocaleString('en-US', { month: 'long' });
    rows.push([
      p.date,
      monthName,
      (p.platform || 'airbnb').toUpperCase(),
      p.amount_usd,
      amtJMD,
      p.subject || p.memo || '',
      docUrl,
    ]);
  }

  // Summary row
  const totalUSD = yearData.reduce((s, p) => s + p.amount_usd, 0);
  const totalJMD = yearData.reduce((s, p) => s + toJMD(p.amount_usd, year), 0);
  rows.push([]);
  rows.push(['TOTAL', '', '', totalUSD.toFixed(2), totalJMD, '', '']);

  return rows;
}

// ── Build expense rows for a year ─────────────────────────────────────────
function buildExpenseRows(year, expenses) {
  const headers = [
    'Date', 'Month', 'Category', 'Description',
    'Amount (JMD)', 'Amount (USD)', 'Source Documentation Link'
  ];
  const rows = [headers];

  const yearData = expenses
    .filter(e => e.year === year)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  for (const e of yearData) {
    const monthName = e.date
      ? new Date(e.date + 'T00:00:00').toLocaleString('en-US', { month: 'long' })
      : '';
    rows.push([
      e.date || '',
      monthName,
      e.category || '',
      e.description || e.subject || '',
      e.amount_jmd || 0,
      e.amount_usd || 0,
      e.docUrl || '',
    ]);
  }

  const totalJMD = yearData.reduce((s, e) => s + (e.amount_jmd || 0), 0);
  const totalUSD = yearData.reduce((s, e) => s + (e.amount_usd || 0), 0);
  rows.push([]);
  rows.push(['TOTAL', '', '', '', totalJMD, totalUSD.toFixed(2), '']);

  return rows;
}

// ── Monthly summary for dashboard ─────────────────────────────────────────
function monthlyIncomeSummary(year) {
  const monthly = {};
  for (let m = 1; m <= 12; m++) monthly[m] = 0;
  for (const p of allIncome.filter(p => p.year === year)) {
    monthly[p.month] = (monthly[p.month] || 0) + p.amount_usd;
  }
  return monthly;
}

function monthlyExpenseSummary(year, expenses) {
  const monthly = {};
  for (let m = 1; m <= 12; m++) monthly[m] = 0;
  for (const e of expenses.filter(e => e.year === year)) {
    const m = e.month || (e.date ? new Date(e.date + 'T00:00:00').getMonth() + 1 : 0);
    if (m) monthly[m] = (monthly[m] || 0) + (e.amount_jmd || 0);
  }
  return monthly;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('Writing income tabs...');

  // 1. Write income tabs for each year
  for (const year of [2024, 2025, 2026]) {
    const tabName = `${year} Income`;
    await getOrCreateSheet(tabName);
    const rows = buildIncomeRows(year);
    await writeSheet(tabName, rows);
    const count = rows.length - 3; // minus header, blank, total
    const total = allIncome.filter(p => p.year === year).reduce((s, p) => s + p.amount_usd, 0);
    console.log(`  ${year}: ${count} payout records, USD $${total.toLocaleString('en-US', {minimumFractionDigits:2})}`);
  }

  // 2. Write expense tabs for 2025 and 2026
  if (expenses2025.length > 0) {
    await getOrCreateSheet('2025 Expenses');
    await writeSheet('2025 Expenses', buildExpenseRows(2025, expenses2025));
  }
  if (expenses2026.length > 0) {
    await getOrCreateSheet('2026 Expenses');
    await writeSheet('2026 Expenses', buildExpenseRows(2026, expenses2026));
  }

  // 3. Read the Dashboard tab to find where to add income data
  console.log('\nReading Dashboard tab...');
  const dashResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Dashboard!A1:Z100',
  });
  const dashRows = dashResp.data.values || [];
  console.log(`  Dashboard has ${dashRows.length} rows`);

  // Find the last row of the 2024 section to know where to append
  let lastDataRow = dashRows.length;
  for (let i = 0; i < dashRows.length; i++) {
    const row = dashRows[i];
    if (row && row[0] && String(row[0]).includes('2024')) {
      lastDataRow = i + 1; // 1-indexed
    }
  }
  console.log(`  Last 2024 data row: ${lastDataRow}`);

  // Get the header structure from the dashboard (first few rows)
  const headerRow = dashRows[0] || [];
  console.log(`  Dashboard headers: ${JSON.stringify(headerRow)}`);

  // Build the monthly summary sections for 2025 and 2026
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  // Determine column structure from existing 2024 data
  // Look for income column (USD amounts) and expense column (JMD amounts)
  // The 2024 dashboard has: Month | Gross Income (JMD) | Total Expenses (JMD) | Net Income (JMD) | ...
  // Find the income and expense columns
  let incomeCol = -1, expenseCol = -1;
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').toLowerCase();
    if (h.includes('income') || h.includes('revenue')) incomeCol = i;
    if (h.includes('expense') || h.includes('cost')) expenseCol = i;
  }
  console.log(`  Income col: ${incomeCol}, Expense col: ${expenseCol}`);

  // Build 2025 and 2026 summary sections
  const newDashRows = [];

  for (const year of [2025, 2026]) {
    const incomeMonthly = monthlyIncomeSummary(year);
    const expenseMonthly = monthlyExpenseSummary(year, year === 2025 ? expenses2025 : expenses2026);
    const rate = JMD_RATES[year];

    // Year header
    newDashRows.push([]);
    newDashRows.push([`=== ${year} FINANCIAL SUMMARY ===`, '', '', '', '', '', '']);
    newDashRows.push(headerRow.length > 0 ? headerRow : [
      'Month', 'Gross Income (JMD)', 'Total Expenses (JMD)', 'Net Income (JMD)',
      'Gross Income (USD)', 'Occupancy Notes', ''
    ]);

    let totalIncomeJMD = 0, totalExpJMD = 0;
    for (let m = 1; m <= 12; m++) {
      const incUSD = incomeMonthly[m] || 0;
      const incJMD = Math.round(incUSD * rate);
      const expJMD = expenseMonthly[m] || 0;
      const netJMD = incJMD - expJMD;
      totalIncomeJMD += incJMD;
      totalExpJMD += expJMD;
      newDashRows.push([
        MONTHS[m - 1],
        incJMD || '',
        expJMD || '',
        netJMD !== 0 ? netJMD : '',
        incUSD > 0 ? incUSD.toFixed(2) : '',
        '',
        '',
      ]);
    }

    const totalNetJMD = totalIncomeJMD - totalExpJMD;
    const totalIncUSD = allIncome.filter(p => p.year === year).reduce((s, p) => s + p.amount_usd, 0);
    newDashRows.push([
      'TOTAL',
      totalIncomeJMD,
      totalExpJMD,
      totalNetJMD,
      totalIncUSD.toFixed(2),
      '',
      '',
    ]);
  }

  // Append to dashboard after the existing data
  const appendRange = `Dashboard!A${lastDataRow + 2}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: appendRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: newDashRows },
  });
  console.log(`\nAppended ${newDashRows.length} rows to Dashboard starting at row ${lastDataRow + 2}`);

  // 4. Summary
  console.log('\n=== FINAL SUMMARY ===');
  for (const year of [2024, 2025, 2026]) {
    const total = allIncome.filter(p => p.year === year).reduce((s, p) => s + p.amount_usd, 0);
    const count = allIncome.filter(p => p.year === year).length;
    const rate = JMD_RATES[year];
    console.log(`${year}: ${count} payouts | USD $${total.toLocaleString('en-US', {minimumFractionDigits:2})} | JMD $${Math.round(total*rate).toLocaleString()}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
