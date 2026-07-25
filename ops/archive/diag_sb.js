const mysql = require('/home/ubuntu/geeves-shopping/node_modules/mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 8000 });

  // 1. eniola@tjperkinsfam.com calendars
  const [eniola] = await conn.execute(
    `SELECT c.id, c.name, c.accountEmail, c.shadowBlocking, c.shadowSource, c.accessLevel,
            (SELECT COUNT(*) FROM shadow_blocks sb WHERE sb.targetCalendarId = c.id) as sb_target,
            (SELECT COUNT(*) FROM shadow_blocks sb WHERE sb.sourceCalendarId = c.id) as sb_source
     FROM calendars c WHERE c.accountEmail = 'eniola@tjperkinsfam.com' ORDER BY sb_target DESC`
  );
  console.log('=== eniola@tjperkinsfam.com ===');
  eniola.forEach(r => console.log(JSON.stringify({id:r.id,name:r.name,blocking:r.shadowBlocking,source:r.shadowSource,access:r.accessLevel,sb_target:Number(r.sb_target),sb_source:Number(r.sb_source)})));

  // 2. StartOut primary — what are the 14k SBs targeting?
  const [sbSample] = await conn.execute(
    `SELECT sb.targetCalendarId, tc.name as targetName, tc.accountEmail as targetEmail,
            COUNT(*) as cnt
     FROM shadow_blocks sb
     JOIN calendars tc ON tc.id = sb.targetCalendarId
     WHERE sb.sourceCalendarId = 'S6TrhZoBJZdG5W-EiV5hL'
     GROUP BY sb.targetCalendarId, tc.name, tc.accountEmail
     ORDER BY cnt DESC LIMIT 15`
  );
  console.log('\n=== StartOut primary — SBs by target ===');
  sbSample.forEach(r => console.log(JSON.stringify({targetId:r.targetCalendarId,targetName:r.targetName,targetEmail:r.targetEmail,count:Number(r.cnt)})));

  // 3. What sources are targeting eniola@tjperkinsfam.com?
  const [eniolaTargeted] = await conn.execute(
    `SELECT sb.sourceCalendarId, sc.name as srcName, sc.accountEmail as srcEmail,
            COUNT(*) as cnt
     FROM shadow_blocks sb
     JOIN calendars sc ON sc.id = sb.sourceCalendarId
     WHERE sb.targetCalendarId IN (SELECT id FROM calendars WHERE accountEmail='eniola@tjperkinsfam.com')
     GROUP BY sb.sourceCalendarId, sc.name, sc.accountEmail
     ORDER BY cnt DESC LIMIT 15`
  );
  console.log('\n=== SBs targeting eniola@tjperkinsfam.com — by source ===');
  eniolaTargeted.forEach(r => console.log(JSON.stringify({srcId:r.sourceCalendarId,srcName:r.srcName,srcEmail:r.srcEmail,count:Number(r.cnt)})));

  // 4. Cori event created today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const [coriEvents] = await conn.execute(
    `SELECT e.id, e.title, e.calendarId, c.name as calName, c.accountEmail, e.startTime, e.endTime,
            (SELECT COUNT(*) FROM shadow_blocks sb WHERE sb.sourceEventId = e.id) as sb_count
     FROM events e
     JOIN calendars c ON c.id = e.calendarId
     WHERE e.createdAt >= ? AND (LOWER(e.title) LIKE '%cori%' OR LOWER(e.title) LIKE '%cory%')
     ORDER BY e.createdAt DESC LIMIT 10`,
    [todayStart.getTime()]
  );
  console.log('\n=== Cori events created today ===');
  coriEvents.forEach(r => console.log(JSON.stringify({id:r.id,title:r.title,calId:r.calendarId,calName:r.calName,email:r.accountEmail,sb_count:Number(r.sb_count)})));

  // 5. Also check recent events (last 2h) with 0 SBs on shadowSource calendars
  const twoHoursAgo = Date.now() - 2*60*60*1000;
  const [recentNoSB] = await conn.execute(
    `SELECT e.id, e.title, e.calendarId, c.name as calName, c.shadowSource, c.shadowBlocking,
            (SELECT COUNT(*) FROM shadow_blocks sb WHERE sb.sourceEventId = e.id) as sb_count
     FROM events e
     JOIN calendars c ON c.id = e.calendarId
     WHERE e.createdAt >= ? AND c.shadowSource = 1 AND e.isShadowBlock = 0
     ORDER BY e.createdAt DESC LIMIT 10`,
    [twoHoursAgo]
  );
  console.log('\n=== Recent events (2h) on shadowSource cals with 0 SBs ===');
  recentNoSB.forEach(r => console.log(JSON.stringify({id:r.id,title:r.title,calName:r.calName,shadowSource:r.shadowSource,shadowBlocking:r.shadowBlocking,sb_count:Number(r.sb_count)})));

  // 6. vertical_visibility rules
  const [vvRules] = await conn.execute(
    `SELECT sv.name as srcV, tv.name as tgtV, vv.visibilityLevel, vv.calendarExclusions
     FROM vertical_visibility vv
     JOIN verticals sv ON sv.id = vv.sourceVerticalId
     JOIN verticals tv ON tv.id = vv.targetVerticalId`
  );
  console.log('\n=== vertical_visibility rules ===');
  vvRules.forEach(r => console.log(JSON.stringify(r)));

  await conn.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
