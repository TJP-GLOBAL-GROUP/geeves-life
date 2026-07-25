/**
 * Backfill Spreadsheet with DB bookings
 * 
 * 1. Reads all 3 enhanced income tabs to get existing confirmation numbers
 * 2. Queries DB for all confirmed bookings with confirmation numbers
 * 3. Identifies bookings in DB but NOT in spreadsheet
 * 4. Appends missing bookings to the appropriate year tab
 * 
 * Spreadsheet columns (A-O):
 * Check-in | Check-out | Month | Property | Platform | Guest Name | Confirmation # | 
 * Nights | Gross Total (USD) | Tax Withheld | Commission | Net Payout (USD) | 
 * Cleaning Fee | Amount (JMD) | Source Doc Link
 */

import { google } from 'googleapis';
import mysql from 'mysql2/promise';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

// Property name mapping (DB name → spreadsheet name)
const PROPERTY_NAMES = {
  "The Artiste's Boutique": "The Artiste's Boutique",
  "Sunset Studio": "Sunset Studio",
  "Morabeza": "Morabeza",
  "Penthouse (Unit 1 - 2BR)": "Penthouse",
};

// Platform name mapping
const PLATFORM_NAMES = {
  'airbnb': 'Airbnb',
  'booking_com': 'Booking.com',
  'vrbo': 'VRBO',
  'direct': 'Direct',
};

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(Number(timestamp));
  // Format as M/D/YYYY
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function getMonth(timestamp) {
  if (!timestamp) return '';
  const d = new Date(Number(timestamp));
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[d.getUTCMonth()];
}

function getYear(timestamp) {
  if (!timestamp) return '';
  return new Date(Number(timestamp)).getUTCFullYear().toString();
}

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '';
  const diff = (Number(checkOut) - Number(checkIn)) / (1000 * 60 * 60 * 24);
  return Math.round(diff);
}

function formatCurrency(val) {
  if (val === null || val === undefined || val === 0) return '';
  return Number(val).toFixed(2);
}

async function main() {
  const pool = await mysql.createPool(process.env.DATABASE_URL);

  // Auth with service account — need write scope
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Step 1: Read all existing confirmation numbers from spreadsheet
  const existingConfirmations = new Set();
  for (const year of ['2024', '2025', '2026']) {
    const tabName = `${year} Income (Enhanced)`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!G2:G300`, // Column G = Confirmation #
    });
    const rows = response.data.values || [];
    for (const row of rows) {
      const conf = (row[0] || '').trim();
      if (conf && conf !== 'TOTAL' && conf !== 'Total') {
        existingConfirmations.add(conf);
      }
    }
  }
  console.log(`Existing spreadsheet confirmations: ${existingConfirmations.size}`);

  // Step 2: Get all DB bookings with confirmation numbers
  const [dbRows] = await pool.execute(`
    SELECT pb.confirmationNumber, pb.guestName, pb.checkIn, pb.checkOut,
           pb.totalPrice, pb.netAmount, pb.commissionAmount, pb.taxRemittedByPlatform,
           pb.cleaningFee, pb.currency, pb.sourceDocUrl, pb.financialSource,
           pp.platform, p.name as propertyName
    FROM property_bookings pb 
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pb.bookingStatus = 'confirmed'
      AND pb.confirmationNumber IS NOT NULL
      AND pb.confirmationNumber != ''
    ORDER BY pb.checkIn
  `);

  // Step 3: Find bookings in DB but NOT in spreadsheet
  const missing = [];
  for (const row of dbRows) {
    if (!existingConfirmations.has(row.confirmationNumber)) {
      missing.push(row);
    }
  }
  console.log(`DB bookings missing from spreadsheet: ${missing.length}`);

  // Step 4: Group by year and prepare rows
  const toAppend = { '2024': [], '2025': [], '2026': [] };
  let skippedNoYear = 0;

  for (const booking of missing) {
    const year = getYear(booking.checkIn);
    if (!toAppend[year]) {
      skippedNoYear++;
      continue;
    }

    const propertyName = PROPERTY_NAMES[booking.propertyName] || booking.propertyName;
    const platformName = PLATFORM_NAMES[booking.platform] || booking.platform;
    const nights = calculateNights(booking.checkIn, booking.checkOut);

    // Build row matching spreadsheet columns A-O
    const row = [
      formatDate(booking.checkIn),           // A: Check-in
      formatDate(booking.checkOut),          // B: Check-out
      getMonth(booking.checkIn),            // C: Month
      propertyName,                          // D: Property
      platformName,                          // E: Platform
      booking.guestName || '',              // F: Guest Name
      booking.confirmationNumber,           // G: Confirmation #
      nights.toString(),                    // H: Nights
      formatCurrency(booking.totalPrice),   // I: Gross Total (USD)
      formatCurrency(booking.taxRemittedByPlatform), // J: Tax Withheld
      formatCurrency(booking.commissionAmount),      // K: Commission
      formatCurrency(booking.netAmount),    // L: Net Payout (USD)
      formatCurrency(booking.cleaningFee),  // M: Cleaning Fee
      '',                                   // N: Amount (JMD) — leave empty
      booking.sourceDocUrl || '',           // O: Source Doc Link
    ];
    toAppend[year].push(row);
  }

  if (skippedNoYear > 0) {
    console.log(`Skipped ${skippedNoYear} bookings with years outside 2024-2026`);
  }

  // Step 5: Append to each tab
  for (const [year, rows] of Object.entries(toAppend)) {
    if (rows.length === 0) {
      console.log(`  ${year}: No rows to append`);
      continue;
    }

    const tabName = `${year} Income (Enhanced)`;
    console.log(`  ${year}: Appending ${rows.length} rows to "${tabName}"`);

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A:O`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });
      console.log(`    ✓ Done`);
    } catch (err) {
      console.error(`    ✗ ERROR: ${err.message}`);
    }
  }

  // Summary
  console.log('\n=== BACKFILL SUMMARY ===');
  console.log(`Total DB bookings with confirmation #: ${dbRows.length}`);
  console.log(`Already in spreadsheet: ${existingConfirmations.size}`);
  console.log(`Missing (to append): ${missing.length}`);
  for (const [year, rows] of Object.entries(toAppend)) {
    console.log(`  ${year}: ${rows.length} rows appended`);
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
