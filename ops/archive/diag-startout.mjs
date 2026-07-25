import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. All calendars for the startout account
const [cals] = await conn.query(
  `SELECT id, name, accountEmail, verticalId, accessLevel, shadowBlocking, isPrimary, color
   FROM calendars WHERE accountEmail LIKE '%startout%' ORDER BY name`
);
console.log('=== startout calendars ===');
for (const r of cals) console.log(JSON.stringify(r));

// 2. All verticals for this household (to understand the full vertical map)
const [verts] = await conn.query(
  `SELECT id, name, householdId, privacyLevel, busyLabel, color FROM verticals ORDER BY name LIMIT 30`
);
console.log('\n=== all verticals ===');
for (const r of verts) console.log(JSON.stringify(r));

// 3. Vertical visibility rules — what is configured to propagate TO
const [rules] = await conn.query(
  `SELECT id, fromVerticalId, toVerticalId, visibilityLevel, busyLabel, calendarExclusions
   FROM vertical_visibility ORDER BY fromVerticalId`
);
console.log('\n=== vertical_visibility rules ===');
for (const r of rules) console.log(JSON.stringify(r));

// 4. Shadow blocks that landed on any startout calendar
const [sbs] = await conn.query(
  `SELECT sb.id, sb.targetCalendarId, sb.sourceCalendarId, sb.sourceEventId,
          sb.maskedTitle, sb.startTime, sb.endTime, sb.createdAt,
          c.name AS targetCalName, c.accountEmail AS targetEmail
   FROM shadow_blocks sb
   JOIN calendars c ON c.id = sb.targetCalendarId
   WHERE c.accountEmail LIKE '%startout%'
   ORDER BY sb.createdAt DESC LIMIT 20`
);
console.log('\n=== shadow_blocks on startout calendars (last 20) ===');
for (const r of sbs) console.log(JSON.stringify(r));

// 5. Source calendars for those shadow blocks
if (sbs.length > 0) {
  const sourceIds = [...new Set(sbs.map(r => r.sourceCalendarId))];
  const placeholders = sourceIds.map(() => '?').join(',');
  const [srcs] = await conn.query(
    `SELECT id, name, accountEmail, verticalId FROM calendars WHERE id IN (${placeholders})`,
    sourceIds
  );
  console.log('\n=== source calendars for those shadow blocks ===');
  for (const r of srcs) console.log(JSON.stringify(r));
}

await conn.end();
