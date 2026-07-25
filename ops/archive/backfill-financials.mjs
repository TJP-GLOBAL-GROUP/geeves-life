/**
 * Backfill script: reconcile airbnb_payout_records with property_bookings
 * Sets financialSource = 'platform_export' on matched records
 * Calculates taxRemittedByPlatform from airbnbRemittedTax
 * Sets taxOwedByHost based on jurisdiction
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

// 1. Check current state
const [payoutSummary] = await conn.execute(`
  SELECT property, earningsYear, COUNT(*) as cnt, 
    SUM(CASE WHEN confirmationCode IS NOT NULL AND confirmationCode != '' THEN 1 ELSE 0 END) as with_conf,
    recordType
  FROM airbnb_payout_records 
  GROUP BY property, earningsYear, recordType 
  ORDER BY property, earningsYear, recordType
`);
console.log('=== Airbnb Payout Records Summary ===');
console.table(payoutSummary);

// 2. Get reservation records with confirmation codes
const [reservations] = await conn.execute(`
  SELECT id, property, confirmationCode, startDate, endDate, nights, guestName,
    amount, serviceFee, cleaningFee, grossEarnings, airbnbRemittedTax, paidOut
  FROM airbnb_payout_records 
  WHERE recordType = 'Reservation' AND confirmationCode IS NOT NULL AND confirmationCode != ''
  ORDER BY property, startDate
`);
console.log(`\n=== ${reservations.length} Reservation records with confirmation codes ===`);

// 3. Get all property_bookings
const [bookings] = await conn.execute(`
  SELECT id, propertyId, confirmationNumber, checkIn, checkOut, totalPrice, netAmount, 
    commissionAmount, financialSource, guestName
  FROM property_bookings 
  WHERE bookingStatus = 'confirmed'
  ORDER BY propertyId, checkIn
`);
console.log(`=== ${bookings.length} confirmed property_bookings ===`);

// 4. Get property mapping (property enum -> propertyId)
const [properties] = await conn.execute(`
  SELECT id, name FROM properties
`);
console.log('\n=== Properties ===');
console.table(properties);

// Map property enum names to property IDs
const propertyNameToId = {};
for (const p of properties) {
  const name = p.name.toLowerCase();
  if (name.includes('artiste') || name.includes('boutique')) propertyNameToId['artistes_boutique'] = p.id;
  if (name.includes('morabeza') || name.includes('penthouse') || name.includes('apt 1') || name.includes('apartment 1')) propertyNameToId['morabeza'] = p.id;
  if (name.includes('sunset') || name.includes('studio') || name.includes('apt 2') || name.includes('apartment 2')) propertyNameToId['sunset_studio'] = p.id;
}
console.log('\nProperty mapping:', propertyNameToId);

// 5. Match and update
let matched = 0;
let unmatched = 0;
const unmatchedList = [];

for (const res of reservations) {
  const propertyId = propertyNameToId[res.property];
  if (!propertyId) {
    console.log(`  No property mapping for: ${res.property}`);
    unmatched++;
    continue;
  }

  // Try to match by confirmation code first
  let booking = bookings.find(b => 
    b.propertyId === propertyId && 
    b.confirmationNumber === res.confirmationCode
  );

  // If no match by confirmation, try by date overlap + property
  if (!booking && res.startDate && res.endDate) {
    const startTs = new Date(res.startDate).getTime();
    const endTs = new Date(res.endDate).getTime();
    booking = bookings.find(b => 
      b.propertyId === propertyId &&
      Math.abs(b.checkIn - startTs) < 86400000 && // within 1 day
      Math.abs(b.checkOut - endTs) < 86400000
    );
  }

  if (booking) {
    // Calculate tax fields
    const taxRemitted = res.airbnbRemittedTax ? parseFloat(res.airbnbRemittedTax) : null;
    const grossEarnings = res.grossEarnings ? parseFloat(res.grossEarnings) : null;
    const serviceFee = res.serviceFee ? parseFloat(res.serviceFee) : null;
    const netPayout = res.paidOut ? parseFloat(res.paidOut) : (res.amount ? parseFloat(res.amount) : null);
    
    // Determine jurisdiction based on property
    let taxJurisdiction = 'NONE';
    let taxOwedByHost = 0;
    if (res.property === 'artistes_boutique') {
      // Jamaica: GART 10% + $1/night (in JMD, but we'll note it)
      taxJurisdiction = 'JM_GART';
      // For Jamaica, tax owed = 10% of gross + $1 USD equivalent per night
      if (grossEarnings && res.nights) {
        taxOwedByHost = grossEarnings * 0.10 + (res.nights * 1.0);
      }
    } else {
      // US properties: Airbnb remits occupancy tax
      taxJurisdiction = 'NY_OCCUPANCY';
      taxOwedByHost = 0; // Platform remits
    }

    // Update the booking
    await conn.execute(`
      UPDATE property_bookings SET
        totalPrice = COALESCE(?, totalPrice),
        commissionAmount = COALESCE(?, commissionAmount),
        netAmount = COALESCE(?, netAmount),
        taxRemittedByPlatform = ?,
        taxOwedByHost = ?,
        taxJurisdiction = ?,
        financialSource = 'platform_export'
      WHERE id = ?
    `, [
      grossEarnings,
      serviceFee ? Math.abs(serviceFee) : null,
      netPayout,
      taxRemitted ? Math.abs(taxRemitted) : 0,
      taxOwedByHost,
      taxJurisdiction,
      booking.id
    ]);
    matched++;
  } else {
    unmatched++;
    unmatchedList.push({
      property: res.property,
      confirmation: res.confirmationCode,
      guest: res.guestName,
      start: res.startDate,
      end: res.endDate,
      amount: res.amount
    });
  }
}

console.log(`\n=== Backfill Results ===`);
console.log(`Matched & updated: ${matched}`);
console.log(`Unmatched: ${unmatched}`);
if (unmatchedList.length > 0 && unmatchedList.length <= 20) {
  console.log('\nUnmatched reservations:');
  console.table(unmatchedList);
}

// 6. Also mark any existing bookings that have email-scraped financial data
const [emailScraped] = await conn.execute(`
  UPDATE property_bookings 
  SET financialSource = 'email_scrape' 
  WHERE financialSource IS NULL 
    AND (totalPrice IS NOT NULL OR netAmount IS NOT NULL)
    AND emailScrapeSource IS NOT NULL
`);
console.log(`\nMarked ${emailScraped.affectedRows} email-scraped bookings with financialSource='email_scrape'`);

// 7. Mark remaining bookings with financial data but no source as 'manual'
const [manual] = await conn.execute(`
  UPDATE property_bookings 
  SET financialSource = 'manual' 
  WHERE financialSource IS NULL 
    AND (totalPrice IS NOT NULL OR netAmount IS NOT NULL)
    AND emailScrapeSource IS NULL
`);
console.log(`Marked ${manual.affectedRows} bookings with financialSource='manual'`);

await conn.end();
console.log('\nDone!');
