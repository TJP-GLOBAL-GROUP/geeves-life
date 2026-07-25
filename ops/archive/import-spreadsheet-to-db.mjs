/**
 * Import spreadsheet data → DB
 * 
 * 1. Reads all 3 enhanced income tabs (2024, 2025, 2026)
 * 2. For each row with a confirmation number, finds matching property_bookings row
 * 3. Updates: sourceDocUrl, taxRemittedByPlatform, cleaningFee
 * 4. Inserts 2 missing bookings (HMMXW8WFK4 and 3890454)
 * 
 * Headers: Check-in | Check-out | Month | Property | Platform | Guest Name | Confirmation # | 
 *          Nights | Gross Total (USD) | Tax Withheld | Commission | Net Payout (USD) | 
 *          Cleaning Fee | Amount (JMD) | Source Doc Link
 * Columns: A(0)     B(1)       C(2)    D(3)       E(4)       F(5)         G(6)
 *          H(7)     I(8)                J(9)         K(10)       L(11)
 *          M(12)         N(13)          O(14)
 */

import { google } from 'googleapis';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

function generateId() {
  return crypto.randomBytes(16).toString('hex').slice(0, 21);
}

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function parseNum(val) {
  if (!val) return null;
  const cleaned = String(val).replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function main() {
  const pool = await mysql.createPool(process.env.DATABASE_URL);

  // Auth with service account
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;
  let sourceDocUpdated = 0;
  let taxUpdated = 0;
  let cleaningFeeUpdated = 0;

  for (const year of ['2024', '2025', '2026']) {
    const tabName = `${year} Income (Enhanced)`;
    console.log(`\n=== Reading ${tabName} ===`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1:O300`,
    });
    
    const rows = response.data.values || [];
    if (rows.length < 2) {
      console.log('  No data rows found');
      continue;
    }

    // Log headers for verification
    const headers = rows[0];
    console.log('  Headers:', headers.join(' | '));
    
    const dataRows = rows.slice(1);
    console.log(`  Data rows: ${dataRows.length}`);

    for (const row of dataRows) {
      const confirmationNumber = (row[6] || '').trim();
      if (!confirmationNumber || confirmationNumber === 'TOTAL' || confirmationNumber === 'Total' || confirmationNumber === '') continue;

      const sourceDocUrl = (row[14] || '').trim() || null;
      const taxWithheld = parseNum(row[9]);
      const cleaningFee = parseNum(row[12]);
      const guestName = (row[5] || '').trim();
      const property = (row[3] || '').trim();
      const platform = (row[4] || '').trim();

      // Find matching booking in DB
      const [matches] = await pool.execute(
        'SELECT id, financialSource, taxRemittedByPlatform, cleaningFee, sourceDocUrl FROM property_bookings WHERE confirmationNumber = ? LIMIT 1',
        [confirmationNumber]
      );

      if (matches.length === 0) {
        totalNotFound++;
        console.log(`  NOT FOUND: ${confirmationNumber} (${guestName}, ${property}, ${platform})`);
        continue;
      }

      const booking = matches[0];
      const updates = [];
      const params = [];

      // Update sourceDocUrl if we have one and DB doesn't
      if (sourceDocUrl && !booking.sourceDocUrl) {
        updates.push('sourceDocUrl = ?');
        params.push(sourceDocUrl);
        sourceDocUpdated++;
      }

      // Update taxRemittedByPlatform if we have it and DB doesn't (or DB has null)
      // NEVER overwrite platform_export data
      if (taxWithheld !== null && (booking.taxRemittedByPlatform === null || booking.taxRemittedByPlatform === undefined || parseFloat(booking.taxRemittedByPlatform) === 0)) {
        if (booking.financialSource !== 'platform_export') {
          updates.push('taxRemittedByPlatform = ?');
          params.push(taxWithheld);
          taxUpdated++;
        }
      }

      // Update cleaningFee if we have it and DB doesn't
      if (cleaningFee !== null && (booking.cleaningFee === null || booking.cleaningFee === undefined || parseFloat(booking.cleaningFee) === 0)) {
        if (booking.financialSource !== 'platform_export') {
          updates.push('cleaningFee = ?');
          params.push(cleaningFee);
          cleaningFeeUpdated++;
        }
      }

      if (updates.length > 0) {
        params.push(booking.id);
        await pool.execute(
          `UPDATE property_bookings SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  console.log('\n=== IMPORT SUMMARY ===');
  console.log(`Updated: ${totalUpdated} bookings`);
  console.log(`  - Source doc URLs added: ${sourceDocUpdated}`);
  console.log(`  - Tax withheld values added: ${taxUpdated}`);
  console.log(`  - Cleaning fees added: ${cleaningFeeUpdated}`);
  console.log(`Skipped (no changes needed): ${totalSkipped}`);
  console.log(`Not found in DB: ${totalNotFound}`);

  // === PART 2: Insert 2 missing bookings ===
  console.log('\n=== INSERTING MISSING BOOKINGS ===');

  // First, get property and platform IDs
  const [properties] = await pool.execute('SELECT id, name FROM properties');
  const propMap = {};
  for (const p of properties) {
    propMap[p.name] = p.id;
  }
  console.log('Properties:', Object.keys(propMap).join(', '));

  // Get platform IDs
  const [platforms] = await pool.execute('SELECT id, platform, propertyId FROM property_platforms');
  
  // 1. HMMXW8WFK4 — Swagatika, Artiste's Boutique, Airbnb, May 24-26, 2024, Net $257.05
  const artisteId = Object.entries(propMap).find(([name]) => name.toLowerCase().includes('artiste'))?.[1];
  const artisteAirbnb = platforms.find(p => p.propertyId === artisteId && p.platform === 'airbnb');
  
  if (artisteAirbnb) {
    // Check if already exists
    const [existing] = await pool.execute(
      'SELECT id FROM property_bookings WHERE confirmationNumber = ?',
      ['HMMXW8WFK4']
    );
    if (existing.length === 0) {
      // checkIn/checkOut are bigint (ms since epoch)
      const checkIn1 = new Date('2024-05-24T00:00:00Z').getTime();
      const checkOut1 = new Date('2024-05-26T00:00:00Z').getTime();
      await pool.execute(
        `INSERT INTO property_bookings (id, propertyId, platformId, guestName, confirmationNumber, 
         checkIn, checkOut, totalPrice, netAmount, commissionAmount, taxRemittedByPlatform, 
         currency, bookingStatus, financialSource, sourceDocUrl, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          generateId(), artisteId, artisteAirbnb.id,
          'Swagatika', 'HMMXW8WFK4',
          checkIn1, checkOut1,
          330.00, 257.05, 49.50, 23.45,
          'USD', 'confirmed', 'manual',
          'https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/artistes-boutique/income-docs/20240312_airbnb_bank_deposit_331usd.pdf'
        ]
      );
      console.log('  INSERTED: HMMXW8WFK4 (Swagatika, Artiste\'s Boutique, Airbnb, May 24-26 2024)');
    } else {
      console.log('  SKIPPED: HMMXW8WFK4 already exists');
    }
  } else {
    console.log('  ERROR: Could not find Artiste\'s Boutique Airbnb platform');
  }

  // 2. 3890454 — Kimberly Joseph, Sunset Studio, VRBO, Aug 23-25, 2024, Net $251.75
  const sunsetId = Object.entries(propMap).find(([name]) => name.toLowerCase().includes('sunset'))?.[1];
  const sunsetVrbo = platforms.find(p => p.propertyId === sunsetId && p.platform === 'vrbo');

  if (sunsetVrbo) {
    const [existing] = await pool.execute(
      'SELECT id FROM property_bookings WHERE confirmationNumber = ?',
      ['3890454']
    );
    if (existing.length === 0) {
      const checkIn2 = new Date('2024-08-23T00:00:00Z').getTime();
      const checkOut2 = new Date('2024-08-25T00:00:00Z').getTime();
      await pool.execute(
        `INSERT INTO property_bookings (id, propertyId, platformId, guestName, confirmationNumber,
         checkIn, checkOut, totalPrice, netAmount, commissionAmount, taxRemittedByPlatform,
         currency, bookingStatus, financialSource, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          generateId(), sunsetId, sunsetVrbo.id,
          'Kimberly Joseph', '3890454',
          checkIn2, checkOut2,
          302.00, 251.75, 13.25, 37.00,
          'USD', 'confirmed', 'manual'
        ]
      );
      console.log('  INSERTED: 3890454 (Kimberly Joseph, Sunset Studio, VRBO, Aug 23-25 2024)');
    } else {
      console.log('  SKIPPED: 3890454 already exists');
    }
  } else {
    console.log('  ERROR: Could not find Sunset Studio VRBO platform');
  }

  // Final count
  const [finalCount] = await pool.execute('SELECT COUNT(*) as total FROM property_bookings WHERE bookingStatus = "confirmed"');
  console.log(`\n=== FINAL: ${finalCount[0].total} confirmed bookings in DB ===`);

  await pool.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
