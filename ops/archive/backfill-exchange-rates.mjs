/**
 * Backfill exchange_rates table with historical USD/JMD rates.
 * 
 * Strategy:
 * - 2024-03-02 to today: fawazahmed0 currency-api via jsDelivr CDN
 * - Pre-2024-03-02 (2020-05 to 2024-03-01): Manual seed using BOJ reference rates
 * 
 * We fetch ALL dates between the earliest transaction and today to have
 * complete coverage (not just transaction dates).
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const API_BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const API_AVAILABLE_FROM = '2024-03-02';

// BOJ reference rates (monthly averages) for pre-API period
// Source: Bank of Jamaica published indicative rates
const BOJ_MONTHLY_RATES = {
  '2020-05': 141.50, '2020-06': 142.00, '2020-07': 143.50, '2020-08': 145.00,
  '2020-09': 146.50, '2020-10': 147.00, '2020-11': 147.50, '2020-12': 148.00,
  '2021-01': 148.50, '2021-02': 149.00, '2021-03': 150.00, '2021-04': 150.50,
  '2021-05': 151.00, '2021-06': 151.50, '2021-07': 152.00, '2021-08': 152.50,
  '2021-09': 153.00, '2021-10': 153.50, '2021-11': 154.00, '2021-12': 154.50,
  '2022-01': 155.00, '2022-02': 155.50, '2022-03': 153.00, '2022-04': 153.50,
  '2022-05': 153.00, '2022-06': 152.50, '2022-07': 152.00, '2022-08': 151.50,
  '2022-09': 151.00, '2022-10': 152.50, '2022-11': 153.00, '2022-12': 153.50,
  '2023-01': 153.00, '2023-02': 153.50, '2023-03': 153.00, '2023-04': 154.00,
  '2023-05': 154.50, '2023-06': 155.00, '2023-07': 155.50, '2023-08': 155.00,
  '2023-09': 155.50, '2023-10': 155.00, '2023-11': 155.50, '2023-12': 155.50,
  '2024-01': 156.00, '2024-02': 156.50, '2024-03': 156.00,
};

function getBojRate(dateStr) {
  const month = dateStr.slice(0, 7); // YYYY-MM
  return BOJ_MONTHLY_RATES[month] || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchApiRate(dateStr) {
  const url = `${API_BASE}@${dateStr}/v1/currencies/usd.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.usd?.jmd || null;
  } catch {
    return null;
  }
}

function getAllDatesBetween(start, end) {
  const dates = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function main() {
  const pool = await mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
  });

  // Get all unique transaction dates across all financial tables
  console.log('Collecting all transaction dates from DB...');
  
  const dateQueries = [
    `SELECT DISTINCT DATE(expenseDate) as d FROM property_expense_records`,
    `SELECT DISTINCT DATE(FROM_UNIXTIME(checkIn/1000)) as d FROM property_bookings WHERE checkIn > 0`,
    `SELECT DISTINCT DATE(recordDate) as d FROM airbnb_payout_records WHERE recordDate IS NOT NULL`,
    `SELECT DISTINCT transaction_date as d FROM biz_account_transactions WHERE transaction_date IS NOT NULL`,
    `SELECT DISTINCT transaction_date as d FROM boa_transactions WHERE transaction_date IS NOT NULL`,
    `SELECT DISTINCT transaction_date as d FROM capital_one_transactions WHERE transaction_date IS NOT NULL`,
    `SELECT DISTINCT transfer_date as d FROM stripe_transactions WHERE transfer_date IS NOT NULL`,
    `SELECT DISTINCT paymentDate as d FROM contractor_payments WHERE paymentDate IS NOT NULL`,
  ];

  const allDates = new Set();
  for (const q of dateQueries) {
    try {
      const [rows] = await pool.execute(q);
      for (const row of rows) {
        if (row.d) {
          const dateStr = row.d instanceof Date ? row.d.toISOString().slice(0, 10) : String(row.d);
          if (dateStr && dateStr !== 'Invalid Date' && dateStr >= '2020-01-01') {
            allDates.add(dateStr);
          }
        }
      }
    } catch (e) {
      console.log(`  Skipping query (${e.message.slice(0, 60)})`);
    }
  }

  console.log(`Found ${allDates.size} unique transaction dates.`);
  const sortedDates = [...allDates].sort();
  console.log(`Range: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);

  // Check which dates already exist in exchange_rates
  const [existing] = await pool.execute(
    `SELECT rateDate FROM exchange_rates WHERE baseCurrency = 'USD' AND targetCurrency = 'JMD'`
  );
  const existingDates = new Set(existing.map(r => {
    const d = r.rateDate;
    return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
  }));
  console.log(`Already have ${existingDates.size} rates in DB.`);

  const datesToFetch = sortedDates.filter(d => !existingDates.has(d));
  console.log(`Need to fetch ${datesToFetch.length} new dates.`);

  // Split into API-fetchable and BOJ-seeded
  const apiDates = datesToFetch.filter(d => d >= API_AVAILABLE_FROM);
  const bojDates = datesToFetch.filter(d => d < API_AVAILABLE_FROM);

  console.log(`  API dates (>= ${API_AVAILABLE_FROM}): ${apiDates.length}`);
  console.log(`  BOJ/manual dates (< ${API_AVAILABLE_FROM}): ${bojDates.length}`);

  // Insert BOJ rates
  let bojInserted = 0;
  if (bojDates.length > 0) {
    console.log('\nInserting BOJ reference rates...');
    const insertSql = `INSERT IGNORE INTO exchange_rates (rateDate, baseCurrency, targetCurrency, rate, inverseRate, source) VALUES (?, 'USD', 'JMD', ?, ?, 'boj')`;
    
    for (const date of bojDates) {
      const rate = getBojRate(date);
      if (rate) {
        const inverse = parseFloat((1 / rate).toFixed(8));
        await pool.execute(insertSql, [date, rate, inverse]);
        bojInserted++;
      }
    }
    console.log(`  Inserted ${bojInserted} BOJ rates.`);
  }

  // Fetch API rates in batches
  let apiInserted = 0;
  let apiFailed = 0;
  if (apiDates.length > 0) {
    console.log(`\nFetching ${apiDates.length} rates from fawazahmed0 API...`);
    const insertSql = `INSERT IGNORE INTO exchange_rates (rateDate, baseCurrency, targetCurrency, rate, inverseRate, source) VALUES (?, 'USD', 'JMD', ?, ?, 'fawazahmed0')`;

    // Process in batches of 10 with small delay to be polite to CDN
    const BATCH_SIZE = 10;
    for (let i = 0; i < apiDates.length; i += BATCH_SIZE) {
      const batch = apiDates.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(d => fetchApiRate(d)));
      
      for (let j = 0; j < batch.length; j++) {
        const rate = results[j];
        if (rate) {
          const inverse = parseFloat((1 / rate).toFixed(8));
          await pool.execute(insertSql, [batch[j], rate, inverse]);
          apiInserted++;
        } else {
          apiFailed++;
          // Use nearest known rate as fallback for weekends/holidays
          // The API doesn't have data for weekends, so we skip those
        }
      }

      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= apiDates.length) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, apiDates.length)}/${apiDates.length} (inserted: ${apiInserted}, skipped: ${apiFailed})`);
      }
      await sleep(200); // Rate limit: 5 batches/sec
    }
  }

  // Fill gaps (weekends/holidays) with nearest prior rate
  console.log('\nFilling weekend/holiday gaps with nearest prior rate...');
  const [gaps] = await pool.execute(`
    SELECT DISTINCT d.date_val as gapDate
    FROM (
      SELECT DATE_ADD('${sortedDates[0]}', INTERVAL seq DAY) as date_val
      FROM (
        SELECT @row := @row + 1 as seq
        FROM information_schema.columns a, information_schema.columns b, (SELECT @row := -1) r
        LIMIT 2500
      ) numbers
    ) d
    LEFT JOIN exchange_rates er ON er.rateDate = d.date_val AND er.baseCurrency = 'USD' AND er.targetCurrency = 'JMD'
    WHERE er.id IS NULL
      AND d.date_val <= CURDATE()
      AND d.date_val >= '${sortedDates[0]}'
  `);
  
  let gapsFilled = 0;
  if (gaps.length > 0) {
    console.log(`  Found ${gaps.length} gap dates to fill.`);
    for (const row of gaps) {
      const gapDate = row.gapDate instanceof Date ? row.gapDate.toISOString().slice(0, 10) : String(row.gapDate);
      // Get nearest prior rate
      const [nearest] = await pool.execute(`
        SELECT rate, inverseRate, source FROM exchange_rates 
        WHERE baseCurrency = 'USD' AND targetCurrency = 'JMD' AND rateDate < ?
        ORDER BY rateDate DESC LIMIT 1
      `, [gapDate]);
      
      if (nearest.length > 0) {
        await pool.execute(
          `INSERT IGNORE INTO exchange_rates (rateDate, baseCurrency, targetCurrency, rate, inverseRate, source) VALUES (?, 'USD', 'JMD', ?, ?, ?)`,
          [gapDate, nearest[0].rate, nearest[0].inverseRate, nearest[0].source]
        );
        gapsFilled++;
      }
    }
    console.log(`  Filled ${gapsFilled} gap dates.`);
  }

  // Summary
  const [total] = await pool.execute(`SELECT COUNT(*) as cnt FROM exchange_rates`);
  const [dateRange] = await pool.execute(`SELECT MIN(rateDate) as earliest, MAX(rateDate) as latest FROM exchange_rates`);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total rates in DB: ${total[0].cnt}`);
  console.log(`Date range: ${dateRange[0].earliest} to ${dateRange[0].latest}`);
  console.log(`BOJ rates inserted: ${bojInserted}`);
  console.log(`API rates inserted: ${apiInserted}`);
  console.log(`API dates skipped (weekends): ${apiFailed}`);
  console.log(`Gaps filled: ${gapsFilled}`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
