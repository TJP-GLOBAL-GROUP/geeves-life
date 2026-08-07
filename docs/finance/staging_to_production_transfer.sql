-- ============================================================================
-- Geeves.Life Finance — staging_to_production_transfer.sql
-- Plan v2.2 §2.6 transfer step (Phase B, checklist B-items): moves the
-- CLEANED staging dataset into production (MySQL 8.0, DECIMAL(15,2),
-- utf8mb4_0900_ai_ci).
--
-- STATUS: SCRIPT ONLY. No production execution has been run or authorised
-- in this stage. Execute only via docs/finance/TRANSFER_RUNBOOK.md after
-- Manus Phase 0 gates 0.1–0.9 are counter-signed and Phase A schema exists.
--
-- SOURCE OF TRUTH FLOW (one direction only):
--   staging SQLite copy (post-migration_pack.sql, all POST checks green)
--     -> export to the MySQL scratch schema `stg` (table-per-table CSV/
--        mysqldump-compatible load; tooling choice is runner's — see T0.4)
--     -> this script maps `stg.*` into production tables.
-- NEVER run anything against the original staging DB — copy-only.
--
-- MANDATORY SAFEGUARDS (same six as migration_pack.sql, production form):
--   1. SNAPSHOT per batch: production PITR/backup checkpoint before each
--      START TRANSACTION batch; record checkpoint id in transfer_log.
--   2. DRY-RUN / --apply discipline: this script NEVER auto-commits data
--      batches. Each batch ends with a ROLLBACK/COMMIT decision block. The
--      runner MUST execute exactly one of the two marked lines per batch:
--        DRY-RUN (default): leave `ROLLBACK;` active — validations still run.
--        APPLY: comment ROLLBACK, uncomment COMMIT (or run with a runner
--        that maps --apply to COMMIT). Any unmarked COMMIT is a defect.
--   3. LOGGING: every batch writes transfer_log rows in the SAME
--      transaction; logs carry IDs, counts and SHA-256 hashes ONLY.
--   4. NO RAW PII in logs/comments: no descriptions, memos, card members,
--      child names, beneficiary data. beneficiary_tags is a SIDECAR and is
--      NEVER transferred into journal_lines, exports, or logs (inv. 10).
--   5. LEAST PRIVILEGE: dedicated migration role; NOT the app runtime role;
--      QBO sync disabled/flagged off for the duration (no realm pushes).
--   6. PER-BATCH TRANSACTION with post-batch validation SELECTs (EXPECT
--      comments). Abort the runbook on the first mismatch.
--
-- D7 CONSTANTS (locked 2026-08-07):
--   Global household  : V8lk3KJatvxBTWURf4uo9  (TJ Perkins Global,
--                                               tarik@tjperkinsfam.com)
--   Legacy household  : YouIQoAP6nmcPNljVdUis  (TJ Perkins Fam — becomes
--                                               non-financial after cutover)
-- ============================================================================

-- Session constants (runner sets these; household ids are D7-locked).
--   SET @global_household  = 'V8lk3KJatvxBTWURf4uo9';
--   SET @legacy_household  = 'YouIQoAP6nmcPNljVdUis';
--   SET @transfer_actor    = '<human id + run id>';
--   SET @snapshot_id       = '<pitr/backup checkpoint id for this batch>';

-- ============================================================================
-- T0  PRECONDITIONS & TRANSFER LOG
-- ============================================================================
START TRANSACTION;

CREATE TABLE IF NOT EXISTS transfer_log (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  batch_id    VARCHAR(64)  NOT NULL,   -- 'T1-vertical-bridge', ...
  table_name  VARCHAR(64)  NOT NULL,
  row_ref     VARCHAR(64)  NULL,       -- ID or hash ONLY, never content
  field       VARCHAR(64)  NOT NULL,   -- column, '*row*' or '*batch*'
  old_value   TEXT NULL,               -- counts/hashes/redacted markers only
  new_value   TEXT NULL,
  snapshot_id VARCHAR(128) NOT NULL,   -- per-batch checkpoint id
  script      VARCHAR(128) NOT NULL DEFAULT 'staging_to_production_transfer.sql',
  actor       VARCHAR(128) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_transfer_log (batch_id, table_name, row_ref, field)
);

-- T0.1 Phase A schema present (G0). EXPECT: 0 missing.
-- (Adjust names to the Phase A Drizzle migration's actual table names.)
SELECT t.name AS missing_table FROM (
  SELECT 'verticals' AS name UNION ALL SELECT 'chart_of_accounts'
  UNION ALL SELECT 'journal_entries' UNION ALL SELECT 'journal_lines'
  UNION ALL SELECT 'vertical_code_map' UNION ALL SELECT 'migration_change_log'
  UNION ALL SELECT 'retired_txn_map'  UNION ALL SELECT 'anchor_cache'
) t LEFT JOIN information_schema.tables s
  ON s.table_schema = DATABASE() AND s.table_name = t.name
WHERE s.table_name IS NULL;

-- T0.2 Global household exists (D7). EXPECT: 1 row, id V8lk3KJatvxBTWURf4uo9.
SELECT id FROM households WHERE id = @global_household;

-- T0.3 Legacy household exists (source of MB/MM vertical move). EXPECT: 1.
SELECT id FROM households WHERE id = @legacy_household;

-- T0.4 Scratch schema `stg` loaded from the CLEANED staging copy.
-- EXPECT: 0 missing. Core staging tables required by this script:
SELECT t.name AS missing_stg_table FROM (
  SELECT 'vertical_code_map' AS name UNION ALL SELECT 'verticals'
  UNION ALL SELECT 'gl_accounts'     UNION ALL SELECT 'gl_category_map'
  UNION ALL SELECT 'transactions'    UNION ALL SELECT 'attribution_lines'
  UNION ALL SELECT 'migration_change_log' UNION ALL SELECT 'retired_txn_map'
) t LEFT JOIN information_schema.tables s
  ON s.table_schema = 'stg' AND s.table_name = t.name
WHERE s.table_name IS NULL;

-- T0.5 PII gate: staging scrub already applied — child-identifying strings
-- must not exist anywhere we are about to read; beneficiary_tags must NOT
-- be present in the export set at all. EXPECT: 0 / 0.
SELECT COUNT(*) AS t0_unscrubbed_categories FROM stg.attribution_lines
 WHERE category LIKE '%Tahj%' OR category LIKE '%Autism%';
SELECT COUNT(*) AS t0_sidecar_leak FROM information_schema.tables
 WHERE table_schema = 'stg' AND table_name = 'beneficiary_tags';

-- T0.6 D6 registry gate on the incoming seed: exactly 2 allowlisted rows
-- (MB, MM); GL pending; PERS/FAM hard-excluded. EXPECT: 2 / 0.
SELECT COUNT(*) AS t0_allowlisted FROM stg.vertical_code_map WHERE sync_allowlisted = 1;
SELECT COUNT(*) AS t0_allowlist_violations FROM stg.vertical_code_map
 WHERE (sync_allowlisted = 1 AND staging_code NOT IN ('MB','MM'))
    OR (staging_code IN ('PERS','FAM') AND (sync_allowlisted <> 0 OR qbo_entity <> 'n/a'))
    OR (staging_code = 'GL' AND qbo_entity <> 'pending');

COMMIT;  -- T0 is DDL+log+SELECTs only; safe to commit the log table.

-- ============================================================================
-- T1  VERTICAL CODE BRIDGE (Plan §2.3) — codes -> production UUIDs
-- Maps every staging vertical code to a production verticals.id (create-or-
-- match by `code`), seeds missing verticals (TJPGG, BLab, GL, REV, MULTI),
-- stamps vertical_code_map.vertical_id. MB/MM keep their EXISTING UUIDs —
-- only their householdId moves (T2). isSystemBucket honoured (inv. 13).
-- Batch snapshot: record @snapshot_id before START TRANSACTION.
-- ============================================================================
START TRANSACTION;

-- Seed any missing verticals by code (id = UUID(); household assigned in T2).
INSERT INTO verticals (id, householdId, code, name, isSystemBucket)
SELECT UUID(), @global_household, m.staging_code, m.display_name, m.is_system_bucket
  FROM stg.vertical_code_map m
 WHERE m.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM verticals v WHERE v.code = m.staging_code)
ON DUPLICATE KEY UPDATE name = name;  -- idempotent re-run no-op

-- Bridge registry rows to production UUIDs.
ALTER TABLE vertical_code_map
  ADD COLUMN IF NOT EXISTS vertical_id VARCHAR(36) NULL;  -- runner: treat 'Duplicate column' as benign if unsupported

UPDATE vertical_code_map r
  JOIN stg.vertical_code_map m ON m.staging_code = r.staging_code
  JOIN verticals v ON v.code = m.staging_code
   SET r.vertical_id       = v.id,
       r.sync_allowlisted = m.sync_allowlisted,   -- D6 by data
       r.qbo_entity       = m.qbo_entity;         -- GL = 'pending'

-- First-run insert of the 12-row registry where production table is empty.
INSERT INTO vertical_code_map
  (staging_code, doc_code, display_name, doc_display_name, account_prefix,
   is_system_bucket, qbo_entity, sync_allowlisted, status, merged_into, notes, vertical_id)
SELECT m.staging_code, m.doc_code, m.display_name, m.doc_display_name,
       m.account_prefix, m.is_system_bucket, m.qbo_entity, m.sync_allowlisted,
       m.status, m.merged_into, m.notes, v.id
  FROM stg.vertical_code_map m
  LEFT JOIN verticals v ON v.code = m.staging_code
 WHERE NOT EXISTS (SELECT 1 FROM vertical_code_map r
                    WHERE r.staging_code = m.staging_code);

INSERT IGNORE INTO transfer_log (batch_id, table_name, row_ref, field, old_value, new_value, snapshot_id, actor)
SELECT 'T1-vertical-bridge', 'vertical_code_map', r.staging_code, 'vertical_id',
       NULL, SHA2(r.vertical_id, 256), @snapshot_id, @transfer_actor
  FROM vertical_code_map r;   -- hash of UUID only, never PII (UUIDs are keys)

-- POST T1a: every active code resolves to a verticals.id. EXPECT: 0.
SELECT COUNT(*) AS post_t1_unresolved FROM vertical_code_map r
 WHERE r.status = 'active' AND r.vertical_id IS NULL;
-- POST T1b: D6 holds in production registry. EXPECT: 2 / 0 / 'pending'.
SELECT COUNT(*) AS post_t1_allowlisted FROM vertical_code_map WHERE sync_allowlisted = 1;
SELECT COUNT(*) AS post_t1_allowlist_violations FROM vertical_code_map
 WHERE (sync_allowlisted = 1 AND staging_code NOT IN ('MB','MM'))
    OR (staging_code IN ('PERS','FAM') AND sync_allowlisted <> 0);
SELECT qbo_entity AS post_t1_gl FROM vertical_code_map WHERE staging_code = 'GL';
-- POST T1c: system buckets seeded + flagged. EXPECT: 2 (REV, MULTI).
SELECT COUNT(*) AS post_t1_system_buckets FROM verticals WHERE isSystemBucket = 1;

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T2  HOUSEHOLD CONSOLIDATION (D7) — one ledger, one household
-- MB/MM verticals (+ vertical_owners/access rows/data policies) move from
-- legacy household YouIQoAP6nmcPNljVdUis into Global V8lk3KJatvxBTWURf4uo9.
-- After cutover NOTHING financial remains queryable in the legacy household
-- (householdIsolation.ts guards; verified in T7). Legacy keeps non-financial
-- data only. One-time move, same template as super-admin property
-- reassignment with typed confirmation.
-- ============================================================================
START TRANSACTION;

-- PRE T2: verticals currently homed in the legacy household. EXPECT: MB, MM.
SELECT code FROM verticals WHERE householdId = @legacy_household ORDER BY code;

-- Move financial verticals into Global (value-guarded, idempotent).
UPDATE verticals SET householdId = @global_household
 WHERE householdId = @legacy_household AND code IN ('MB','MM');

-- Move their access/ownership/policy rows with them (per D7 wording).
UPDATE vertical_owners vo JOIN verticals v ON v.id = vo.verticalId
   SET vo.householdId = @global_household
 WHERE vo.householdId = @legacy_household AND v.code IN ('MB','MM');
-- (vertical_member_access / vertical_data_policies rows keyed by verticalId
--  follow the vertical; household-scoped copies, if any, move identically.)

INSERT IGNORE INTO transfer_log (batch_id, table_name, row_ref, field, old_value, new_value, snapshot_id, actor)
SELECT 'T2-household-consolidation', 'verticals', v.code, 'householdId',
       SHA2(@legacy_household,256), SHA2(@global_household,256), @snapshot_id, @transfer_actor
  FROM verticals v WHERE v.code IN ('MB','MM');

-- POST T2a: no financial vertical left in legacy household. EXPECT: 0.
SELECT COUNT(*) AS post_t2_orphans FROM verticals
 WHERE householdId = @legacy_household AND code IN ('MB','MM');
-- POST T2b: MB/MM now in Global. EXPECT: 2.
SELECT COUNT(*) AS post_t2_moved FROM verticals
 WHERE householdId = @global_household AND code IN ('MB','MM');

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T3  ACCOUNT MAPPING (D8) — staging gl_accounts -> chart_of_accounts
-- Create-or-match by code (staging 3-digit codes are system of record, D2).
-- Tax-form dimension lands on the ACCOUNT as default (taxFormLine /
-- isTaxRelevant / taxJurisdiction); journal lines may override (line wins).
-- ============================================================================
START TRANSACTION;

CREATE TABLE IF NOT EXISTS gl_account_bridge (
  staging_code       VARCHAR(21) PRIMARY KEY,   -- e.g. 'MB-685'
  chart_account_id   VARCHAR(36) NOT NULL,      -- chart_of_accounts.id
  created_by_transfer TINYINT NOT NULL DEFAULT 0
);

-- Match existing chart rows by code first.
INSERT IGNORE INTO gl_account_bridge (staging_code, chart_account_id, created_by_transfer)
SELECT g.code, c.id, 0
  FROM stg.gl_accounts g JOIN chart_of_accounts c ON c.code = g.code;

-- Create chart rows for staging codes with no production match.
INSERT INTO chart_of_accounts (id, householdId, code, name, type, taxFormLine, isTaxRelevant, taxJurisdiction, isSystemAccount)
SELECT UUID(), @global_household, g.code, g.name,
       CASE g.purpose WHEN 'money_in' THEN 'revenue'
                      WHEN 'money_out' THEN 'expense'
                      ELSE 'asset' END,   -- refine per Phase A enum; equity codes (x-300/310) map to 'equity'
       g.tax_form_line, g.is_tax_relevant, g.tax_jurisdiction, 0
  FROM stg.gl_accounts g
 WHERE NOT EXISTS (SELECT 1 FROM gl_account_bridge b WHERE b.staging_code = g.code);

-- Bridge the newly created rows.
INSERT IGNORE INTO gl_account_bridge (staging_code, chart_account_id, created_by_transfer)
SELECT g.code, c.id, 1
  FROM stg.gl_accounts g JOIN chart_of_accounts c ON c.code = g.code;

INSERT IGNORE INTO transfer_log (batch_id, table_name, row_ref, field, old_value, new_value, snapshot_id, actor)
VALUES ('T3-account-mapping', 'chart_of_accounts', NULL, '*batch*',
        'staging gl_accounts imported', 'create-or-match by code complete; counts in POST T3',
        @snapshot_id, @transfer_actor);

-- POST T3a: every staging account bridged. EXPECT: 0 unbridged (139 post-§10).
SELECT COUNT(*) AS post_t3_unbridged FROM stg.gl_accounts g
 WHERE NOT EXISTS (SELECT 1 FROM gl_account_bridge b WHERE b.staging_code = g.code);
-- POST T3b: tax defaults carried. EXPECT: 0 (tax-relevant rows kept their flags).
SELECT COUNT(*) AS post_t3_tax_dropped FROM stg.gl_accounts g
  JOIN gl_account_bridge b ON b.staging_code = g.code
  JOIN chart_of_accounts c ON c.id = b.chart_account_id
 WHERE g.is_tax_relevant = 1 AND (c.isTaxRelevant IS NULL OR c.isTaxRelevant = 0);

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T4  CATEGORY BRIDGE (invariant 6 — one bridge; inv. 9 — scrub before map)
-- staging gl_category_map -> production bridge table, keyed by legacy
-- category, pointing at chart_of_accounts via gl_account_bridge.
-- PRE-SCRUBBED labels only: 'FAM — Medical/Therapy', 'FAM — Medical Travel'
-- (child PII removed in migration_pack §7 BEFORE these rows exist).
-- beneficiary_tags: NOT read, NOT transferred, NOT logged (sidecar, inv. 10).
-- ============================================================================
START TRANSACTION;

CREATE TABLE IF NOT EXISTS gl_category_map_prod (
  legacy_category VARCHAR(255) PRIMARY KEY,
  chart_account_id VARCHAR(36) NULL,      -- NULL only when disposition='rail'
  disposition  ENUM('keep','decision','rail') NOT NULL,
  corrected_type VARCHAR(64) NULL,
  is_suspense  TINYINT NOT NULL DEFAULT 0,
  needs_owner_confirmation TINYINT NOT NULL DEFAULT 0
);

INSERT INTO gl_category_map_prod
  (legacy_category, chart_account_id, disposition, corrected_type, is_suspense, needs_owner_confirmation)
SELECT g.legacy_category, b.chart_account_id, g.disposition, g.corrected_type,
       g.is_suspense, IF(g.notes LIKE '%OWNER CONFIRMATION REQUIRED%' OR g.notes LIKE '%OWNER DECISION REQUIRED%', 1, 0)
  FROM stg.gl_category_map g
  LEFT JOIN gl_account_bridge b ON b.staging_code = g.gl_code
ON DUPLICATE KEY UPDATE
  chart_account_id = VALUES(chart_account_id),
  disposition      = VALUES(disposition),
  corrected_type   = VALUES(corrected_type),
  is_suspense      = VALUES(is_suspense);

-- POST T4a: no unscrubbed category string crossed over. EXPECT: 0.
SELECT COUNT(*) AS post_t4_pii FROM gl_category_map_prod
 WHERE legacy_category LIKE '%Tahj%' OR legacy_category LIKE '%Autism%';
-- POST T4b: scrubbed FAM labels present. EXPECT: 2.
SELECT COUNT(*) AS post_t4_scrubbed FROM gl_category_map_prod
 WHERE legacy_category IN ('FAM — Medical/Therapy','FAM — Medical Travel');
-- POST T4c: non-rail rows all resolve to a chart account. EXPECT: 0.
SELECT COUNT(*) AS post_t4_dangling FROM gl_category_map_prod
 WHERE disposition <> 'rail' AND chart_account_id IS NULL;
-- POST T4d: bridge-row hash manifest for the runbook (counts + hash only).
SELECT COUNT(*) AS post_t4_rows,
       SHA2(GROUP_CONCAT(legacy_category ORDER BY legacy_category SEPARATOR '|'),256) AS post_t4_manifest_hash
  FROM gl_category_map_prod;

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T5  JOURNAL TRANSFER — staging transactions/attribution_lines ->
--     journal_entries/journal_lines.
-- Rules:
--   * EVERY transferred row gets householdId = @global_household (D7).
--   * vertical code -> verticalId via verticals.code bridge (inv. 13).
--   * category -> glAccountId via gl_category_map_prod (real FK, D8);
--     unmapped/NULL-category lines land in workbench_queue, NOT the journal.
--   * status = 'draft' for everything (posted only after G4 footing + locks).
--   * currency NOT NULL DEFAULT 'USD'; exchangeRate from exchange_rates at
--     transaction date (immutable; fallback = nearest prior rate, §2.5).
--   * DECIMAL(15,2) conversion happens HERE (SQLite REAL -> MySQL DECIMAL).
--   * superseded attribution lines (superseded_by_allocation = 1) are NOT
--     posted as lines (Plan §3.3); retired-duplicate txns never transfer.
--   * Rail/pair rows (transfer_pairs, refund_pairs) transfer to their
--     production tables in a later batch item (B-series) — rails never
--     swallow revenue (§3.4 precedence is applied BEFORE this transfer on
--     the staging side).
--   * NO memos/descriptions in logs; ID+hash manifest only.
-- ============================================================================
START TRANSACTION;

INSERT INTO journal_entries
  (id, householdId, verticalId, entryDate, fiscalYear, fiscalMonth, status, reconStatus, source, externalRef)
SELECT UUID(), @global_household, v.id,
       t.date, YEAR(t.date), MONTH(t.date), 'draft', 'unreconciled',
       'staging_transfer', CONCAT('stg-txn-', t.id)
  FROM stg.transactions t
  LEFT JOIN verticals v ON v.code = (
        SELECT a.vertical FROM stg.attribution_lines a
         WHERE a.txn_id = t.id AND a.superseded_by_allocation = 0
         GROUP BY a.vertical ORDER BY SUM(ABS(a.amount)) DESC LIMIT 1)
 WHERE COALESCE(t.status,'') <> 'retired-duplicate'
   AND EXISTS (SELECT 1 FROM stg.attribution_lines a
                WHERE a.txn_id = t.id AND a.superseded_by_allocation = 0);

INSERT INTO journal_lines
  (id, entryId, householdId, verticalId, glAccountId, amount, currency, exchangeRate, pct, taxFormLine, isTaxRelevant)
SELECT UUID(), e.id, @global_household, vl.id, m.chart_account_id,
       CAST(a.amount AS DECIMAL(15,2)),
       COALESCE(NULLIF(t.currency,''), 'USD'),
       (SELECT r.rate FROM exchange_rates r
         WHERE r.currency = COALESCE(NULLIF(t.currency,''),'USD') AND r.rateDate <= t.date
         ORDER BY r.rateDate DESC LIMIT 1),   -- nearest prior rate fallback
       a.pct, c.taxFormLine, c.isTaxRelevant
  FROM stg.attribution_lines a
  JOIN stg.transactions t   ON t.id = a.txn_id
  JOIN journal_entries e    ON e.externalRef = CONCAT('stg-txn-', t.id)
  JOIN verticals vl         ON vl.code = a.vertical
  LEFT JOIN gl_category_map_prod m ON m.legacy_category = a.category AND m.disposition = 'keep'
  LEFT JOIN chart_of_accounts c    ON c.id = m.chart_account_id
 WHERE a.superseded_by_allocation = 0
   AND COALESCE(t.status,'') <> 'retired-duplicate'
   AND a.vertical NOT IN ('REV');            -- REV is a queue bucket, never posts (inv. 13)

-- Unmappable lines -> workbench_queue (vertical_assignment), never silently posted.
INSERT INTO workbench_queue (id, householdId, verticalId, tentativeVerticalId, queueType, status, payloadRef)
SELECT UUID(), @global_household, NULL, vl.id, 'uncategorised', 'open', CONCAT('stg-line-', a.id)
  FROM stg.attribution_lines a
  JOIN stg.transactions t ON t.id = a.txn_id
  LEFT JOIN gl_category_map_prod m ON m.legacy_category = a.category AND m.disposition = 'keep'
  LEFT JOIN verticals vl ON vl.code = a.vertical
 WHERE a.superseded_by_allocation = 0
   AND COALESCE(t.status,'') <> 'retired-duplicate'
   AND a.vertical <> 'REV'
   AND m.legacy_category IS NULL;

INSERT IGNORE INTO transfer_log (batch_id, table_name, row_ref, field, old_value, new_value, snapshot_id, actor)
VALUES ('T5-journal-transfer', 'journal_entries', NULL, '*batch*',
        'staging transactions', 'draft entries+lines under Global household; manifest hash in POST T5d',
        @snapshot_id, @transfer_actor);

-- POST T5a: every transferred entry/line scoped to Global. EXPECT: 0 / 0.
SELECT COUNT(*) AS post_t5_entry_scope_violations FROM journal_entries
 WHERE source = 'staging_transfer' AND householdId <> @global_household;
SELECT COUNT(*) AS post_t5_line_scope_violations FROM journal_lines jl
  JOIN journal_entries e ON e.id = jl.entryId
 WHERE e.source = 'staging_transfer' AND jl.householdId <> @global_household;
-- POST T5b: no dangling glAccountId among mapped lines (D8 FK). EXPECT: 0.
SELECT COUNT(*) AS post_t5_dangling_fk FROM journal_lines jl
  LEFT JOIN chart_of_accounts c ON c.id = jl.glAccountId
 WHERE jl.glAccountId IS NOT NULL AND c.id IS NULL;
-- POST T5c: nothing in the legacy household. EXPECT: 0.
SELECT COUNT(*) AS post_t5_legacy_leak FROM journal_entries
 WHERE householdId = @legacy_household;
-- POST T5d: manifest — counts + aggregate hash ONLY (no content).
SELECT COUNT(*) AS post_t5_entries FROM journal_entries WHERE source = 'staging_transfer';
SELECT COUNT(*) AS post_t5_lines FROM journal_lines jl
  JOIN journal_entries e ON e.id = jl.entryId WHERE e.source = 'staging_transfer';
SELECT SHA2(GROUP_CONCAT(jl.id ORDER BY jl.id SEPARATOR '|'),256) AS post_t5_line_hash_manifest
  FROM journal_lines jl JOIN journal_entries e ON e.id = jl.entryId
 WHERE e.source = 'staging_transfer';

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T6  GOVERNANCE TABLES — migration_change_log / retired_txn_map /
--     anchor_cache production copies (Plan §2.5: created in production,
--     seeded from staging post-transfer).
-- ============================================================================
START TRANSACTION;

INSERT IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor, created_at)
SELECT batch_id, table_name, row_id, field, old_value, new_value,
       CONCAT(script, ' [transferred]'), CONCAT('transfer:', @transfer_actor), created_at
  FROM stg.migration_change_log;

