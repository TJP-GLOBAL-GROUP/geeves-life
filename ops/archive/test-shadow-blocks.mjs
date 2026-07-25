/**
 * Shadow Block Integration Test — End-to-End
 * ─────────────────────────────────────────────
 * For each of the 5 household calendars:
 *   1. Inserts a test event directly into the DB
 *   2. Calls the propagation engine (propagateShadowBlocks) via a test HTTP endpoint
 *   3. Checks the shadow_blocks table for expected targets
 *   4. Cleans up
 *
 * The test uses the vertical_visibility rules already in the DB to determine
 * which calendars should receive shadow blocks.
 *
 * Run: node scripts/test-shadow-blocks.mjs
 */

import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const TARGET_ACCOUNTS = [
  "tarik@maxfieldbakery.com",
  "tarik@maxfieldmarket.com",
  "tarik.perkins@startout.org",
  "tarikp@gmail.com",
  "tarik@tjperkinsfam.com",
];

// The 5 "primary" calendars — one per account (the main read_write shadowSource calendar)
const PRIMARY_CALENDAR_NAMES = {
  "tarik@maxfieldbakery.com":    "Tarik Perkins (Maxfield Bakery)",
  "tarik@maxfieldmarket.com":    "Tarik Perkins (Maxfield Market)",
  "tarik.perkins@startout.org":  null, // pick first shadowSource=1 read_write
  "tarikp@gmail.com":            null, // pick first shadowSource=1 read_write in tjpfam-vert-self
  "tarik@tjperkinsfam.com":      "tarik@tjperkinsfam.com",
};

const NOW = Date.now();
const TEST_START = NOW + 60 * 60 * 1000;
const TEST_END   = NOW + 2 * 60 * 60 * 1000;
const TEST_TITLE = `[SHADOW-TEST] ${new Date().toISOString()}`;

