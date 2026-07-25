import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cals] = await conn.query(`
  SELECT id, name, accountEmail, externalId, provider, syncType, accessLevel,
         shadowBlocking, shadowSource, noGoogleWrite
  FROM calendars
  ORDER BY accountEmail, name
`);

console.log('Total calendars:', cals.length);

const categories = {
  googleGroup: [],   // group.v.calendar.google.com — read-only Google-managed
  icalFeed: [],      // iCal/webcal feeds — read-only external feeds
  googleShared: [],  // group.calendar.google.com — shared Google calendars
  googlePersonal: [], // personal Google calendars (writable)
  property: [],      // property booking calendars
  other: [],
};

for (const c of cals) {
  const ext = c.externalId || '';
  const prov = c.provider || '';
  const sync = c.syncType || '';
  if (ext.includes('group.v.calendar.google.com')) {
    categories.googleGroup.push(c);
  } else if (sync === 'ical' || ext.startsWith('http') || ext.startsWith('webcal')) {
    categories.icalFeed.push(c);
  } else if (ext.includes('group.calendar.google.com')) {
    categories.googleShared.push(c);
  } else if (prov === 'google' && ext.includes('@')) {
    categories.googlePersonal.push(c);
  } else if (prov === 'property' || sync === 'property' || c.name?.includes('Booking')) {
    categories.property.push(c);
  } else {
    categories.other.push(c);
  }
}

const RISKY_CATS = ['icalFeed', 'googleGroup', 'googleShared'];

for (const [cat, items] of Object.entries(categories)) {
  if (items.length === 0) continue;
  console.log(`\n--- ${cat.toUpperCase()} (${items.length}) ---`);
  for (const c of items) {
    const flags = `blocking=${c.shadowBlocking} source=${c.shadowSource} noWrite=${c.noGoogleWrite} access=${c.accessLevel}`;
    const isRisky = (c.shadowBlocking || c.shadowSource) && !c.noGoogleWrite && RISKY_CATS.includes(cat);
    const prefix = isRisky ? '[RISKY] ' : '        ';
    console.log(`  ${prefix}${(c.name || '').substring(0, 45).padEnd(45)} | ${flags}`);
    if (isRisky) console.log(`           externalId: ${(c.externalId || '').substring(0, 80)}`);
  }
}

// Summary of risky calendars
const risky = cals.filter(c => {
  const ext = c.externalId || '';
  const sync = c.syncType || '';
  const isReadOnlyType = ext.includes('group.v.calendar.google.com') ||
    ext.includes('group.calendar.google.com') ||
    sync === 'ical' || ext.startsWith('http') || ext.startsWith('webcal');
  return isReadOnlyType && (c.shadowBlocking || c.shadowSource) && !c.noGoogleWrite;
});

console.log(`\n=== RISKY CALENDARS NEEDING FIX: ${risky.length} ===`);
for (const c of risky) {
  console.log(`  ${c.id} | ${c.name} | blocking=${c.shadowBlocking} source=${c.shadowSource}`);
}

await conn.end();
