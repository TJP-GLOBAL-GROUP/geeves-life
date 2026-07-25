import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

// 1. Total count
const [countRows] = await conn.execute('SELECT COUNT(*) as total FROM property_expense_records');
console.log('\n=== EXPENSE RECORDS COUNT ===');
console.log('Total:', countRows[0].total);

// 2. Categories breakdown
const [catRows] = await conn.execute('SELECT category, COUNT(*) as cnt, SUM(amountJMD) as totalJMD FROM property_expense_records GROUP BY category ORDER BY cnt DESC');
console.log('\n=== CATEGORIES ===');
for (const r of catRows) {
  console.log(`  ${r.category}: ${r.cnt} records, total JMD ${r.totalJMD}`);
}

// 3. Properties breakdown
const [propRows] = await conn.execute('SELECT property, COUNT(*) as cnt FROM property_expense_records GROUP BY property ORDER BY cnt DESC');
console.log('\n=== PROPERTIES ===');
for (const r of propRows) {
  console.log(`  ${r.property}: ${r.cnt} records`);
}

// 4. Source breakdown
const [srcRows] = await conn.execute('SELECT source, COUNT(*) as cnt FROM property_expense_records GROUP BY source ORDER BY cnt DESC');
console.log('\n=== SOURCES ===');
for (const r of srcRows) {
  console.log(`  ${r.source}: ${r.cnt} records`);
}

// 5. Sample rows
const [sampleRows] = await conn.execute('SELECT id, property, expenseDate, expenseDescription, category, amountJMD, paidTo, supportingDocUrl, source FROM property_expense_records LIMIT 5');
console.log('\n=== SAMPLE ROWS ===');
for (const r of sampleRows) {
  console.log(JSON.stringify(r, null, 2));
}

// 6. Check property_bookings.commissionAmount
const [commRows] = await conn.execute('SELECT COUNT(*) as total, SUM(commissionAmount) as totalCommission FROM property_bookings WHERE commissionAmount IS NOT NULL AND commissionAmount > 0');
console.log('\n=== COMMISSION IN PROPERTY_BOOKINGS ===');
console.log('Bookings with commission:', commRows[0].total, '| Total commission:', commRows[0].totalCommission);

// 7. Check airbnb_payout_records for service fees
const [airbnbCols] = await conn.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'airbnb_payout_records' AND COLUMN_NAME LIKE '%fee%' OR (TABLE_NAME = 'airbnb_payout_records' AND COLUMN_NAME LIKE '%service%')");
console.log('\n=== AIRBNB PAYOUT FEE COLUMNS ===');
for (const r of airbnbCols) {
  console.log(`  ${r.COLUMN_NAME}`);
}

// 8. Check if cleaningFee column exists on property_bookings
const [cleanCols] = await conn.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'property_bookings' AND COLUMN_NAME LIKE '%clean%'");
console.log('\n=== CLEANING FEE COLUMNS IN PROPERTY_BOOKINGS ===');
for (const r of cleanCols) {
  console.log(`  ${r.COLUMN_NAME}`);
}

// 9. Check if sourceDocUrl already exists
const [docCols] = await conn.execute("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE (TABLE_NAME = 'property_bookings' OR TABLE_NAME = 'property_expense_records') AND (COLUMN_NAME LIKE '%source%' OR COLUMN_NAME LIKE '%proof%' OR COLUMN_NAME LIKE '%doc%')");
console.log('\n=== SOURCE/PROOF/DOC COLUMNS ===');
for (const r of docCols) {
  console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME}`);
}

// 10. Year breakdown for expenses
const [yearRows] = await conn.execute('SELECT expenseYear, COUNT(*) as cnt FROM property_expense_records GROUP BY expenseYear ORDER BY expenseYear');
console.log('\n=== EXPENSE YEARS ===');
for (const r of yearRows) {
  console.log(`  ${r.expenseYear}: ${r.cnt} records`);
}

await conn.end();