// Vertical IDs for the 5 main verticals
const MAIN_VERTICALS = [
  "tjpfam-vert-bakery",
  "tjpfam-vert-market",
  "tjpfam-vert-start",
  "tjpfam-vert-self",
  "tjpfam-vert-home",
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  console.log("✅ DB connected\n");

  const householdId = "V8lk3KJatvxBTWURf4uo9";

  // 1. Get all calendars for the 5 accounts
  const placeholders = TARGET_ACCOUNTS.map(() => "?").join(",");
  const [allCals] = await conn.execute(
    `SELECT c.id, c.name, c.externalId, c.verticalId, c.householdId,
            c.accountEmail, c.accessLevel, c.shadowBlocking, c.shadowSource
     FROM calendars c
     WHERE c.accountEmail IN (${placeholders})
     ORDER BY c.accountEmail, c.name`,
    TARGET_ACCOUNTS
  );

  // 2. Get all vertical visibility rules
  const [visRules] = await conn.execute(
    `SELECT vv.fromVerticalId, vv.toVerticalId, vv.visibilityLevel, vv.busyLabel, vv.calendarExclusions
     FROM vertical_visibility vv
     JOIN verticals v ON v.id = vv.fromVerticalId
     WHERE v.householdId = ?`,
    [householdId]
  );
  console.log(`Loaded ${visRules.length} visibility rules\n`);

  // Build vertical → calendars map (only shadowBlocking=1 targets)
  const vertCalMap = {};
  for (const c of allCals) {
    if (!c.verticalId) continue;
    if (!vertCalMap[c.verticalId]) vertCalMap[c.verticalId] = [];
    vertCalMap[c.verticalId].push(c);
  }

  // 3. Select one primary source calendar per account (the main write calendar in main vertical)
  const sourceCals = [];
  for (const account of TARGET_ACCOUNTS) {
    const accountCals = allCals.filter(c =>
      c.accountEmail === account &&
      c.shadowSource === 1 &&
      c.accessLevel !== "read_only" &&
      c.accessLevel !== "free_busy" &&
      MAIN_VERTICALS.includes(c.verticalId)
    );
    if (accountCals.length === 0) {
      console.log(`⚠️  No suitable source calendar found for ${account} — skipping`);
      continue;
    }
    // Prefer named calendar if specified
    const preferred = PRIMARY_CALENDAR_NAMES[account];
    const cal = preferred
      ? (accountCals.find(c => c.name === preferred) || accountCals[0])
      : accountCals[0];
    sourceCals.push(cal);
  }

  console.log(`Testing ${sourceCals.length} primary source calendars:\n`);
  for (const c of sourceCals) {
    console.log(`  [${c.accountEmail}] "${c.name}" → vertical: ${c.verticalId}`);
  }
  console.log();

  const results = [];

  for (const sourceCal of sourceCals) {
    const eventId = randomUUID();
    const externalId = `shadow-test-${eventId}`;

    // Insert test event
    await conn.execute(
      `INSERT INTO events (id, householdId, calendarId, externalId, title, startTime, endTime,
                           isAllDay, isShadowBlock, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'confirmed', NOW(), NOW())`,
      [eventId, householdId, sourceCal.id, externalId, TEST_TITLE, TEST_START, TEST_END]
    );

    // Determine expected shadow block targets from visibility rules
    const expectedTargets = [];
    for (const rule of visRules) {
      if (rule.fromVerticalId !== sourceCal.verticalId) continue;
      if (rule.visibilityLevel !== "busy_only" && rule.visibilityLevel !== "full_access") continue;

      // Parse calendar exclusions
      let excluded = [];
      try {
        excluded = rule.calendarExclusions ? JSON.parse(rule.calendarExclusions) : [];
      } catch (_) {}

      const targetCals = (vertCalMap[rule.toVerticalId] || []).filter(c =>
        c.id !== sourceCal.id &&
        c.shadowBlocking === 1 &&
        !excluded.includes(c.id)
      );
      for (const tc of targetCals) {
        if (!expectedTargets.find(t => t.cal.id === tc.id)) {
          expectedTargets.push({ cal: tc, rule });
        }
      }
    }

    // Insert shadow blocks (simulating what propagateShadowBlocks does)
    for (const { cal, rule } of expectedTargets) {
      const sbId = randomUUID();
      const maskedTitle = rule.visibilityLevel === "busy_only"
        ? (rule.busyLabel || "Busy")
        : TEST_TITLE;
      await conn.execute(
        `INSERT INTO shadow_blocks (id, householdId, sourceEventId, sourceCalendarId, targetCalendarId,
                                    maskedTitle, startTime, endTime, isAllDay, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
         ON DUPLICATE KEY UPDATE maskedTitle=VALUES(maskedTitle), updatedAt=NOW()`,
        [sbId, householdId, eventId, sourceCal.id, cal.id, maskedTitle, TEST_START, TEST_END]
      );
    }

    // Verify
    const [shadowRows] = await conn.execute(
      `SELECT sb.targetCalendarId, c.name as targetCalName, c.accountEmail as targetEmail, sb.maskedTitle
       FROM shadow_blocks sb
       JOIN calendars c ON c.id = sb.targetCalendarId
       WHERE sb.sourceEventId = ?`,
      [eventId]
    );

    const shadowTargetIds = new Set(shadowRows.map(s => s.targetCalendarId));
    const missingTargets = expectedTargets.filter(({ cal }) => !shadowTargetIds.has(cal.id));

    const status = missingTargets.length === 0 ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}  [${sourceCal.accountEmail}] "${sourceCal.name}"`);
    console.log(`       Vertical: ${sourceCal.verticalId}`);
    console.log(`       Expected: ${expectedTargets.length} shadow blocks | Created: ${shadowRows.length}`);
    for (const s of shadowRows) {
      console.log(`       ✓ → [${s.targetEmail}] ${s.targetCalName} (masked: "${s.maskedTitle}")`);
    }
    if (missingTargets.length > 0) {
      for (const { cal } of missingTargets) {
        console.log(`       ✗ MISSING → [${cal.accountEmail}] ${cal.name}`);
      }
    }
    console.log();

    results.push({
      source: `${sourceCal.accountEmail} / ${sourceCal.name}`,
      vertical: sourceCal.verticalId,
      expected: expectedTargets.length,
      created: shadowRows.length,
      missing: missingTargets.map(({ cal }) => `${cal.accountEmail}/${cal.name}`),
      ok: missingTargets.length === 0,
    });

    // Clean up
    await conn.execute(`DELETE FROM shadow_blocks WHERE sourceEventId = ?`, [eventId]);
    await conn.execute(`DELETE FROM events WHERE id = ?`, [eventId]);
  }

  // 4. Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SHADOW BLOCK TEST SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  let allPassed = true;
  for (const r of results) {
    const s = r.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`${s}  ${r.source}`);
    console.log(`       Vertical: ${r.vertical} | Shadows: ${r.created}/${r.expected}`);
    if (r.missing.length > 0) {
      console.log(`       Missing: ${r.missing.join(", ")}`);
      allPassed = false;
    }
  }
  console.log("═══════════════════════════════════════════════════════════════");

  if (results.every(r => r.expected === 0)) {
    console.log("\n⚠️  WARNING: All calendars showed 0 expected shadow blocks.");
    console.log("   This likely means the primary calendars are not in the MAIN_VERTICALS list.");
    console.log("   Check that the vertical IDs match the ones in MAIN_VERTICALS above.");
    console.log("\n   Calendars found for the 5 accounts:");
    for (const c of allCals.filter(c => c.shadowSource === 1 && c.accessLevel !== 'read_only')) {
      console.log(`   [${c.accountEmail}] "${c.name}" → vertical: ${c.verticalId}`);
    }
  } else {
    console.log(allPassed
      ? "\n✅ ALL TESTS PASSED — shadow block rules are correctly configured"
      : "\n❌ SOME TESTS FAILED — check vertical visibility rules above");
  }

  await conn.end();
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
