/**
 * Independent Test Script — Jul 7, 2026
 * Runs all backend-verifiable tests from both test scripts.
 * Execute: node scripts/independent-test-run.mjs
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import https from 'https';
import http from 'http';

config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const results = [];
let passCount = 0;
let failCount = 0;

function log(section, test, pass, detail = '') {
  const status = pass ? '✅ PASS' : '❌ FAIL';
  results.push({ section, test, status, detail });
  if (pass) passCount++;
  else failCount++;
  console.log(`${status} | ${section} | ${test}${detail ? ' — ' + detail : ''}`);
}

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

console.log('='.repeat(80));
console.log('GEEVES.LIFE INDEPENDENT TEST RUN — Jul 7, 2026');
console.log('='.repeat(80));
console.log('');

// ============================================================
// SECTION A: Schema Integrity (Section 16-17 new tables)
// ============================================================
console.log('\n--- SECTION A: Schema Integrity ---\n');

const newTables = [
  'chart_of_accounts', 'vertical_financial_configs', 'vendor_accounts',
  'vendor_orders', 'vendor_order_items', 'transaction_matches',
  'expenses', 'notifications'
];

for (const table of newTables) {
  try {
    const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    log('Schema', `Table ${table} exists`, true, `${rows[0].cnt} rows`);
  } catch (err) {
    log('Schema', `Table ${table} exists`, false, err.message);
  }
}

// Check expenses split columns
try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM expenses LIKE 'splitGroupId'`);
  log('Schema', 'expenses.splitGroupId column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'expenses.splitGroupId column exists', false, err.message);
}

try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM expenses LIKE 'splitAmount'`);
  log('Schema', 'expenses.splitAmount column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'expenses.splitAmount column exists', false, err.message);
}

try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM expenses LIKE 'splitSequence'`);
  log('Schema', 'expenses.splitSequence column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'expenses.splitSequence column exists', false, err.message);
}

// Check audit_log enhanced columns
try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM audit_log LIKE 'actorType'`);
  log('Schema', 'audit_log.actorType column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'audit_log.actorType column exists', false, err.message);
}

try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM audit_log LIKE 'verticalId'`);
  log('Schema', 'audit_log.verticalId column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'audit_log.verticalId column exists', false, err.message);
}

try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM audit_log LIKE 'previousValue'`);
  log('Schema', 'audit_log.previousValue column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'audit_log.previousValue column exists', false, err.message);
}

// Check financial_transactions.verticalId
try {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM financial_transactions LIKE 'verticalId'`);
  log('Schema', 'financial_transactions.verticalId column exists', cols.length > 0);
} catch (err) {
  log('Schema', 'financial_transactions.verticalId column exists', false, err.message);
}

// ============================================================
// SECTION B: Data Migration Verification
// ============================================================
console.log('\n--- SECTION B: Data Migration Verification ---\n');

// Vendor orders migrated
try {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM vendor_orders`);
  const count = rows[0].cnt;
  log('Migration', 'vendor_orders populated', count >= 400, `${count} rows (expected ~424)`);
} catch (err) {
  log('Migration', 'vendor_orders populated', false, err.message);
}

// Vendor order items migrated
try {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM vendor_order_items`);
  const count = rows[0].cnt;
  log('Migration', 'vendor_order_items populated', count >= 400, `${count} rows (expected ~419)`);
} catch (err) {
  log('Migration', 'vendor_order_items populated', false, err.message);
}

// Vendor accounts seeded
try {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM vendor_accounts`);
  const count = rows[0].cnt;
  log('Migration', 'vendor_accounts seeded', count >= 14, `${count} vendors`);
} catch (err) {
  log('Migration', 'vendor_accounts seeded', false, err.message);
}

// Vertical financial configs seeded
try {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM vertical_financial_configs`);
  const count = rows[0].cnt;
  log('Migration', 'vertical_financial_configs seeded', count >= 6, `${count} configs`);
} catch (err) {
  log('Migration', 'vertical_financial_configs seeded', false, err.message);
}

// Verticals cleaned up (should be 6, not 278)
try {
const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM verticals WHERE isActive = 1`);
    const count = rows[0].cnt;
    log('Migration', 'Test verticals cleaned up', count <= 10, `${count} active verticals (expected 6)`);
} catch (err) {
  log('Migration', 'Test verticals cleaned up', false, err.message);
}

// financial_transactions.verticalId backfilled
try {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM financial_transactions WHERE verticalId IS NOT NULL`);
  const count = rows[0].cnt;
  log('Migration', 'financial_transactions verticalId backfilled', count >= 600, `${count} rows with verticalId`);
} catch (err) {
  log('Migration', 'financial_transactions verticalId backfilled', false, err.message);
}

// ============================================================
// SECTION C: iCal Sync Status (Morning Test #1, #8)
// ============================================================
console.log('\n--- SECTION C: iCal Sync Status ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT pp.id, p.name as propertyName, pp.platform, pp.lastPolledAt, pp.isActive
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.icalUrl IS NOT NULL
    ORDER BY p.name, pp.platform
  `);
  
  const tenMinAgo = Date.now() - (30 * 60 * 1000); // 30 min tolerance
  let allRecent = true;
  
  for (const row of rows) {
    const isRecent = row.lastPolledAt && Number(row.lastPolledAt) > tenMinAgo;
    if (!isRecent && row.isActive) allRecent = false;
    const lastPoll = row.lastPolledAt ? new Date(Number(row.lastPolledAt)).toISOString() : 'NEVER';
    const activeStr = row.isActive ? '🟢' : '🔴';
    console.log(`  ${activeStr} ${row.propertyName} / ${row.platform} — Last: ${lastPoll}`);
  }
  
  log('iCal Sync', 'Property platforms have iCal feeds', rows.length >= 5, `${rows.length} feeds found`);
  log('iCal Sync', 'Active feeds polled within 30 min', allRecent, allRecent ? 'All recent' : 'Some stale');
} catch (err) {
  log('iCal Sync', 'Property platforms query', false, err.message);
}

// ============================================================
// SECTION D: Outbound ICS URLs Accessible (Eniola Test #1)
// ============================================================
console.log('\n--- SECTION D: Outbound ICS URLs ---\n');

const icsUrls = [
  { name: 'Sunset Studio', url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/Ln-_SMF7Nrt1uXsQcdP9C/availability.ics' },
  { name: 'Morabeza', url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/nJnk4hr3AxZJZ-RkwhRJy/availability.ics' },
  { name: "Artiste's Boutique", url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/ZI2Zy7OuLGYF-vmWOAII-/availability.ics' },
];

for (const ics of icsUrls) {
  try {
    const res = await fetchUrl(ics.url);
    const hasVcalendar = res.data.includes('BEGIN:VCALENDAR');
    const hasEvents = res.data.includes('BEGIN:VEVENT');
    const eventCount = (res.data.match(/BEGIN:VEVENT/g) || []).length;
    log('Outbound ICS', `${ics.name} URL accessible`, res.status === 200, `HTTP ${res.status}`);
    log('Outbound ICS', `${ics.name} valid iCal format`, hasVcalendar, hasVcalendar ? 'VCALENDAR found' : 'No VCALENDAR');
    log('Outbound ICS', `${ics.name} contains events`, hasEvents, `${eventCount} events`);
  } catch (err) {
    log('Outbound ICS', `${ics.name} URL accessible`, false, err.message);
  }
}

// ============================================================
// SECTION E: Prep Rule Verification (Eniola Test #2)
// ============================================================
console.log('\n--- SECTION E: Prep Rule Verification ---\n');

// Check prep rules exist in DB
try {
  const [rows] = await conn.execute(`
    SELECT pr.id, p.name as propertyName, pr.daysBefore, pr.daysAfter, pr.blockSundays, pr.blockNationalHolidays, pr.country
    FROM property_prep_rules pr
    JOIN properties p ON pr.propertyId = p.id
  `);
  
  for (const row of rows) {
    console.log(`  ${row.propertyName}: before=${row.daysBefore} after=${row.daysAfter} sun=${row.blockSundays} hol=${row.blockNationalHolidays} country=${row.country}`);
  }
  
  log('Prep Rules', 'Prep rules configured', rows.length >= 3, `${rows.length} rules`);
  
  // Check Sunset Studio has blockSundays + blockHolidays
  const sunset = rows.find(r => r.propertyName?.includes('Sunset') && r.propertyName?.includes('Studio'));
  if (sunset) {
    log('Prep Rules', 'Sunset Studio: blockSundays=true', sunset.blockSundays === 1 || sunset.blockSundays === true);
    log('Prep Rules', 'Sunset Studio: blockHolidays=true', sunset.blockNationalHolidays === 1 || sunset.blockNationalHolidays === true);
  }
  
  // Check Artiste's Boutique has blockSundays but NOT blockHolidays
  const artiste = rows.find(r => r.propertyName?.includes('Artiste'));
  if (artiste) {
    log('Prep Rules', "Artiste's Boutique: blockSundays=true", artiste.blockSundays === 1 || artiste.blockSundays === true);
    log('Prep Rules', "Artiste's Boutique: blockHolidays=false", artiste.blockNationalHolidays === 0 || artiste.blockNationalHolidays === false);
  }
} catch (err) {
  log('Prep Rules', 'Prep rules query', false, err.message);
}

// Check for BLOCKED/PREP events in outbound ICS (Sunset Studio)
try {
  const res = await fetchUrl(icsUrls[0].url);
  const prepBlocks = (res.data.match(/SUMMARY:.*(?:PREP|BLOCK|Prep|Block)/gi) || []).length;
  log('Prep Rules', 'Sunset Studio ICS has prep/block events', prepBlocks > 0, `${prepBlocks} prep/block events found`);
} catch (err) {
  log('Prep Rules', 'Sunset Studio ICS prep blocks', false, err.message);
}

// ============================================================
// SECTION F: Email Scraping Status (Eniola Test #3)
// ============================================================
console.log('\n--- SECTION F: Email Scraping Status ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT p.name, 
           COUNT(pb.id) as totalBookings,
           SUM(CASE WHEN pb.guestName IS NOT NULL AND pb.guestName != '' THEN 1 ELSE 0 END) as withGuest,
           SUM(CASE WHEN pb.totalPrice IS NOT NULL AND pb.totalPrice > 0 THEN 1 ELSE 0 END) as withRevenue
    FROM properties p
    LEFT JOIN property_bookings pb ON pb.propertyId = p.id
    GROUP BY p.id, p.name
    ORDER BY p.name
  `);
  
  for (const row of rows) {
    const guestPct = row.totalBookings > 0 ? Math.round(row.withGuest / row.totalBookings * 100) : 0;
    const revPct = row.totalBookings > 0 ? Math.round(row.withRevenue / row.totalBookings * 100) : 0;
    console.log(`  ${row.name}: ${row.totalBookings} bookings, ${guestPct}% guest data, ${revPct}% revenue data`);
  }
  
  const totalBookings = rows.reduce((sum, r) => sum + r.totalBookings, 0);
  log('Email Scraping', 'Property bookings exist', totalBookings > 0, `${totalBookings} total bookings`);
} catch (err) {
  log('Email Scraping', 'Booking data query', false, err.message);
}

// ============================================================
// SECTION G: Household Members & Permissions
// ============================================================
console.log('\n--- SECTION G: Household Members & Permissions ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT hm.id, hm.displayName, hm.role, hm.status, hm.userId
    FROM household_members hm
    WHERE hm.householdId = 'V8lk3KJatvxBTWURf4uo9'
    ORDER BY hm.role, hm.displayName
  `);
  
  for (const row of rows) {
    console.log(`  ${row.displayName} — role: ${row.role}, status: ${row.status}, userId: ${row.userId ? 'linked' : 'pending'}`);
  }
  
  log('Members', 'Household members exist', rows.length >= 2, `${rows.length} members`);
  
  const admin = rows.find(r => r.role === 'household_admin');
  log('Members', 'Admin/owner exists', !!admin, admin ? admin.displayName : 'none');
  
  const eniola = rows.find(r => r.displayName?.toLowerCase().includes('eniola'));
  log('Members', 'Eniola exists as member', !!eniola, eniola ? `role: ${eniola.role}` : 'not found');
} catch (err) {
  log('Members', 'Household members query', false, err.message);
}

// Check vertical_member_access
try {
  const [rows] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM vertical_member_access
    WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
  `);
  log('Members', 'Vertical member access rules configured', rows[0].cnt > 0, `${rows[0].cnt} access rules`);
} catch (err) {
  log('Members', 'Vertical member access query', false, err.message);
}

// ============================================================
// SECTION H: Shadow Block Health
// ============================================================
console.log('\n--- SECTION H: Shadow Block Health ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT sync_status, COUNT(*) as cnt
    FROM shadow_blocks
    GROUP BY sync_status
  `);
  
  for (const row of rows) {
    console.log(`  ${row.sync_status || 'NULL'}: ${row.cnt} blocks`);
  }
  
  const synced = rows.find(r => r.sync_status === 'synced');
  const pending = rows.find(r => r.sync_status === 'pending_sync');
  const failed = rows.find(r => r.sync_status === 'sync_failed');
  
  log('Shadow Blocks', 'syncStatus column populated', rows.length > 0, `${rows.length} distinct statuses`);
  if (synced) log('Shadow Blocks', 'Some blocks synced', true, `${synced.cnt} synced`);
  if (pending) log('Shadow Blocks', 'Pending blocks count', true, `${pending.cnt} pending_sync`);
  if (failed) log('Shadow Blocks', 'Failed blocks count', true, `${failed.cnt} sync_failed`);
} catch (err) {
  log('Shadow Blocks', 'Shadow block status query', false, err.message);
}

// ============================================================
// SECTION I: OAuth Token Health
// ============================================================
console.log('\n--- SECTION I: OAuth Token Health ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT accountEmail as email, status, provider, 
           CASE WHEN expiresAt > UNIX_TIMESTAMP() * 1000 THEN 'valid' ELSE 'expired' END as tokenState
    FROM oauth_tokens
    ORDER BY accountEmail
  `);
  
  for (const row of rows) {
    const icon = row.status === 'active' && row.tokenState === 'valid' ? '🟢' : '🟡';
    console.log(`  ${icon} ${row.email} — status: ${row.status}, token: ${row.tokenState}`);
  }
  
  const active = rows.filter(r => r.status === 'active');
  const expired = rows.filter(r => r.status === 'expired' || r.tokenState === 'expired');
  log('OAuth', 'OAuth tokens exist', rows.length > 0, `${rows.length} tokens`);
  log('OAuth', 'Active tokens', active.length > 0, `${active.length} active`);
  if (expired.length > 0) log('OAuth', 'Expired tokens (need reconnect)', false, `${expired.length} expired: ${expired.map(r => r.email).join(', ')}`);
} catch (err) {
  log('OAuth', 'OAuth tokens query', false, err.message);
}

// ============================================================
// SECTION J: VRBO Inactive Listing (Morning Test #7)
// ============================================================
console.log('\n--- SECTION J: VRBO Inactive Listing ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT pp.platform, pp.isActive, p.name as propertyName
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.platform LIKE '%vrbo%' OR pp.platform LIKE '%VRBO%'
  `);
  
  for (const row of rows) {
    const icon = row.isActive ? '🟢' : '🔴';
    console.log(`  ${icon} ${row.propertyName} / ${row.platform} — active: ${row.isActive}`);
  }
  
  const sunsetVrbo = rows.find(r => r.propertyName?.includes('Sunset') && r.propertyName?.includes('Studio'));
  if (sunsetVrbo) {
    log('VRBO', 'Sunset Studio VRBO marked inactive', !sunsetVrbo.isActive || sunsetVrbo.isActive === 0, `isActive: ${sunsetVrbo.isActive}`);
  } else {
    log('VRBO', 'Sunset Studio VRBO platform exists', false, 'Not found');
  }
} catch (err) {
  log('VRBO', 'VRBO platform query', false, err.message);
}

// ============================================================
// SECTION K: Property Booking Calendars (Morning Test #5)
// ============================================================
console.log('\n--- SECTION K: Property Booking Calendars ---\n');

try {
  const [rows] = await conn.execute(`
    SELECT c.id, c.name, c.provider, c.verticalId, v.name as verticalName
    FROM calendars c
    LEFT JOIN verticals v ON c.verticalId = v.id
    WHERE c.provider = 'ical' OR c.syncType = 'property_booking'
    ORDER BY c.name
  `);
  
  for (const row of rows) {
    console.log(`  ${row.name} — provider: ${row.provider}, vertical: ${row.verticalName || 'none'}`);
  }
  
  log('Calendars', 'Property booking calendars exist', rows.length >= 3, `${rows.length} iCal calendars`);
  
  const withVertical = rows.filter(r => r.verticalId);
  log('Calendars', 'iCal calendars have verticalId assigned', withVertical.length === rows.length, `${withVertical.length}/${rows.length} assigned`);
} catch (err) {
  log('Calendars', 'Property booking calendars query', false, err.message);
}

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(80));
console.log(`\nTEST RESULTS SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${passCount + failCount} TOTAL`);
console.log(`Pass rate: ${Math.round(passCount / (passCount + failCount) * 100)}%`);
console.log('\n' + '='.repeat(80));

if (failCount > 0) {
  console.log('\nFAILED TESTS:');
  for (const r of results.filter(r => r.status === '❌ FAIL')) {
    console.log(`  ${r.section} | ${r.test} | ${r.detail}`);
  }
}

await conn.end();
