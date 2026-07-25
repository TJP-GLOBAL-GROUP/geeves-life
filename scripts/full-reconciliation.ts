import { google } from 'googleapis';
import mysql from 'mysql2/promise';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

interface IncomeRow {
  checkIn: string;
  checkOut: string;
  month: string;
  property: string;
  platform: string;
  guestName: string;
  confirmationNumber: string;
  nights: number;
  grossTotal: number;
  taxWithheld: number;
  commission: number;
  netPayout: number;
  cleaningFee: number;
}

interface ExpenseRow {
  date: string;
  type: string;
  vendor: string;
  description: string;
  category: string;
  amount: number;
  property: string;
  reference: string;
  paymentPlatform: string;
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  // === PART 1: READ SPREADSHEET ===
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountEmail!,
      private_key: serviceAccountKey!.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Read all income tabs
  const incomeByYear: Record<string, IncomeRow[]> = {};
  for (const year of ['2024', '2025', '2026']) {
    const tabName = `${year} Income (Enhanced)`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1:O300`,
    });
    const rows = response.data.values || [];
    const dataRows = rows.slice(1); // skip header
    incomeByYear[year] = dataRows.map(row => ({
      checkIn: row[0] || '',
      checkOut: row[1] || '',
      month: row[2] || '',
      property: row[3] || '',
      platform: row[4] || '',
      guestName: row[5] || '',
      confirmationNumber: row[6] || '',
      nights: parseNum(row[7]),
      grossTotal: parseNum(row[8]),
      taxWithheld: parseNum(row[9]),
      commission: parseNum(row[10]),
      netPayout: parseNum(row[11]),
      cleaningFee: parseNum(row[12]),
    }));
  }

  // Read all expense tabs
  const expensesByYear: Record<string, ExpenseRow[]> = {};
  for (const year of ['2024', '2025', '2026']) {
    const tabName = `${year} Expenses (Detail)`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1:J500`,
    });
    const rows = response.data.values || [];
    const dataRows = rows.slice(1); // skip header
    expensesByYear[year] = dataRows.map(row => ({
      date: row[0] || '',
      type: row[1] || '',
      vendor: row[2] || '',
      description: row[3] || '',
      category: row[4] || '',
      amount: parseNum(row[5]),
      property: row[6] || '',
      reference: row[7] || '',
      paymentPlatform: row[8] || '',
    }));
  }

  // === PART 2: COMPUTE SPREADSHEET TOTALS ===
  console.log('\n' + '='.repeat(80));
  console.log('SPREADSHEET TOTALS (Source of Truth)');
  console.log('='.repeat(80));

  for (const year of ['2024', '2025', '2026']) {
    const income = incomeByYear[year];
    const expenses = expensesByYear[year];

    // Filter out rows with 0 net payout (placeholder/blocked bookings)
    const revenueRows = income.filter(r => r.netPayout > 0);
    const totalGross = revenueRows.reduce((sum, r) => sum + r.grossTotal, 0);
    const totalTaxWithheld = revenueRows.reduce((sum, r) => sum + r.taxWithheld, 0);
    const totalCommission = revenueRows.reduce((sum, r) => sum + r.commission, 0);
    const totalNetPayout = revenueRows.reduce((sum, r) => sum + r.netPayout, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);

    console.log(`\n--- ${year} ---`);
    console.log(`  Income Bookings: ${revenueRows.length} (of ${income.length} total rows)`);
    console.log(`  Gross Total:     $${totalGross.toFixed(2)}`);
    console.log(`  Tax Withheld:    $${totalTaxWithheld.toFixed(2)}`);
    console.log(`  Commission:      $${totalCommission.toFixed(2)}`);
    console.log(`  Net Payout:      $${totalNetPayout.toFixed(2)}`);
    console.log(`  Total Expenses:  $${totalExpenses.toFixed(2)}`);
    console.log(`  Net Income:      $${(totalNetPayout - totalExpenses).toFixed(2)}`);

    // By property
    const properties = [...new Set(revenueRows.map(r => r.property))];
    console.log(`\n  By Property:`);
    for (const prop of properties) {
      const propRows = revenueRows.filter(r => r.property === prop);
      const propNet = propRows.reduce((sum, r) => sum + r.netPayout, 0);
      const propGross = propRows.reduce((sum, r) => sum + r.grossTotal, 0);
      console.log(`    ${prop}: Gross $${propGross.toFixed(2)} | Net $${propNet.toFixed(2)} (${propRows.length} bookings)`);
    }

    // By platform
    const platforms = [...new Set(revenueRows.map(r => r.platform))];
    console.log(`\n  By Platform:`);
    for (const plat of platforms) {
      const platRows = revenueRows.filter(r => r.platform === plat);
      const platNet = platRows.reduce((sum, r) => sum + r.netPayout, 0);
      console.log(`    ${plat}: Net $${platNet.toFixed(2)} (${platRows.length} bookings)`);
    }

    // Expense categories
    const categories = [...new Set(expenses.map(r => r.category))];
    console.log(`\n  Expense Categories:`);
    for (const cat of categories.sort()) {
      const catRows = expenses.filter(r => r.category === cat);
      const catTotal = catRows.reduce((sum, r) => sum + r.amount, 0);
      if (catTotal > 0) {
        console.log(`    ${cat}: $${catTotal.toFixed(2)} (${catRows.length} items)`);
      }
    }
  }

  // === PART 3: QUERY DATABASE ===
  console.log('\n\n' + '='.repeat(80));
  console.log('DATABASE TOTALS (Geeves)');
  console.log('='.repeat(80));

  const pool = mysql.createPool(process.env.DATABASE_URL!);

  for (const year of ['2024', '2025', '2026']) {
    const startMs = new Date(`${year}-01-01`).getTime();
    const endMs = new Date(`${parseInt(year) + 1}-01-01`).getTime();

    // Income from property_bookings
    const [bookings] = await pool.query(`
      SELECT 
        COUNT(*) as totalBookings,
        SUM(CASE WHEN totalPrice > 0 THEN 1 ELSE 0 END) as revenueBookings,
        SUM(totalPrice) as grossTotal,
        SUM(commissionAmount) as totalCommission,
        SUM(netAmount) as totalNetPayout,
        SUM(taxRemittedByPlatform) as totalTaxRemitted,
        SUM(cleaningFee) as totalCleaningFee
      FROM property_bookings
      WHERE checkIn >= ? AND checkIn < ?
        AND bookingStatus = 'confirmed'
    `, [startMs, endMs]) as any;

    // By property
    const [byProperty] = await pool.query(`
      SELECT 
        p.name as propertyName,
        COUNT(*) as bookings,
        SUM(pb.totalPrice) as grossTotal,
        SUM(pb.netAmount) as netPayout,
        SUM(pb.commissionAmount) as commission
      FROM property_bookings pb
      JOIN properties p ON pb.propertyId = p.id
      WHERE pb.checkIn >= ? AND pb.checkIn < ?
        AND pb.bookingStatus = 'confirmed'
      GROUP BY p.name
    `, [startMs, endMs]) as any;

    // By platform
    const [byPlatform] = await pool.query(`
      SELECT 
        pp.platform,
        COUNT(*) as bookings,
        SUM(pb.netAmount) as netPayout
      FROM property_bookings pb
      JOIN property_platforms pp ON pb.platformId = pp.id
      WHERE pb.checkIn >= ? AND pb.checkIn < ?
        AND pb.bookingStatus = 'confirmed'
      GROUP BY pp.platform
    `, [startMs, endMs]) as any;

    // By financial source
    const [bySource] = await pool.query(`
      SELECT 
        financialSource,
        COUNT(*) as bookings,
        SUM(netAmount) as netPayout
      FROM property_bookings
      WHERE checkIn >= ? AND checkIn < ?
        AND bookingStatus = 'confirmed'
      GROUP BY financialSource
    `, [startMs, endMs]) as any;

    // Expenses from property_expense_records
    const [expenses] = await pool.query(`
      SELECT 
        COUNT(*) as totalExpenses,
        SUM(amountUSD) as totalAmount
      FROM property_expense_records
      WHERE expenseDate >= ? AND expenseDate < ?
    `, [startMs, endMs]) as any;

    // Expense by category
    const [expByCategory] = await pool.query(`
      SELECT 
        category,
        COUNT(*) as items,
        SUM(amountUSD) as total
      FROM property_expense_records
      WHERE expenseDate >= ? AND expenseDate < ?
      GROUP BY category
      ORDER BY total DESC
    `, [startMs, endMs]) as any;

    const b = bookings[0];
    const e = expenses[0];
    const bGross = Number(b.grossTotal || 0);
    const bTaxRemitted = Number(b.totalTaxRemitted || 0);
    const bCommission = Number(b.totalCommission || 0);
    const bNetPayout = Number(b.totalNetPayout || 0);
    const eTotalAmount = Number(e.totalAmount || 0);

    console.log(`\n--- ${year} ---`);
    console.log(`  Income Bookings: ${b.revenueBookings || 0} (of ${b.totalBookings || 0} total)`);
    console.log(`  Gross Total:     $${bGross.toFixed(2)}`);
    console.log(`  Tax Remitted:    $${bTaxRemitted.toFixed(2)}`);
    console.log(`  Commission:      $${bCommission.toFixed(2)}`);
    console.log(`  Net Payout:      $${bNetPayout.toFixed(2)}`);
    console.log(`  Total Expenses:  $${eTotalAmount.toFixed(2)} (${e.totalExpenses || 0} records)`);
    console.log(`  Net Income:      $${(bNetPayout - eTotalAmount).toFixed(2)}`);

    console.log(`\n  By Property:`);
    for (const row of byProperty) {
      console.log(`    ${row.propertyName}: Gross $${Number(row.grossTotal || 0).toFixed(2)} | Net $${Number(row.netPayout || 0).toFixed(2)} (${row.bookings} bookings)`);
    }

    console.log(`\n  By Platform:`);
    for (const row of byPlatform) {
      console.log(`    ${row.platform}: Net $${Number(row.netPayout || 0).toFixed(2)} (${row.bookings} bookings)`);
    }

    console.log(`\n  By Financial Source:`);
    for (const row of bySource) {
      console.log(`    ${row.financialSource || 'null'}: Net $${Number(row.netPayout || 0).toFixed(2)} (${row.bookings} bookings)`);
    }

    if (expByCategory.length > 0) {
      console.log(`\n  Expense Categories:`);
      for (const row of expByCategory) {
        console.log(`    ${row.category}: $${Number(row.total || 0).toFixed(2)} (${row.items} items)`);
      }
    }
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