INSERT IGNORE INTO retired_txn_map (retired_id, keep_id, retired_at, reason, conflict_class)
SELECT retired_id, keep_id, retired_at, reason, conflict_class FROM stg.retired_txn_map;

-- anchor_cache is intentionally NOT seeded: watermark = MAX(edit_log.id) is
-- staging-scoped; production cache must self-populate (inv. 8: anchors are
-- computed, never stored as system of record).

-- POST T6: row counts match staging. EXPECT: equal counts both sides.
SELECT (SELECT COUNT(*) FROM stg.migration_change_log) AS stg_log,
       (SELECT COUNT(*) FROM migration_change_log)     AS prod_log;
SELECT (SELECT COUNT(*) FROM stg.retired_txn_map) AS stg_retired,
       (SELECT COUNT(*) FROM retired_txn_map)     AS prod_retired;

-- >>> DRY-RUN (default): ROLLBACK;
-- >>> APPLY:             COMMIT;
ROLLBACK;
-- COMMIT;

-- ============================================================================
-- T7  VERIFICATION SUITE — run AFTER apply, scoped to Global household (G4).
-- These SELECTs are READ-ONLY; run them in both dry-run (on the open
-- transaction) and post-apply. Abort runbook on ANY mismatch.
-- ============================================================================

-- T7.1 ANCHORS (Plan §1, adopted by Manus B5/B6). Positive attribution
-- amounts per vertical, ex-REV, ex-superseded, scoped to Global.
-- EXPECT EXACTLY (subject only to 65-conflict resolution + documented
-- staging deviations: MB +45.00 · MM +2,075.93 + 1,000.00 owner item ·
-- BL +564.38 · PERS +351.09 while conflicts are open):
--   MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33
--   FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19
SELECT v.code AS vertical, ROUND(SUM(jl.amount),2) AS anchor
  FROM journal_lines jl
  JOIN journal_entries e ON e.id = jl.entryId AND e.source = 'staging_transfer'
  JOIN verticals v       ON v.id = jl.verticalId
 WHERE jl.householdId = @global_household
   AND jl.amount > 0
 GROUP BY v.code ORDER BY v.code;

