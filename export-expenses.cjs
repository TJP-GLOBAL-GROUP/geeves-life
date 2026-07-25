const { writeFileSync } = require('fs');
const mysql = require('mysql2/promise');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const connection = await mysql.createConnection(dbUrl);

  const [rows] = await connection.execute(
    `SELECT id, householdId, property, expenseDate, expenseYear, expenseMonth, 
            expenseDescription, category, amountJMD, amountUSD, exchangeRateUsed,
            paidTo, paidFrom, bankTransactionId, documentId, supportingDocUrl, 
            proofOfPaymentUrl, notes, isReconciled, isTaxDeductible, source, createdAt,
            updatedAt, qboExpenseId, qboSyncStatus, qboSyncedAt, qboSyncError, orderItemId
     FROM property_expense_records 
     ORDER BY expenseDate DESC`
  );

  console.log('Found ' + rows.length + ' expense records');

  if (rows.length === 0) {
    console.log('No records found');
    await connection.end();
    return;
  }

  const columns = Object.keys(rows[0]);
  const csvLines = [columns.join(',')];

  for (const row of rows) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      let str;
      if (val instanceof Date) {
        str = val.toISOString();
      } else {
        str = String(val);
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    csvLines.push(values.join(','));
  }

  const csvContent = csvLines.join('\n') + '\n';
  writeFileSync('/home/ubuntu/property_expenses_export.csv', csvContent);
  console.log('Exported ' + rows.length + ' rows to /home/ubuntu/property_expenses_export.csv');

  await connection.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
