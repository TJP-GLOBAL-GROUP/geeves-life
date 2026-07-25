/**
 * P-14 Audit: StartOut vertical isolation analysis
 * Run: node scripts/audit-startout-vertical.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const STARTOUT_VERT = 'tjpfam-vert-start';
const TARIK_STARTOUT_CAL = 'S6TrhZoBJZdG5W-EiV5hL';   // tarik.perkins@startout.org (shadowBlocking=1)
const TEAM_STARTOUT_CAL  = 'AKbGvGfoorcX6G9bOFQni';   // Team StartOut (shadowBlocking=0)

// ─── 1. StartOut vertical calendars ──────────────────────────────────────────
const [startoutCals] = await conn.execute(`
  SELECT c.id, c.name, c.externalId, c.provider, c.accessLevel, c.shadowBlocking, c.verticalId
  FROM calendars c
  WHERE c.verticalId = ?
  ORDER BY c.shadowBlocking DESC, c.name
`, [STARTOUT_VERT]);

console.log('\n=== 1. STARTOUT VERTICAL CALENDARS ===');
console.table(startoutCals.map(c => ({
  id: c.id,
  name: c.name,
  shadowBlocking: c.shadowBlocking,
  accessLevel: c.accessLevel,
  provider: c.provider,
})));

// ─── 2. Cross-vertical rules targeting StartOut ───────────────────────────────
const [rulesTo] = await conn.execute(`
  SELECT vv.id, vv.fromVerticalId, sv.name as fromName, vv.toVerticalId, tv.name as toName,
         vv.visibilityLevel, vv.busyLabel, vv.calendarExclusions
  FROM vertical_visibility vv
  LEFT JOIN verticals sv ON sv.id = vv.fromVerticalId
  LEFT JOIN verticals tv ON tv.id = vv.toVerticalId
  WHERE vv.toVerticalId = ?
`, [STARTOUT_VERT]);

console.log('\n=== 2. RULES TARGETING STARTOUT VERTICAL ===');
if (rulesTo.length === 0) {
  console.log('  (none)');
} else {
  console.table(rulesTo.map(r => ({
    from: r.fromName,
    to: r.toName,
    level: r.visibilityLevel,
    busyLabel: r.busyLabel,
    exclusions: r.calendarExclusions,
  })));
}

// ─── 3. Cross-vertical rules FROM StartOut ────────────────────────────────────
const [rulesFrom] = await conn.execute(`
  SELECT vv.id, vv.fromVerticalId, sv.name as fromName, vv.toVerticalId, tv.name as toName,
         vv.visibilityLevel, vv.busyLabel, vv.calendarExclusions
  FROM vertical_visibility vv
  LEFT JOIN verticals sv ON sv.id = vv.fromVerticalId
  LEFT JOIN verticals tv ON tv.id = vv.toVerticalId
  WHERE vv.fromVerticalId = ?
`, [STARTOUT_VERT]);

console.log('\n=== 3. RULES FROM STARTOUT VERTICAL ===');
if (rulesFrom.length === 0) {
  console.log('  (none)');
} else {
  console.table(rulesFrom.map(r => ({
    from: r.fromName,
    to: r.toName,
    level: r.visibilityLevel,
    busyLabel: r.busyLabel,
    exclusions: r.calendarExclusions,
  })));
}

// ─── 4. Shadow blocks on tarik.perkins@startout.org by source ────────────────
const [blocksBySource] = await conn.execute(`
  SELECT sc.name as source_cal, sc.verticalId as source_vert,
         COUNT(*) as total,
         SUM(CASE WHEN sb.externalEventId IS NOT NULL THEN 1 ELSE 0 END) as written_to_gcal,
         SUM(CASE WHEN sb.externalEventId IS NULL THEN 1 ELSE 0 END) as db_only,
         MAX(sb.createdAt) as latest_created
  FROM shadow_blocks sb
  LEFT JOIN calendars sc ON sc.id = sb.sourceCalendarId
  WHERE sb.targetCalendarId = ?
  GROUP BY sb.sourceCalendarId, sc.name, sc.verticalId
  ORDER BY total DESC
`, [TARIK_STARTOUT_CAL]);

console.log('\n=== 4. SHADOW BLOCKS ON tarik.perkins@startout.org BY SOURCE ===');
console.log(`Total: ${blocksBySource.reduce((s, r) => s + Number(r.total), 0)}`);
console.table(blocksBySource.map(r => ({
  source: r.source_cal,
  vert: r.source_vert,
  total: r.total,
  gcal: r.written_to_gcal,
  dbOnly: r.db_only,
  latest: r.latest_created,
})));

// ─── 5. Shadow blocks on Team StartOut (should be ZERO) ──────────────────────
const [teamBlocks] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM shadow_blocks WHERE targetCalendarId = ?
`, [TEAM_STARTOUT_CAL]);

console.log('\n=== 5. SHADOW BLOCKS ON Team StartOut (MUST BE ZERO) ===');
console.log(`  Count: ${teamBlocks[0].cnt} ${teamBlocks[0].cnt == 0 ? '✅' : '🚨 PROBLEM!'}`);

// ─── 6. Delete-loop risk: shadow blocks with externalEventId on tarik.perkins@startout.org ──
const [loopRisk] = await conn.execute(`
  SELECT sb.id, sb.externalEventId, sb.startTime, sb.endTime, sb.maskedTitle,
         sc.name as source_cal
  FROM shadow_blocks sb
  LEFT JOIN calendars sc ON sc.id = sb.sourceCalendarId
  WHERE sb.targetCalendarId = ?
    AND sb.externalEventId IS NOT NULL
  ORDER BY sb.startTime DESC
  LIMIT 20
`, [TARIK_STARTOUT_CAL]);

console.log(`\n=== 6. DELETE-LOOP RISK: shadow blocks WITH externalEventId on tarik.perkins@startout.org ===`);
console.log(`Total with externalEventId: ${blocksBySource.reduce((s, r) => s + Number(r.written_to_gcal), 0)}`);
console.log('Sample (most recent 20):');
loopRisk.forEach(r => console.log(
  `  ${r.externalEventId} | ${new Date(Number(r.startTime)).toISOString().slice(0,16)} | "${r.maskedTitle}" from ${r.source_cal}`
));

// ─── 7. Same-vertical Rule 1: would it write from tarik.perkins to Team StartOut? ──
console.log('\n=== 7. SAME-VERTICAL RULE 1 ANALYSIS ===');
console.log('Both calendars are in tjpfam-vert-start.');
console.log('Rule 1 iterates same-vertical siblings and checks shadowBlocking.');
console.log(`  tarik.perkins@startout.org → Team StartOut: Team StartOut has shadowBlocking=0 → SHOULD BE SKIPPED ✅`);
console.log(`  Team StartOut → tarik.perkins@startout.org: tarik.perkins has shadowBlocking=1 → SHOULD PROPAGATE`);
console.log('  BUT: Team StartOut is a shared calendar (not personal events). Does it generate source events?');

// Check if Team StartOut has any events that triggered propagation
const [teamSourceBlocks] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM shadow_blocks WHERE sourceCalendarId = ?
`, [TEAM_STARTOUT_CAL]);
console.log(`  Team StartOut as SOURCE: ${teamSourceBlocks[0].cnt} shadow blocks generated`);

await conn.end();
console.log('\n=== AUDIT COMPLETE ===');