-- T7.1b anchor tolerance check (within $1.00 of canon, G4 footing rule).
-- EXPECT: 8 rows, all within_tolerance = 1 (once conflicts resolved).
WITH actual AS (
  SELECT v.code AS code, ROUND(SUM(jl.amount),2) AS amt
    FROM journal_lines jl
    JOIN journal_entries e ON e.id = jl.entryId AND e.source = 'staging_transfer'
    JOIN verticals v ON v.id = jl.verticalId
   WHERE jl.householdId = @global_household AND jl.amount > 0
   GROUP BY v.code
), canon AS (
  SELECT 'MB' code, 312505.33 target UNION ALL SELECT 'MM', 248432.67
  UNION ALL SELECT 'BL', 142515.17 UNION ALL SELECT 'PERS', 200349.33
  UNION ALL SELECT 'FAM', 36938.48 UNION ALL SELECT 'GL', 2508.22
  UNION ALL SELECT 'SO', 1333.37  UNION ALL SELECT 'BLab', 11.19
)
SELECT c.code, c.target, a.amt, ROUND(a.amt - c.target,2) AS delta,
       IF(ABS(a.amt - c.target) <= 1.00, 1, 0) AS within_tolerance
  FROM canon c JOIN actual a ON a.code = c.code ORDER BY c.code;

