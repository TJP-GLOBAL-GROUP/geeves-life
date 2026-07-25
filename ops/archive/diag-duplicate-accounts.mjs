import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── 1. All oauth_tokens for tjperkinsfam ────────────────────────────────────
console.log('\n=== 1. oauth_tokens for tjperkinsfam.com (all) ===');
const [accounts] = await conn.query(`
  SELECT id, accountEmail, displayName, status, purposes, scopes, memberId, householdId, expiresAt, createdAt
  FROM oauth_tokens WHERE accountEmail LIKE '%tjperkinsfam%' ORDER BY createdAt ASC
`);
for (const a of accounts) {
  const scopeList = (a.scopes || '').split(' ').map(s => s.replace('https://www.googleapis.com/auth/', ''));
  console.log(`\n  ID:          ${a.id}`);
  console.log(`  email:       ${a.accountEmail}`);
  console.log(`  displayName: ${a.displayName}`);
  console.log(`  status:      ${a.status}`);
  console.log(`  memberId:    ${a.memberId}`);
  console.log(`  householdId: ${a.householdId}`);
  console.log(`  purposes:    ${JSON.stringify(a.purposes)}`);
  console.log(`  gmail.readonly: ${scopeList.includes('gmail.readonly')}`);
  console.log(`  scopes:      ${scopeList.join(', ')}`);
  console.log(`  expiresAt:   ${a.expiresAt ? new Date(a.expiresAt).toISOString() : 'null/0'}`);
  console.log(`  createdAt:   ${a.createdAt}`);
}

// ─── 2. Calendars linked to tjperkinsfam ─────────────────────────────────────
console.log('\n=== 2. Calendars linked to tjperkinsfam accountEmail ===');
const [cals] = await conn.query(`
  SELECT id, name, externalId, accountEmail, verticalId, memberId, isVisible, shadowBlocking, syncStatus, createdAt
  FROM calendars WHERE accountEmail LIKE '%tjperkinsfam%' ORDER BY accountEmail, createdAt ASC
`);
for (const c of cals) {
  console.log(`\n  calId: ${c.id} | name: ${c.name} | accountEmail: ${c.accountEmail}`);
  console.log(`  verticalId: ${c.verticalId} | memberId: ${c.memberId} | syncStatus: ${c.syncStatus}`);
}

// ─── 3. property_platforms using tjperkinsfam ────────────────────────────────
console.log('\n=== 3. property_platforms with notificationEmail = tjperkinsfam ===');
const [platforms] = await conn.query(`
  SELECT id, propertyId, platform, displayName, notificationEmail, emailScrapingEnabled, isActive, lastEmailScrapedAt
  FROM property_platforms WHERE notificationEmail LIKE '%tjperkinsfam%' ORDER BY displayName ASC
`);
console.table(platforms);

// ─── 4. email_scrape_jobs (last 20) ──────────────────────────────────────────
console.log('\n=== 4. email_scrape_jobs (last 20, all) ===');
const [allJobs] = await conn.query(`
  SELECT id, propertyId, emailAddress, status, errorMessage, startedAt, completedAt,
         emailsScanned, bookingsEnriched, bookingsCreated
  FROM email_scrape_jobs ORDER BY startedAt DESC LIMIT 20
`);
for (const j of allJobs) {
  console.log(`\n  jobId: ${j.id} | propertyId: ${j.propertyId} | email: ${j.emailAddress}`);
  console.log(`  status: ${j.status} | error: ${j.errorMessage ? j.errorMessage.substring(0, 100) : 'none'}`);
  console.log(`  emailsScanned: ${j.emailsScanned} | bookingsEnriched: ${j.bookingsEnriched} | bookingsCreated: ${j.bookingsCreated}`);
  console.log(`  startedAt: ${j.startedAt} | completedAt: ${j.completedAt}`);
}

// ─── 5. Enrichment stats ─────────────────────────────────────────────────────
console.log('\n=== 5. property_bookings enrichment field population stats ===');
const [stats] = await conn.query(`
  SELECT COUNT(*) as total,
    SUM(guestName IS NOT NULL) as hasGuestName,
    SUM(guestEmail IS NOT NULL) as hasGuestEmail,
    SUM(totalPrice IS NOT NULL) as hasTotalPrice,
    SUM(netAmount IS NOT NULL) as hasNetAmount
  FROM property_bookings
`);
console.table(stats);

// ─── 6. All tarik@ tokens ────────────────────────────────────────────────────
console.log('\n=== 6. All tarik@ oauth_tokens (delete behaviour audit) ===');
const [tarikAll] = await conn.query(`
  SELECT id, accountEmail, displayName, status, memberId, purposes, createdAt
  FROM oauth_tokens WHERE accountEmail LIKE 'tarik@%' ORDER BY accountEmail, createdAt ASC
`);
for (const a of tarikAll) {
  const scopeList = (a.scopes || '').split(' ').map(s => s.replace('https://www.googleapis.com/auth/', ''));
  console.log(`\n  ${a.accountEmail} | ${a.id} | status=${a.status} | memberId=${a.memberId} | displayName=${a.displayName} | purposes=${JSON.stringify(a.purposes)} | created=${a.createdAt}`);
}

await conn.end();
