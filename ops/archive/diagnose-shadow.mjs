import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: +m[4], user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

console.log('\n=== CALENDARS ===');
const [cals] = await conn.query(`
  SELECT c.id, c.name, c.provider, c.verticalId, c.externalId IS NOT NULL AS hasExt,
         MAX(IF(wc.status='active', wc.id, NULL)) AS activeChannel,
         MAX(IF(wc.status='active', wc.expiresAt, NULL)) AS channelExpiry
  FROM calendars c
  LEFT JOIN webhook_channels wc ON wc.calendarId = c.id
  GROUP BY c.id, c.name, c.provider, c.verticalId, hasExt
  ORDER BY c.name
`);
for (const r of cals) {
  const exp = r.channelExpiry ? new Date(Number(r.channelExpiry)).toISOString() : 'none';
  console.log(`  ${r.name.padEnd(40)} vertical=${String(r.verticalId||'').padEnd(25)} webhook=${r.activeChannel?'YES':'NO '} expires=${exp} hasExt=${r.hasExt}`);
}

console.log('\n=== WEBHOOK CHANNELS ===');
const [wcs] = await conn.query(`SELECT id, calendarId, status, expiresAt, resourceId FROM webhook_channels ORDER BY status, expiresAt DESC LIMIT 20`);
for (const w of wcs) {
  const exp = w.expiresAt ? new Date(Number(w.expiresAt)).toISOString() : 'none';
  console.log(`  ${w.id.padEnd(40)} cal=${w.calendarId.padEnd(25)} status=${w.status} expires=${exp}`);
}

console.log('\n=== SHADOW BLOCKS (last 10) ===');
const [sbs] = await conn.query(`
  SELECT sb.id, sb.sourceEventId, sb.sourceCalendarId, sb.targetCalendarId, sb.maskedTitle, sb.isDismissed,
         e.title AS eventTitle, e.startTime
  FROM shadow_blocks sb
  JOIN events e ON e.id = sb.sourceEventId
  ORDER BY e.startTime DESC LIMIT 10
`);
for (const s of sbs) {
  console.log(`  event="${s.eventTitle}" src=${s.sourceCalendarId.substring(0,12)} → tgt=${s.targetCalendarId.substring(0,12)} masked="${s.maskedTitle}" dismissed=${s.isDismissed}`);
}

console.log('\n=== EVENTS WITH "Test A" ===');
const [tevts] = await conn.query(`SELECT id, title, calendarId, startTime, externalId FROM events WHERE title LIKE '%Test%' ORDER BY startTime DESC LIMIT 10`);
for (const e of tevts) {
  console.log(`  id=${e.id} title="${e.title}" cal=${e.calendarId} start=${new Date(Number(e.startTime)).toISOString()}`);
}

await conn.end();