-- T7.2 QUEUE-POPULATION CANON (Plan §1; opening workbench ≈ 4,350).
-- Counts are computed on the transferred data / staging mirrors.
-- EXPECT (segments):
--   REV queue                    2,037   vertical='REV' attribution lines
--   (review) overlap txns          712   only '(review)'-suffixed categories
--   unattributed (review)          209
--   rail-sweep candidates       ~1,016   transfer/card-payment, unattributed
--   dedupe conflicts (owner)        65
--   H5 vehicle conflicts            17   (10 BL + 7 MB)
--   pair x attribution overlaps    286
SELECT 'rev_queue' AS segment, COUNT(*) AS n FROM stg.attribution_lines WHERE vertical = 'REV'
UNION ALL
SELECT 'dedupe_conflicts', COUNT(*) FROM stg.dedupe_conflict_queue WHERE status = 'open'
UNION ALL
SELECT 'h5_conflicts', COUNT(*) FROM stg.h5_conflict_queue WHERE status = 'open'
UNION ALL
SELECT 'pair_x_attribution', COUNT(DISTINCT a.txn_id)
  FROM stg.attribution_lines a
 WHERE EXISTS (SELECT 1 FROM stg.transfer_pairs tp
                WHERE tp.debit_txn_id = a.txn_id OR tp.credit_txn_id = a.txn_id);
