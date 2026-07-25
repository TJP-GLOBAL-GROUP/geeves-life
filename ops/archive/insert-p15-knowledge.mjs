import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const entries = [
  {
    category: "calendar",
    key: "shadow_source_concept",
    value: "shadowSource boolean column on calendars table (default true). Controls whether a calendar GENERATES shadow blocks when events are created on it. Separate from shadowBlocking (which controls whether a calendar RECEIVES blocks). Introduced in P-15 to fix Team StartOut pollution. Team StartOut and Family calendar have shadowSource=false.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "shadow_block_two_axis_model",
    value: "Every calendar has two independent shadow block flags: shadowSource (generates blocks) and shadowBlocking (receives blocks). Both default to true. Shared/team calendars should have both set to false. Personal calendars should have both set to true. The propagation engine checks shadowSource on the SOURCE calendar first — if false, no propagation occurs at all.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "startout_vertical_isolation",
    value: "StartOut vertical has two sub-calendars: tarik.perkins@startout.org (shadowSource=true, shadowBlocking=true — personal work) and Team StartOut (shadowSource=false, shadowBlocking=false — shared team). These must operate independently. Team StartOut must never generate or receive shadow blocks. tarik.perkins@startout.org must receive Busy blocks from all other verticals.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "shadow_block_onboarding_ux",
    value: "ConnectCalendarDialog.tsx has a Shadow Blocking configuration step (Step 3 of 4). User selects Personal (shadowSource=true, shadowBlocking=true), Shared/Team (both false), or Custom. Each option has a popover with plain-English example and a confirmation step. Settings page calendar rows show a shield icon (green=personal, amber=partial, grey=isolated) with a popover for independent On/Off toggles.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "shadow_block_stress_tests",
    value: "Stress test suite: server/startout-shadow-block.test.ts. 18 tests: T-01 personal propagation, T-02 team no-propagation, T-03 opted-out target, T-04 self-loop prevention, T-05 delete propagation, T-06 shadowSource toggle, T-07 shadowBlocking toggle, T-08 idempotency, T-09 multi-vertical isolation, T-10 event creation on opted-out calendar, T-11 shadowSource persistence. All 18 pass as of 2026-06-29.",
    sourceDoc: "server/startout-shadow-block.test.ts",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "shadow_block_backfill_endpoint",
    value: "Internal backfill endpoint: POST /api/internal/shadow-block-backfill (protected by x-cron-secret header). Re-propagates all events from Jan 1 2025 to 6 months future that have no existing shadow blocks. Use after bulk cleanup. Handler: server/scheduledHandlers/shadowBlockBackfill.ts. windowDays max extended to 730 (2 years).",
    sourceDoc: "server/scheduledHandlers/shadowBlockBackfill.ts",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "calendar",
    key: "deprecated_propagateShadowBlocks",
    value: "server/db.ts contains a deprecated propagateShadowBlocks() function. It is dead code (never called). It has been patched with a shadowBlocking guard and marked @deprecated. Do NOT call this function. Use onEventUpserted() from server/services/eventPropagation.ts instead.",
    sourceDoc: "server/db.ts",
    notes: "P-15 fix 2026-06-29",
  },
  {
    category: "bugs",
    key: "P-14_family_calendar_as_source",
    value: "BUG P-14 (FIXED 2026-06-29): Family calendar (shadowBlocking=false, opted-out target) was also generating shadow blocks on tarik.perkins@startout.org because the shadowSource concept did not exist. Fix: introduced shadowSource column; Family set to shadowSource=false; 70,447 erroneous rows deleted; backfill from Jan 1 2025 triggered.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-14 fix 2026-06-29",
  },
  {
    category: "bugs",
    key: "P-15_startout_sub_calendar_isolation",
    value: "BUG P-15 (FIXED 2026-06-29): Team StartOut (shadowBlocking=false) was generating 1,504 shadow blocks on tarik.perkins@startout.org because there was no shadowSource guard in the propagation engine. This caused event creation failures on tarik.perkins@startout.org (Busy block conflicts). Fix: shadowSource guard added to onEventUpserted(); Team StartOut set to shadowSource=false; erroneous rows deleted; 18 stress tests added.",
    sourceDoc: "docs/SHADOW_BLOCK_ARCHITECTURE.md",
    notes: "P-15 fix 2026-06-29",
  },
];

let inserted = 0;
let updated = 0;

for (const e of entries) {
  const [existing] = await conn.query(
    "SELECT id FROM project_knowledge WHERE category = ? AND `key` = ?",
    [e.category, e.key]
  );
  if (existing.length > 0) {
    await conn.query(
      "UPDATE project_knowledge SET value = ?, sourceDoc = ?, notes = ?, updatedAt = NOW() WHERE category = ? AND `key` = ?",
      [e.value, e.sourceDoc, e.notes, e.category, e.key]
    );
    updated++;
  } else {
    await conn.query(
      "INSERT INTO project_knowledge (category, `key`, value, sourceDoc, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
      [e.category, e.key, e.value, e.sourceDoc, e.notes]
    );
    inserted++;
  }
}

console.log(`Done: ${inserted} inserted, ${updated} updated`);
await conn.end();
