/**
 * Backfill property_expense_records.amountUSD using the exchange_rates table.
 * 
 * Rate resolution:
 * 1. If exchangeRateUsed is already set on the row, use it (actual rate received)
 * 2. Otherwise, look up the rate from exchange_rates for the expense date
 * 3. Calculate amountUSD = amountJMD / rate
 * 4. Store the rate used in exchangeRateUsed
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

async function main() {
  const pool = await mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
  });

  // Get all expense rows where amountUSD is NULL and amountJMD > 0
  const [rows] = await pool.execute(`
    SELECT id, expenseDate, amountJMD, exchangeRateUsed
    FROM property_expense_records
    WHERE (amountUSD IS NULL OR amountUSD = 0) AND amountJMD > 0
  `);

  console.log(`Found ${rows.length} expense rows needing USD conversion.`);

  let updated = 0;
  let usedActual = 0;
  let usedStored = 0;
  let noRate = 0;

  for (const row of rows) {
    let rate = null;
    let source = '';

    // Priority 1: Actual rate on the row
    if (row.exchangeRateUsed && parseFloat(row.exchangeRateUsed) > 0) {
      rate = parseFloat(row.exchangeRateUsed);
      source = 'actual';
      usedActual++;
    }

    // Priority 2: Look up from exchange_rates table
    if (!rate) {
      const expDate = row.expenseDate instanceof Date 
        ? row.expenseDate.toISOString().slice(0, 10) 
        : String(row.expenseDate).slice(0, 10);
      
      const [rateRows] = await pool.execute(`
        SELECT rate FROM exchange_rates 
        WHERE baseCurrency = 'USD' AND targetCurrency = 'JMD' AND rateDate = ?
      `, [expDate]);

      if (rateRows.length > 0) {
        rate = parseFloat(rateRows[0].rate);
        source = 'stored';
        usedStored++;
      } else {
        // Priority 3: Nearest prior date
        const [nearest] = await pool.execute(`
          SELECT rate FROM exchange_rates 
          WHERE baseCurrency = 'USD' AND targetCurrency = 'JMD' AND rateDate <= ?
          ORDER BY rateDate DESC LIMIT 1
        `, [expDate]);
        
        if (nearest.length > 0) {
          rate = parseFloat(nearest[0].rate);
          source = 'nearest';
          usedStored++;
        }
      }
    }

    if (rate && rate > 0) {
      const amountUSD = parseFloat((parseFloat(row.amountJMD) / rate).toFixed(2));
      await pool.execute(`
        UPDATE property_expense_records 
        SET amountUSD = ?, exchangeRateUsed = ?
        WHERE id = ?
      `, [amountUSD, rate, row.id]);
      updated++;
    } else {
      noRate++;
      console.log(`  No rate found for expense id=${row.id} date=${row.expenseDate}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Updated with USD: ${updated}`);
  console.log(`Used actual rate: ${usedActual}`);
  console.log(`Used stored/nearest rate: ${usedStored}`);
  console.log(`No rate available: ${noRate}`);

  // Show sample results
  const [samples] = await pool.execute(`
    SELECT id, expenseDate, expenseDescription, amountJMD, amountUSD, exchangeRateUsed
    FROM property_expense_records
    WHERE amountUSD IS NOT NULL AND amountUSD > 0
    ORDER BY expenseDate DESC LIMIT 5
  `);
  console.log('\nSample converted rows:');
  for (const s of samples) {
    console.log(`  ${String(s.expenseDate).slice(0,10)} | JMD ${s.amountJMD} → USD ${s.amountUSD} (rate: ${s.exchangeRateUsed}) | ${s.expenseDescription.slice(0,40)}`);
  }

  // Total USD value
  const [totals] = await pool.execute(`
    SELECT SUM(amountUSD) as totalUSD, SUM(amountJMD) as totalJMD, COUNT(*) as cnt
    FROM property_expense_records WHERE amountUSD > 0
  `);
  console.log(`\nTotal: ${totals[0].cnt} rows | JMD ${totals[0].totalJMD} → USD ${totals[0].totalUSD}`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