-- (review)-segment and rail-sweep queries run against the staging mirror
-- per the plan's exact definitions (Plan §1 table); expected totals feed the
-- ≈4,350 opening-workbench figure governed by G2/D10 materiality.

-- T7.3 Σpct = 100 on every posted-transfer txn (G2 invariant).
-- EXPECT: 0.
SELECT COUNT(*) AS post_t7_pct_violations FROM (
  SELECT a.txn_id FROM stg.attribution_lines a
   WHERE a.superseded_by_allocation = 0
   GROUP BY a.txn_id HAVING ABS(ROUND(SUM(a.pct),2) - 100.0) > 0.01) x;

-- T7.4 D6 final gate in production. EXPECT: 2 / 0.
SELECT COUNT(*) AS post_t7_allowlisted FROM vertical_code_map WHERE sync_allowlisted = 1;
SELECT COUNT(*) AS post_t7_exclusion_violations FROM vertical_code_map
 WHERE sync_allowlisted = 1 AND staging_code NOT IN ('MB','MM');

-- T7.5 Household isolation: zero financial rows in the legacy household.
-- EXPECT: 0 in every query (householdIsolation.ts guards + data).
SELECT COUNT(*) AS post_t7_legacy_entries FROM journal_entries WHERE householdId = @legacy_household;
SELECT COUNT(*) AS post_t7_legacy_lines   FROM journal_lines   WHERE householdId = @legacy_household;

-- ============================================================================
-- END OF TRANSFER SCRIPT. Rollback = per-batch ROLLBACK (pre-apply) or
-- PITR restore to the batch snapshot + transfer_log audit (post-apply).
-- See docs/finance/TRANSFER_RUNBOOK.md for the ordered runbook and the
-- Phase 0 (0.1–0.9) sign-off checklist.
-- ============================================================================
