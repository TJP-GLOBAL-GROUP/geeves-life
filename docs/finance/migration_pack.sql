-- ============================================================================
-- Geeves.Life Finance Migration — migration_pack.sql
-- Implements Plan v2.1 (2026-08-07) §2 Registry + §3 Cleanup Program.
-- Target: SQLite staging copy of geeves_life_v2.db  (NEVER run against the
-- original; always cp to a throwaway file first).
--
-- Plan v2.2 §2.6 RELABEL: this pack is STAGING CLEANUP ONLY (SQLite,
-- disposable copy). It provisions NO production schema. The
-- staging→production transfer is a separate artifact:
-- docs/finance/staging_to_production_transfer.sql (+ TRANSFER_RUNBOOK.md).
--
-- CHANGE LOG (changes after validation commit 72e98f9 — all other sections
-- byte-stable):
--   2026-08-07  §1 amended per Plan v2.2 §2.4 / Manus CRITICAL-1b (D6):
--     * vertical_code_map gains sync_allowlisted (data flag, not prose):
--       EXACTLY MB + MM allowlisted (realms 123145971566304 bakery /
--       9130350512376806 MMG); all others geeves_only; PERS/FAM hard-excluded.
--     * Geeves.Life qbo_entity -> 'pending' (realm does not exist yet, D6).
--     * Verification block added (POST §1d–§1g).
--     §§0,2–13 untouched.
--   2026-08-07  §1 BL display name resolved (owner decision, brand review
--     v2.1 gap closure): doc-side 'Blue Lagoon' placeholder RETIRED;
--     BL display name = 'Bohemian Lodges' (code remains 'BL').
--     §§0,2–13 untouched.
--
-- IDEMPOTENCY CONTRACT
--   * All DML is idempotent in pure SQL (INSERT OR IGNORE / value-guards /
--     status-guards). Running the whole file a second time changes nothing.
--   * A small number of DDL statements (ALTER TABLE ... ADD COLUMN /
--     RENAME) have no IF-NOT-EXISTS form in SQLite. They are tagged
--     `-- [IDEMPOTENT-DDL]`. A runner MUST treat the errors
--     "duplicate column name", "no such table: master_coa",
--     "view master_coa may not be altered" and "there is already another
--     table or index with this name" on tagged statements as a benign
--     skip (standard migration-runner behaviour, e.g. goose/dbmate/flyway).
--     On first application they succeed; on re-application they are skipped.
--   * §8 creates a compatibility VIEW `master_coa` after the rename so that
--     every other statement in this file stays pure-SQL idempotent.
--
-- MANDATORY SAFEGUARDS (Plan §3 preamble — apply to EVERY section below):
--   1. SNAPSHOT: take a file-level snapshot of the DB before each batch and
--      record the snapshot id (e.g. `cp geeves.db snapshots/pre_B<n>_<ts>.db`).
--   2. DRY-RUN: run with the UPDATE/DELETE bodies commented out (or inside a
--      transaction you roll back); the PRE/POST SELECT validations double as
--      the row-count report. Require explicit --apply to commit.
--   3. LOGGING: every change is written to migration_change_log (batch rows)
--      or retired_txn_map (dedupe retires) in the SAME transaction.
--   4. NO RAW PII: scripts never log raw descriptions, card members, child
--      names, or amounts — IDs, counts and redacted markers only.
--   5. LEAST PRIVILEGE: run as a migration role, not the app runtime role.
--   6. PER-BATCH TRANSACTION: each section runs inside BEGIN IMMEDIATE /
--      COMMIT with post-commit validation queries.
-- ============================================================================

-- ============================================================================
-- §0  LOGGING INFRASTRUCTURE — migration_change_log + retired_txn_map
-- Safeguards: snapshot pre_B0 · dry-run report · this DDL is the log itself.
-- ============================================================================
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS migration_change_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id   TEXT NOT NULL,          -- e.g. 'B02-accounts-ghost'
  table_name TEXT NOT NULL,
  row_id     TEXT,                   -- NULL on batch-summary rows
  field      TEXT NOT NULL,          -- column name, '*row*', or '*batch*'
  old_value  TEXT,                   -- redacted; counts/hashes only, never PII
  new_value  TEXT,
  script     TEXT NOT NULL,          -- 'migration_pack.sql §n'
  actor      TEXT NOT NULL,          -- human id + agent/run id
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uniqueness makes every log INSERT below re-runnable (INSERT OR IGNORE).
CREATE UNIQUE INDEX IF NOT EXISTS ux_migration_change_log
  ON migration_change_log (batch_id, table_name, IFNULL(row_id,''), field);

CREATE TABLE IF NOT EXISTS retired_txn_map (
  retired_id     INTEGER PRIMARY KEY,
  keep_id        INTEGER NOT NULL,
  retired_at     TEXT NOT NULL DEFAULT (datetime('now')),
  reason         TEXT NOT NULL,
  conflict_class TEXT NOT NULL CHECK (conflict_class IN ('identical','move','conflict','none'))
);

COMMIT;

-- POST §0: both log tables exist.
-- EXPECT: 2
SELECT COUNT(*) AS post_s0_tables FROM sqlite_master
 WHERE type='table' AND name IN ('migration_change_log','retired_txn_map');


-- ============================================================================
-- §1  CANONICAL REGISTRY (Gate G1) — vertical_code_map + verticals backfill
-- Safeguards: snapshot pre_B1 · dry-run report · changes logged in B1 batch.
-- AMENDED 2026-08-07 (Plan v2.2 §2.4 / Manus CRITICAL-1b, owner decision D6):
--   * Registry gains sync_allowlisted (BOOLEAN as SQLite INTEGER 0/1,
--     NOT NULL DEFAULT 0) — D6 enforced by DATA, not prose.
--   * EXACTLY TWO rows allowlisted (the only QBO realms that may sync):
--       MB  — Maxfield Bakery   realm 123145971566304
--       MM  — Maxfield Market   realm 9130350512376806  (MMG)
--     Everything else is geeves_only (sync_allowlisted = 0) but
--     export-ready; PERS/FAM are HARD-EXCLUDED (qbo_entity 'n/a',
--     sync_allowlisted = 0 — structural, not a preference).
--   * Geeves.Life row qbo_entity -> 'pending' (D6: realm does not exist yet).
--   Verification: POST §1d–§1g below.
-- AMENDED 2026-08-07 (owner decision / brand review v2.1): BL display name
--   resolved to 'Bohemian Lodges' — doc_display_name 'Blue Lagoon' retired.
-- ============================================================================
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS vertical_code_map (
  staging_code     TEXT PRIMARY KEY,
  doc_code         TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  doc_display_name TEXT,
  account_prefix   TEXT,
  is_system_bucket INTEGER NOT NULL DEFAULT 0,
  qbo_entity       TEXT,
  sync_allowlisted INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','retired','merged')),
  merged_into      TEXT REFERENCES vertical_code_map(staging_code),
  notes            TEXT
);

-- 12-row seed per Plan §2 (D1/D2/D3 locked), v2.2 §2.4 sync_allowlisted (D6).
INSERT OR IGNORE INTO vertical_code_map
  (staging_code, doc_code, display_name, doc_display_name, account_prefix, is_system_bucket, qbo_entity, sync_allowlisted, status, merged_into, notes) VALUES
  ('MB',   'BKY',  'Maxfield Bakery',     'Maxfield Bakery',        'MB',    0, 'Maxfield Bakery QBO',           1, 'active',  NULL,   'Jamaican Ltd (83% owned) — corporate return + GCT; Form 5471/CFC/GILTI for US owner (Plan §5). D6 allowlisted realm 123145971566304'),
  ('MM',   'MKT',  'Maxfield Market',     'Maxfield Market Global', 'MM',    0, 'Maxfield Market Global LLC QBO',1, 'active',  NULL,   'ecommerce. D6 allowlisted realm 9130350512376806 (MMG)'),
  ('BL',   'BL',   'Bohemian Lodges',     'Bohemian Lodges',        'BL',    0, 'Bohemian Lodges QBO',           0, 'active',  NULL,   'owner confirmed 2026-08-07 (brand review v2.1): display name = Bohemian Lodges, code remains BL; doc-side "Blue Lagoon" placeholder retired; geeves_only per D6'),
  ('GL',   'GDL',  'Geeves.Life',         'Good Life',              'GL',    0, 'pending',                       0, 'active',  NULL,   'D3: staging GL keeps code (has data); doc "Good Life" retired to GDL (no data). v2.2 §2.4/CRITICAL-1b: qbo_entity pending — D6 realm does not exist yet'),
  ('SO',   'SO',   'StartOut',            'StartOut',               'SO',    0, 'StartOut QBO',                  0, 'active',  NULL,   'StartOut labeled work; geeves_only per D6'),
  ('BLab', 'BLAB', 'Beta Lab',            'B.Lab',                  'BLab',  0, 'Beta Lab QBO',                  0, 'active',  NULL,   'betalabpro.com — confirm status; GL/BLab spend currently intended to post into TJP accounts (TJP-500 note) — design fork needed before G3; geeves_only per D6'),
  ('PERS', 'PERS', 'Personal',            'Personal',               'PERS',  0, 'n/a',                           0, 'active',  NULL,   'absorbs SELF (D1); HARD geeves_only — structurally excluded from QBO sync (D6)'),
  ('FAM',  'FAM',  'Family',              'Family',                 'FAM',   0, 'n/a',                           0, 'active',  NULL,   'staging-only; HARD geeves_only — structurally excluded from QBO sync (D6)'),
  ('TJPGG','TJPGG','TJP Global Group',    'TJP Global Group',       'TJP',   0, 'TJP Global Group QBO',          0, 'active',  NULL,   'registered 2026-08-07; accounts use TJP- prefix, not TJPGG- (invariant 7); geeves_only per D6'),
  ('SELF', 'SELF', 'Self / Tarik',        'Self / Tarik',           NULL,    0, 'n/a',                           0, 'merged',  'PERS', 'D1: zero rows anywhere — doc-side fold only; none deductible post-fold (Form 2106/Sch A suspended through TY2025)'),
  ('REV',  'REV',  'Needs Review',        'Needs Review',           'REV',   1, 'n/a',                           0, 'active',  NULL,   'system bucket: queue — never posts to G.L.; never syncs'),
  ('MULTI','MULTI','Multi-Vertical Rail', 'Multi-Vertical Rail',    'MULTI', 1, 'n/a',                           0, 'active',  NULL,   'system bucket: rails/clearing (stripe, 7 transfer_pairs / $33,246.51) — never P&L; registered 2026-08-07; never syncs');

-- v2.2 §2.4: add the D6 data flag on DBs seeded before this amendment.
-- (On a fresh DB the CREATE above already has the column and this raises
-- "duplicate column name" — benign skip per the header contract.)
ALTER TABLE vertical_code_map ADD COLUMN sync_allowlisted INTEGER NOT NULL DEFAULT 0;  -- [IDEMPOTENT-DDL]

-- D6 enforcement as value-guarded DML (covers pre-amendment seeds where the
-- INSERT OR IGNORE above is a no-op; re-runnable).
UPDATE vertical_code_map SET sync_allowlisted = 1
 WHERE staging_code IN ('MB','MM') AND sync_allowlisted <> 1;
UPDATE vertical_code_map SET sync_allowlisted = 0
 WHERE staging_code NOT IN ('MB','MM') AND sync_allowlisted <> 0;
-- CRITICAL-1b: GL realm does not exist yet.
UPDATE vertical_code_map SET qbo_entity = 'pending'
 WHERE staging_code = 'GL' AND qbo_entity <> 'pending';

-- Brand review v2.1 / owner decision 2026-08-07: BL display name resolved.
-- Value-guarded DML so DBs seeded with the 'Blue Lagoon' doc-side placeholder
-- converge even where the INSERT OR IGNORE above is a no-op (re-runnable).
UPDATE vertical_code_map SET doc_display_name = 'Bohemian Lodges',
       notes = 'owner confirmed 2026-08-07 (brand review v2.1): display name = Bohemian Lodges, code remains BL; doc-side "Blue Lagoon" placeholder retired; geeves_only per D6'
 WHERE staging_code = 'BL' AND doc_display_name <> 'Bohemian Lodges';

-- verticals: add registry columns (tagged idempotent DDL — see header).
ALTER TABLE verticals ADD COLUMN is_system_bucket INTEGER NOT NULL DEFAULT 0;  -- [IDEMPOTENT-DDL]
ALTER TABLE verticals ADD COLUMN account_prefix TEXT;                          -- [IDEMPOTENT-DDL]

-- Backfill prefix + system flag from the registry (value-guarded, re-runnable).
UPDATE verticals SET account_prefix = (SELECT v.account_prefix FROM vertical_code_map v WHERE v.staging_code = verticals.code);
UPDATE verticals SET is_system_bucket = 1 WHERE code IN ('REV','MULTI');

-- Register TJPGG + MULTI in verticals (they exist in data but were unregistered).
INSERT OR IGNORE INTO verticals (code, name, qbo_entity, notes, is_system_bucket, account_prefix) VALUES
  ('TJPGG', 'TJP Global Group', 'TJP Global Group QBO', 'registered 2026-08-07; TJP- prefix', 0, 'TJP'),
  ('MULTI', 'Multi-Vertical Rail', 'n/a', 'system bucket: rails/clearing — never P&L; registered 2026-08-07', 1, 'MULTI');

-- REV system flag (idempotent).
UPDATE verticals SET is_system_bucket = 1, account_prefix = 'REV' WHERE code = 'REV';

INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B01-registry', 'verticals', code, '*batch*', 'is_system_bucket/account_prefix unset',
       'backfilled from vertical_code_map', 'migration_pack.sql §1', 'migration-agent'
  FROM verticals;

-- v2.2 §2.4 batch log (D6 flag + GL pending). INSERT OR IGNORE keeps re-runs clean.
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor) VALUES
  ('B01-registry-sync-allowlist', 'vertical_code_map', NULL, '*batch*',
   'no sync_allowlisted column; 2-realm allowlist unenforced (prose only); GL qbo_entity named a non-existent realm',
   'D6 enforced by data: sync_allowlisted=1 for MB (realm 123145971566304) and MM (realm 9130350512376806) ONLY; all others geeves_only; PERS/FAM hard-excluded; GL qbo_entity=pending',
   'migration_pack.sql §1 (Plan v2.2 §2.4 / Manus CRITICAL-1b)', 'migration-agent');

-- Brand review v2.1 batch log (BL display-name resolution). Re-runnable.
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor) VALUES
  ('B01-registry-bl-display-name', 'vertical_code_map', 'BL', 'doc_display_name',
   'Blue Lagoon (doc-side placeholder; owner confirmation pending)',
   'Bohemian Lodges (owner confirmed 2026-08-07; code remains BL)',
   'migration_pack.sql §1 (brand review v2.1, owner decision)', 'migration-agent');

COMMIT;

-- POST §1a: registry row count.
-- EXPECT: 12
SELECT COUNT(*) AS post_s1_registry_rows FROM vertical_code_map;
-- POST §1b: system buckets flagged in verticals.
-- EXPECT: 2 (REV, MULTI)
SELECT COUNT(*) AS post_s1_system_buckets FROM verticals WHERE is_system_bucket = 1;
-- POST §1c: TJPGG + MULTI registered.
-- EXPECT: 11 rows total; TJPGG prefix = 'TJP'
SELECT code, account_prefix FROM verticals WHERE code IN ('TJPGG','MULTI');
SELECT COUNT(*) AS post_s1_verticals FROM verticals;
-- POST §1d: D6 allowlist — EXACTLY 2 rows sync_allowlisted, and they are MB+MM.
-- EXPECT: 2 ; rows = MB, MM
SELECT COUNT(*) AS post_s1_allowlisted FROM vertical_code_map WHERE sync_allowlisted = 1;
SELECT staging_code, qbo_entity, notes FROM vertical_code_map WHERE sync_allowlisted = 1 ORDER BY staging_code;
-- POST §1e: PERS/FAM hard-excluded (allowlist flag off AND qbo_entity n/a).
-- EXPECT: 0 violations
SELECT COUNT(*) AS post_s1_persfam_exclusion_violations FROM vertical_code_map
 WHERE staging_code IN ('PERS','FAM') AND (sync_allowlisted <> 0 OR qbo_entity <> 'n/a');
-- POST §1f: GL realm pending (CRITICAL-1b). EXPECT: 'pending'
SELECT qbo_entity AS post_s1_gl_qbo_entity FROM vertical_code_map WHERE staging_code = 'GL';
-- POST §1g: no allowlisted system buckets or retired/merged rows.
-- EXPECT: 0
SELECT COUNT(*) AS post_s1_allowlist_scope_guard FROM vertical_code_map
 WHERE sync_allowlisted = 1 AND (is_system_bucket <> 0 OR status <> 'active');
-- POST §1h: BL display name resolved (brand review v2.1).
-- EXPECT: 'Bohemian Lodges' ; 0 'Blue Lagoon' rows
SELECT doc_display_name AS post_s1_bl_name FROM vertical_code_map WHERE staging_code = 'BL';
SELECT COUNT(*) AS post_s1_blue_lagoon_leftovers FROM vertical_code_map
 WHERE doc_display_name = 'Blue Lagoon' OR display_name = 'Blue Lagoon';

-- ============================================================================
-- §2  ACCOUNTS GHOST-ROW REPAIR (Plan §1 baseline / §3.2)
-- Safeguards: snapshot pre_B2 · dry-run report · per-row log in B2 batch.
-- INSPECTED: accounts has 19 rows = 18 named + 1 ghost (id NULL, name
--   'owner_journal', all other columns NULL — a shifted insert). A proper
--   owner_journal row already exists (id='owner_journal', 'Owner Journal
--   (mirror entries)'), so the ghost is DELETED with a logged change rather
--   than repaired into a duplicate.
-- PRODUCTION DDL NOTE: accounts.id needs NOT NULL + enforced PRIMARY KEY in
--   production DDL (SQLite staging allowed the NULL id through).
-- ============================================================================
BEGIN IMMEDIATE;

-- PRE §2: ghost row present.
-- EXPECT: 1 on first run, 0 on re-run
SELECT COUNT(*) AS pre_s2_ghost FROM accounts WHERE id IS NULL;

-- Log the ghost row (no raw PII: the row carries no names/amounts).
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B02-accounts-ghost', 'accounts', NULL, '*row*',
       'ghost row: id NULL, name=owner_journal (shifted insert)',
       'deleted — proper owner_journal row already exists (id=owner_journal)',
       'migration_pack.sql §2', 'migration-agent'
  FROM accounts WHERE id IS NULL;

DELETE FROM accounts WHERE id IS NULL;

COMMIT;

-- POST §2a: no NULL-id rows.
-- EXPECT: 0
SELECT COUNT(*) AS post_s2_ghost FROM accounts WHERE id IS NULL;
-- POST §2b: 18 named accounts remain, owner_journal intact.
-- EXPECT: 18 ; owner_journal present = 1
SELECT COUNT(*) AS post_s2_accounts FROM accounts;
SELECT COUNT(*) AS post_s2_owner_journal FROM accounts WHERE id = 'owner_journal';


-- ============================================================================
-- §3  DEDUPE (Plan §3.1 — 4-class rule, implemented exactly)
-- Safeguards: snapshot pre_B3 · dry-run report · every retire logged to
--   retired_txn_map (B3 batch) in the same transaction.
-- Classes (verified against staging):
--   'identical' both twins attributed, byte-identical line-sets  (expect 149)
--   'move'      retire attributed, keep has no lines             (expect 4)
--   'conflict'  both attributed, line-sets differ                (expect 65)
--   'none'      retire row unattributed -> retire mechanically   (expect 65)
-- ============================================================================
BEGIN IMMEDIATE;

-- Working tables (no DROP anywhere in this pack: emptied + refilled instead).
CREATE TABLE IF NOT EXISTS _dedupe_work (
  retire_id  INTEGER PRIMARY KEY,
  keep_id    INTEGER NOT NULL,
  class      TEXT NOT NULL CHECK (class IN ('identical','move','conflict','none')),
  keep_sig   TEXT,
  retire_sig TEXT
);
DELETE FROM _dedupe_work;

CREATE TABLE IF NOT EXISTS dedupe_conflict_queue (
  retired_id INTEGER PRIMARY KEY,
  keep_id    INTEGER NOT NULL,
  details    TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Build candidate set: dup groups on (account_id,date,amount,description),
-- keep = MIN(id), excluding already 'retired-duplicate' rows.
-- Line-set signature = GROUP_CONCAT of vertical|category|amount|pct ordered.
INSERT OR IGNORE INTO _dedupe_work (retire_id, keep_id, class, keep_sig, retire_sig)
SELECT t.id, d.keep_id,
       CASE
         WHEN rsig.s IS NOT NULL AND ksig.s IS NOT NULL AND rsig.s =  ksig.s THEN 'identical'
         WHEN rsig.s IS NOT NULL AND ksig.s IS NULL                        THEN 'move'
         WHEN rsig.s IS NOT NULL AND ksig.s IS NOT NULL AND rsig.s <> ksig.s THEN 'conflict'
         ELSE 'none'
       END,
       ksig.s, rsig.s
  FROM (SELECT account_id, date, amount, description, MIN(id) AS keep_id
          FROM transactions
         WHERE COALESCE(status,'') <> 'retired-duplicate'
         GROUP BY account_id, date, amount, description
        HAVING COUNT(*) > 1) d
  JOIN transactions t
    ON t.account_id IS d.account_id AND t.date IS d.date
   AND t.amount IS d.amount AND t.description IS d.description
   AND t.id <> d.keep_id
   AND COALESCE(t.status,'') <> 'retired-duplicate'
  LEFT JOIN (SELECT txn_id, GROUP_CONCAT(s) AS s FROM (
               SELECT txn_id, vertical||'|'||COALESCE(category,'~')||'|'||ROUND(amount,2)||'|'||COALESCE(CAST(pct AS TEXT),'~') AS s
                 FROM attribution_lines ORDER BY txn_id, s
             ) GROUP BY txn_id) rsig ON rsig.txn_id = t.id
  LEFT JOIN (SELECT txn_id, GROUP_CONCAT(s) AS s FROM (
               SELECT txn_id, vertical||'|'||COALESCE(category,'~')||'|'||ROUND(amount,2)||'|'||COALESCE(CAST(pct AS TEXT),'~') AS s
                 FROM attribution_lines ORDER BY txn_id, s
             ) GROUP BY txn_id) ksig ON ksig.txn_id = d.keep_id;

COMMIT;

-- PRE §3a: retire candidates by class.
-- EXPECT first run: identical=149, move=4, conflict=65, none=65 (total 283).
-- EXPECT re-run:   conflict=65 only (non-conflict classes already retired).
SELECT class, COUNT(*) AS pre_s3_class_counts FROM _dedupe_work GROUP BY class;

-- PRE §3b (signature guard): 'identical' rows whose signatures differ.
-- EXPECT: 0 — abort the batch if non-zero.
SELECT COUNT(*) AS pre_s3_identical_guard
  FROM _dedupe_work WHERE class='identical' AND (keep_sig IS NULL OR keep_sig <> retire_sig);

BEGIN IMMEDIATE;

-- Class 'move': re-point retire-side attribution lines to the keep txn.
UPDATE attribution_lines SET txn_id = (SELECT w.keep_id FROM _dedupe_work w WHERE w.retire_id = attribution_lines.txn_id)
 WHERE txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class='move');

-- Class 'identical': DELETE retire-side lines (do NOT re-point — re-pointing
-- would double-post byte-identical lines).
DELETE FROM attribution_lines
 WHERE txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class='identical');

-- Class 'conflict': DO NOT retire — enqueue for owner workbench.
-- details carries verticals only (no categories/amounts/descriptions).
INSERT OR IGNORE INTO dedupe_conflict_queue (retired_id, keep_id, details)
SELECT retire_id, keep_id,
       'line-sets differ; owner picks surviving line-set. retire verticals=' ||
       COALESCE((SELECT GROUP_CONCAT(DISTINCT vertical) FROM attribution_lines WHERE txn_id = w.retire_id),'') ||
       ' keep verticals=' ||
       COALESCE((SELECT GROUP_CONCAT(DISTINCT vertical) FROM attribution_lines WHERE txn_id = w.keep_id),'')
  FROM _dedupe_work w WHERE class='conflict';

-- Re-point pair/allocation references from NON-CONFLICT retire ids to keep
-- ids. (Conflict txns stay fully intact until the owner resolves them.)
--   transfer_pairs (debit/credit)  — expect 2 rows on first run
--   refund_pairs   (charge/refund) — expect 0 rows on first run
--   allocation_lines txn_id        — expect 0 rows on first run: all 13
--     allocation lines on retire ids belong to CONFLICT txns (see comment at
--     POST §3d) and are deliberately NOT re-pointed.
UPDATE transfer_pairs SET debit_txn_id  = (SELECT keep_id FROM _dedupe_work WHERE retire_id = debit_txn_id)
 WHERE debit_txn_id  IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');
UPDATE transfer_pairs SET credit_txn_id = (SELECT keep_id FROM _dedupe_work WHERE retire_id = credit_txn_id)
 WHERE credit_txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');
UPDATE refund_pairs SET charge_txn_id = (SELECT keep_id FROM _dedupe_work WHERE retire_id = charge_txn_id)
 WHERE charge_txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');
UPDATE refund_pairs SET refund_txn_id = (SELECT keep_id FROM _dedupe_work WHERE retire_id = refund_txn_id)
 WHERE refund_txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');
UPDATE allocation_lines SET txn_id = (SELECT keep_id FROM _dedupe_work WHERE retire_id = txn_id)
 WHERE txn_id IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');

-- Retire all non-conflict retire ids.
UPDATE transactions SET status = 'retired-duplicate'
 WHERE id IN (SELECT retire_id FROM _dedupe_work WHERE class <> 'conflict');

-- Log every retire (class-tagged). INSERT OR IGNORE keeps re-runs clean.
INSERT OR IGNORE INTO retired_txn_map (retired_id, keep_id, reason, conflict_class)
SELECT retire_id, keep_id, 'dedupe B.2: duplicate of keep txn (4-class rule, Plan §3.1)', class
  FROM _dedupe_work WHERE class <> 'conflict';

COMMIT;

-- POST §3a: active dup groups remaining, excluding conflict-queue txns.
-- EXPECT: 0
SELECT COUNT(*) AS post_s3_dup_groups FROM (
  SELECT account_id, date, amount, description
    FROM transactions
   WHERE COALESCE(status,'') <> 'retired-duplicate'
     AND id NOT IN (SELECT retired_id FROM dedupe_conflict_queue)
     AND id NOT IN (SELECT keep_id    FROM dedupe_conflict_queue)
   GROUP BY account_id, date, amount, description
  HAVING COUNT(*) > 1);
-- POST §3b: retired count / conflict queue count.
-- EXPECT first run: 218 retired (149+4+65), 65 queued.
SELECT COUNT(*) AS post_s3_retired FROM retired_txn_map;
SELECT status, COUNT(*) AS post_s3_queue FROM dedupe_conflict_queue GROUP BY status;
-- POST §3c: re-point evidence (2 transfer pairs now reference keep ids).
-- EXPECT: 2
SELECT COUNT(*) AS post_s3_tp_repointed FROM transfer_pairs
 WHERE credit_txn_id IN (SELECT keep_id FROM retired_txn_map)
   AND id IN (340, 341);
-- POST §3d: allocation lines still held on open-conflict txns (by design).
-- EXPECT: 13 — re-point them only when the owner resolves each conflict.
SELECT COUNT(*) AS post_s3_alloc_held_on_conflicts FROM allocation_lines
 WHERE txn_id IN (SELECT retired_id FROM dedupe_conflict_queue);
-- POST §3e: ANCHOR (decomposed baseline comes later; this is the §3.1 anchor
-- query exactly as specified — positive attribution amounts per vertical,
-- excluding REV). Expected deduped values once the 65 conflicts resolve:
--   MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33
--   FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19
-- NOTE: while the 65 conflicts are open, BOTH twins' line-sets are still
-- active, so small upward deviations are expected (measured on staging:
-- MB +45.00 · MM +2,075.93 · BL +564.38 · PERS +351.09 · REV +32.05 from
-- conflict-retire-side lines; MM shows a further $1,000.00 vs plan that
-- needs owner reconciliation during conflict resolution).
SELECT vertical, ROUND(SUM(amount),2) AS post_s3_anchor
  FROM attribution_lines
 WHERE amount > 0 AND vertical <> 'REV'
 GROUP BY vertical ORDER BY vertical;

-- ============================================================================
-- §4  PCT NORMALIZATION (Plan §3.2 — implemented exactly)
-- Safeguards: snapshot pre_B4 · dry-run report · B4 batch-summary log rows
--   (counts only — never raw values).
-- Order is load-bearing: (1) fractional groups x100, (2) NULL derive,
-- (3) txn 18600 recompute, (4) 99.99 rounding absorbed into largest line.
-- ============================================================================
BEGIN IMMEDIATE;

-- PRE §4a: fractional groups (SUM(pct) <= 1.000001).
-- EXPECT first run (post-§3 dedupe): 1,842 groups (1,888 on the pre-§3
-- baseline; ~2,375 fractional lines pre-§3). Re-run: 0.
SELECT COUNT(*) AS pre_s4_frac_groups FROM (
  SELECT txn_id FROM attribution_lines WHERE pct IS NOT NULL
   GROUP BY txn_id HAVING SUM(pct) <= 1.000001);
-- PRE §4b: NULL pct lines. EXPECT first run: ~118 (98 txns) pre-§3 baseline.
SELECT COUNT(*) AS pre_s4_null_pct FROM attribution_lines WHERE pct IS NULL;

-- Step 1: fractional groups x100 (unit detection is per-txn-group, so the
-- guard is idempotent: after x100 no group sums <= 1.000001 except all-zero
-- splits whose lines stay 0 either way).
UPDATE attribution_lines SET pct = ROUND(pct * 100.0, 6)
 WHERE pct IS NOT NULL
   AND txn_id IN (SELECT txn_id FROM attribution_lines WHERE pct IS NOT NULL
                   GROUP BY txn_id HAVING SUM(pct) <= 1.000001);

-- Step 2: NULL pct derived from perfect amount footing vs parent txn amount
-- (signs cancel: line amount and parent amount share sign).
UPDATE attribution_lines
   SET pct = ROUND(amount * 100.0 / (SELECT t.amount FROM transactions t WHERE t.id = attribution_lines.txn_id), 6)
 WHERE pct IS NULL;

-- Step 3: txn 18600 (Σpct = 200 — loan principal + interest on one Zelle):
-- recompute both lines from amounts (9,000 / 2,000 of 11,000 -> 81.818182 / 18.181818).
UPDATE attribution_lines
   SET pct = ROUND(amount * 100.0 / (SELECT t.amount FROM transactions t WHERE t.id = 18600), 6)
 WHERE txn_id = 18600;

-- Step 4: 99.99 float-rounding groups — add (100 - Σ) to the largest line.
-- Guard BETWEEN 0.005 AND 1.0 keeps this idempotent (Σ becomes exactly 100).
UPDATE attribution_lines
   SET pct = ROUND(pct + (SELECT 100.0 - SUM(a2.pct) FROM attribution_lines a2
                           WHERE a2.txn_id = attribution_lines.txn_id), 6)
 WHERE txn_id IN (SELECT txn_id FROM attribution_lines
                   GROUP BY txn_id HAVING ABS(SUM(pct) - 100.0) BETWEEN 0.005 AND 1.0)
   AND id = (SELECT a3.id FROM attribution_lines a3
              WHERE a3.txn_id = attribution_lines.txn_id
              ORDER BY ABS(a3.amount) DESC, a3.id LIMIT 1);

-- Batch-summary log (counts only).
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
VALUES ('B04-pct-normalization', 'attribution_lines', NULL, '*batch*',
        'pct units mixed (fractional/NULL/Σ=200/99.99 rounding)',
        'pct normalized to 0-100; per-txn Σ=100 enforced in posting engine (CHECKs cannot span rows); MySQL: CHECK (pct BETWEEN 0 AND 100)',
        'migration_pack.sql §4', 'migration-agent');

COMMIT;

-- POST §4a: groups deviating from Σ=100 by more than 0.01.
-- EXPECT: 0
SELECT COUNT(*) AS post_s4_deviating_groups FROM (
  SELECT txn_id FROM attribution_lines
   GROUP BY txn_id HAVING ABS(ROUND(SUM(pct),2) - 100.0) > 0.01);
-- POST §4b: NULL pct remaining. EXPECT: 0
SELECT COUNT(*) AS post_s4_null_pct FROM attribution_lines WHERE pct IS NULL;
-- POST §4c: out-of-range pct (<0 or >100). EXPECT: 0
SELECT COUNT(*) AS post_s4_out_of_range FROM attribution_lines WHERE pct < 0 OR pct > 100;
-- POST §4d: txn 18600 footing. EXPECT: 100.0
SELECT ROUND(SUM(pct),4) AS post_s4_txn18600 FROM attribution_lines WHERE txn_id = 18600;


-- ============================================================================
-- §5  DATE / MONTH / CURRENCY (Plan §3.2)
-- Safeguards: snapshot pre_B5 · dry-run report · B5 batch-summary log rows.
-- ============================================================================
BEGIN IMMEDIATE;

-- PRE §5a: 19-char timestamps; all verified to end ' 00:00:00' (lossless).
-- EXPECT first run: 6,214 rows, 0 with non-midnight time.
SELECT COUNT(*) AS pre_s5_long_dates FROM transactions WHERE LENGTH(date) = 19;
SELECT COUNT(*) AS pre_s5_nonmidnight FROM transactions
 WHERE LENGTH(date) = 19 AND (SUBSTR(date,11,1) <> ' ' OR SUBSTR(date,12) <> '00:00:00');

-- date: truncate 19-char timestamps (lossless — guard enforces midnight).
-- Target production column: DATE NOT NULL.
UPDATE transactions SET date = SUBSTR(date,1,10)
 WHERE LENGTH(date) = 19 AND SUBSTR(date,11,1) = ' ' AND SUBSTR(date,12) = '00:00:00';

-- month: fill the 2 NULL months mechanically from date (ids 20057/20058),
-- then D4 RESOLVED (owner, 2026-08-07): recompute ALL months from date.
-- The 119 scotia_gold statement-cycle mismatches are intentionally collapsed:
-- owner confirmed nothing compares against Scotia statements, and the G.L.
-- journal derives fiscalYear/Month from date — so month = fiscal calendar
-- month everywhere. Old values logged per-row first (month strings only —
-- no descriptions, names, or amounts).
INSERT INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B05-month-fiscal-recompute', 'transactions', id, 'month', month, SUBSTR(date,1,7),
       'migration_pack.sql §5 (D4 resolved)', 'migration-agent'
  FROM transactions
 WHERE month IS NOT NULL AND month <> SUBSTR(date,1,7)
   AND NOT EXISTS (SELECT 1 FROM migration_change_log m
                    WHERE m.batch_id = 'B05-month-fiscal-recompute' AND m.row_id = transactions.id);

UPDATE transactions SET month = SUBSTR(date,1,7)
 WHERE date IS NOT NULL AND (month IS NULL OR month <> SUBSTR(date,1,7));

-- currency: D5 RESOLVED (owner, 2026-08-07): the two owner_journal mirror
-- rows (20057/20058, Director's Emoluments / clinic mirror) are USD.
UPDATE transactions SET currency = 'USD' WHERE id IN (20057, 20058) AND currency IS NULL;

-- Batch-summary log rows (counts only, no raw values).
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
VALUES
  ('B05-date-truncate', 'transactions', NULL, '*batch*',
   '6214 x 19-char timestamps (all end 00:00:00 — lossless)',
   'date = SUBSTR(date,1,10)', 'migration_pack.sql §5', 'migration-agent'),
  ('B05-month-null-fill', 'transactions', NULL, '*batch*',
   '2 NULL months (txn ids 20057,20058) + 119 scotia_gold statement-cycle mismatches',
   'D4 RESOLVED 2026-08-07: month = fiscal calendar month (SUBSTR(date,1,7)) for all rows; old values logged per-row',
   'migration_pack.sql §5 (D4 resolved)', 'migration-agent'),
  ('B05-currency-fill', 'transactions', NULL, '*batch*',
   '2 NULL currencies (txn ids 20057,20058)', 'D5 RESOLVED 2026-08-07: currency = USD',
   'migration_pack.sql §5', 'migration-agent');

COMMIT;

-- POST §5a: 19-char dates remaining. EXPECT: 0
SELECT COUNT(*) AS post_s5_long_dates FROM transactions WHERE LENGTH(date) = 19;
-- POST §5b: NULL months remaining. EXPECT: 0
SELECT COUNT(*) AS post_s5_null_months FROM transactions WHERE month IS NULL;
-- POST §5c: month mismatches remaining anywhere (incl. former scotia_gold
-- bucketing). EXPECT: 0 (D4 resolved — fiscal month everywhere)
SELECT COUNT(*) AS post_s5_month_mismatch FROM transactions
 WHERE month IS NOT NULL AND month <> SUBSTR(date,1,7);
-- POST §5d: NULL currencies remaining. EXPECT: 0 (D5 resolved)
SELECT COUNT(*) AS post_s5_null_currency FROM transactions WHERE currency IS NULL;


-- ============================================================================
-- §6  H5 VEHICLE OVERLAP — supersede + conflict queue (Plan §3.3)
-- Safeguards: snapshot pre_B6 · dry-run report · B6 batch-summary log rows.
-- Posting-engine rule (comment only, enforced in the engine):
--   allocation_lines XOR attribution_lines per txn, with a startup
--   assertion that the overlap set is empty after supersede flags are
--   honoured; anchor queries must EXCLUDE superseded lines.
-- ============================================================================
BEGIN IMMEDIATE;

ALTER TABLE attribution_lines ADD COLUMN superseded_by_allocation INTEGER NOT NULL DEFAULT 0;  -- [IDEMPOTENT-DDL]

CREATE TABLE IF NOT EXISTS h5_conflict_queue (
  txn_id        INTEGER PRIMARY KEY,
  attr_verticals TEXT,             -- GROUP_CONCAT of distinct attribution verticals
  alloc_targets TEXT,              -- GROUP_CONCAT of distinct allocation target_verticals
  status        TEXT NOT NULL DEFAULT 'open',
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PRE §6a: overlap lines by vertical.
-- EXPECT first run: REV=162, PERS=35, BL=10, MB=7 (214 overlap txns).
SELECT vertical, COUNT(*) AS pre_s6_overlap_lines FROM attribution_lines
 WHERE txn_id IN (SELECT DISTINCT txn_id FROM allocation_lines)
 GROUP BY vertical;

-- Supersede REV + PERS attribution lines on allocation∩attribution txns
-- (allocation wins only when the attribution side is REV or PERS-default).
UPDATE attribution_lines SET superseded_by_allocation = 1
 WHERE txn_id IN (SELECT DISTINCT txn_id FROM allocation_lines)
   AND vertical IN ('REV','PERS');

-- Non-REV business-attributed overlap txns -> workbench.
-- Plan §3.3 expected 27; staging measurement is 17 (10 BL + 7 MB) — see
-- migration report deviation note. ids + verticals only, no amounts.
INSERT OR IGNORE INTO h5_conflict_queue (txn_id, attr_verticals, alloc_targets, note)
SELECT a.txn_id,
       (SELECT GROUP_CONCAT(DISTINCT vertical) FROM attribution_lines WHERE txn_id = a.txn_id),
       (SELECT GROUP_CONCAT(DISTINCT target_vertical) FROM allocation_lines WHERE txn_id = a.txn_id),
       'non-REV business attribution contradicts allocation split — owner picks winner'
  FROM attribution_lines a
 WHERE a.txn_id IN (SELECT DISTINCT txn_id FROM allocation_lines)
   AND a.vertical NOT IN ('REV','PERS');

INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
VALUES ('B06-h5-supersede', 'attribution_lines', NULL, '*batch*',
        '197 REV/PERS overlap lines (162 REV + 35 PERS) unflagged',
        'superseded_by_allocation=1; business-attributed overlap txns queued in h5_conflict_queue',
        'migration_pack.sql §6', 'migration-agent');

COMMIT;

-- POST §6a: superseded lines. EXPECT first run: 197
SELECT COUNT(*) AS post_s6_superseded FROM attribution_lines WHERE superseded_by_allocation = 1;
-- POST §6b: h5 queue size. EXPECT: 17 (plan said 27 — deviation, measured).
SELECT COUNT(*) AS post_s6_queue FROM h5_conflict_queue;


-- ============================================================================
-- §7  CHILD-PII CATEGORY SCRUB (Plan §3.6 pre-step — BEFORE any mapping fill)
-- Safeguards: snapshot pre_B7 · dry-run report · per-row logs with the
--   child-identifying string REDACTED (IDs + redacted markers only).
-- Exact strings verified in staging attribution_lines (1 line each):
--   'Autism & Child Therapy (Tahj)'  -> 'FAM — Medical/Therapy'
--   'Autism & Child Travel (Tahj)'   -> 'FAM — Medical Travel'
-- Neither string exists in gl_category_map / transactions.category /
-- master_coa (checked) — guarded no-op UPDATEs included for completeness.
-- beneficiary_tags stays a SIDECAR table: never joined to journal entries,
-- QBO payloads, exports, or logs (invariant 10).
-- ============================================================================
BEGIN IMMEDIATE;

-- PRE §7: lines carrying child-identifying categories.
-- EXPECT first run: 2 (1 + 1)
SELECT COUNT(*) AS pre_s7_pii_lines FROM attribution_lines
 WHERE category IN ('Autism & Child Therapy (Tahj)','Autism & Child Travel (Tahj)');

INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B07-child-pii-scrub', 'attribution_lines', CAST(id AS TEXT), 'category',
       '[child-identifying category redacted]',
       CASE category WHEN 'Autism & Child Therapy (Tahj)' THEN 'FAM — Medical/Therapy'
                     ELSE 'FAM — Medical Travel' END,
       'migration_pack.sql §7', 'migration-agent'
  FROM attribution_lines
 WHERE category IN ('Autism & Child Therapy (Tahj)','Autism & Child Travel (Tahj)');

UPDATE attribution_lines SET category = 'FAM — Medical/Therapy' WHERE category = 'Autism & Child Therapy (Tahj)';
UPDATE attribution_lines SET category = 'FAM — Medical Travel'  WHERE category = 'Autism & Child Travel (Tahj)';

-- Same renames in the other category stores (no-op if absent).
UPDATE gl_category_map SET legacy_category = 'FAM — Medical/Therapy' WHERE legacy_category = 'Autism & Child Therapy (Tahj)';
UPDATE gl_category_map SET legacy_category = 'FAM — Medical Travel'  WHERE legacy_category = 'Autism & Child Travel (Tahj)';
UPDATE transactions SET category = 'FAM — Medical/Therapy' WHERE category = 'Autism & Child Therapy (Tahj)';
UPDATE transactions SET category = 'FAM — Medical Travel'  WHERE category = 'Autism & Child Travel (Tahj)';

COMMIT;

-- POST §7: child-identifying strings anywhere in category stores.
-- EXPECT: 0 in all three queries.
SELECT COUNT(*) AS post_s7_attr FROM attribution_lines WHERE category LIKE '%Tahj%' OR category LIKE '%Autism%';
SELECT COUNT(*) AS post_s7_gcm  FROM gl_category_map WHERE legacy_category LIKE '%Tahj%' OR legacy_category LIKE '%Autism%';
SELECT COUNT(*) AS post_s7_txn  FROM transactions WHERE category LIKE '%Tahj%' OR category LIKE '%Autism%';


-- ============================================================================
-- §8  MASTER_COA MERGE-THEN-RETIRE (Plan §3.6 — implemented exactly)
-- Safeguards: snapshot pre_B8 · dry-run report · B8 batch log rows.
-- master_coa holds the only 2 valid bindings for H7 categories plus the sole
-- is_suspense marker; qbo_account_map.master_account_id FK-references it, so
-- it is RENAMED (never dropped) until B.5 rebinds qbo_account_map on gl_code.
-- A compatibility VIEW keeps the name readable so re-runs stay idempotent.
-- ============================================================================
BEGIN IMMEDIATE;

ALTER TABLE gl_category_map ADD COLUMN is_suspense INTEGER NOT NULL DEFAULT 0;  -- [IDEMPOTENT-DDL]

-- PRE §8: valid gl_code bindings in master_coa not already bridged.
-- EXPECT first run: 2 rows ('Salary & Employment Income'->PERS-400,
-- 'Consultancy Income'->MM-410); re-run: 0.
SELECT m.name, m.gl_code FROM master_coa m
 WHERE m.gl_code IS NOT NULL AND m.gl_code <> '-'
   AND NOT EXISTS (SELECT 1 FROM gl_category_map g WHERE g.legacy_category = m.name);

-- Absorb valid bindings into the one bridge (invariant 6).
INSERT OR IGNORE INTO gl_category_map (legacy_category, gl_code, disposition, corrected_type, notes, is_suspense)
SELECT m.name, m.gl_code, 'keep', m.type,
       'absorbed from master_coa during merge-then-retire (migration_pack.sql §8); owner confirmation flagged per Plan §3.6',
       COALESCE(m.is_suspense, 0)
  FROM master_coa m
 WHERE m.gl_code IS NOT NULL AND m.gl_code <> '-';

-- Preserve the sole is_suspense marker onto matching bridge rows.
UPDATE gl_category_map SET is_suspense = 1
 WHERE legacy_category IN (SELECT name FROM master_coa WHERE is_suspense = 1);

INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
VALUES ('B08-master-coa-merge', 'gl_category_map', NULL, '*batch*',
        'master_coa active with 2 un-bridged bindings + is_suspense marker',
        'bindings absorbed into gl_category_map; is_suspense preserved; master_coa renamed master_coa_retired_20260807 (drop only after B.5 rebinds qbo_account_map to gl_code)',
        'migration_pack.sql §8', 'migration-agent');

COMMIT;

-- Rename (outside the transaction so the compat view can be created after it;
-- tagged idempotent DDL — second run raises "view master_coa may not be
-- altered", treated as benign skip by the runner).
ALTER TABLE master_coa RENAME TO master_coa_retired_20260807;  -- [IDEMPOTENT-DDL]
CREATE VIEW IF NOT EXISTS master_coa AS SELECT * FROM master_coa_retired_20260807;  -- compat shim until B.5

-- POST §8a: absorbed rows present in the bridge. EXPECT: 2 rows.
SELECT legacy_category, gl_code FROM gl_category_map
 WHERE legacy_category IN ('Salary & Employment Income','Consultancy Income');
-- POST §8b: retired table exists, original name is now a view. EXPECT: 1 / 1
SELECT COUNT(*) AS post_s8_retired_tbl FROM sqlite_master WHERE type='table' AND name='master_coa_retired_20260807';
SELECT COUNT(*) AS post_s8_compat_view FROM sqlite_master WHERE type='view' AND name='master_coa';

-- ============================================================================
-- §9  GL_CATEGORY_MAP LANDMINES (Plan §3.6)
-- Safeguards: snapshot pre_B9 · dry-run report · per-row logs in B9 batch.
-- ============================================================================
BEGIN IMMEDIATE;

-- PRE §9: the two equity landmines + the '-' gl_code row.
-- EXPECT first run: 2 rows typed 'Expense'; 1 row with gl_code='-'.
SELECT legacy_category, corrected_type FROM gl_category_map
 WHERE legacy_category IN ('Owner''s Draw','Owner''s Pay & Personal Expenses');
SELECT legacy_category, gl_code, disposition FROM gl_category_map WHERE gl_code = '-';

-- Retype equity rows from 'Expense' to 'Equity (our_stake)'.
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B09-equity-retype', 'gl_category_map', legacy_category, 'corrected_type',
       corrected_type, 'Equity (our_stake)', 'migration_pack.sql §9', 'migration-agent'
  FROM gl_category_map
 WHERE legacy_category IN ('Owner''s Draw','Owner''s Pay & Personal Expenses')
   AND corrected_type = 'Expense';

UPDATE gl_category_map SET corrected_type = 'Equity (our_stake)'
 WHERE legacy_category IN ('Owner''s Draw','Owner''s Pay & Personal Expenses')
   AND corrected_type = 'Expense';

-- Repair the gl_code='-' row (legacy_category 'Personal'): NULL gl_code,
-- disposition stays 'decision' (its Q5 workbench note is preserved).
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B09-dash-glcode-repair', 'gl_category_map', legacy_category, 'gl_code',
       '-', 'NULL + disposition decision', 'migration_pack.sql §9', 'migration-agent'
  FROM gl_category_map WHERE gl_code = '-';

UPDATE gl_category_map SET gl_code = NULL, disposition = 'decision'
 WHERE gl_code = '-';

COMMIT;

-- POST §9a: equity retype done. EXPECT: 2
SELECT COUNT(*) AS post_s9_equity FROM gl_category_map
 WHERE legacy_category IN ('Owner''s Draw','Owner''s Pay & Personal Expenses')
   AND corrected_type = 'Equity (our_stake)';
-- POST §9b: no '-' gl_codes remain. EXPECT: 0
SELECT COUNT(*) AS post_s9_dash FROM gl_category_map WHERE gl_code = '-';


-- ============================================================================
-- §10  GL_ACCOUNTS AMENDMENTS (Plan §3.6 / §5 tax amendments / §3.5 interest)
-- Safeguards: snapshot pre_B10 · dry-run report · per-row logs in B10 batch.
-- Existing codes inspected: BL money_out runs BL-500..BL-580, MB to MB-670,
-- PERS uses 3-digit codes (PERS-100..PERS-570). New codes chosen in free
-- ranges: BL-905/910/915, MB-680/685, PERS-2021 (4-digit per D1 fold spec).
-- ============================================================================
BEGIN IMMEDIATE;

ALTER TABLE gl_accounts ADD COLUMN tax_form_line TEXT;                        -- [IDEMPOTENT-DDL]
ALTER TABLE gl_accounts ADD COLUMN is_tax_relevant INTEGER NOT NULL DEFAULT 0;-- [IDEMPOTENT-DDL]
ALTER TABLE gl_accounts ADD COLUMN tax_jurisdiction TEXT;                     -- [IDEMPOTENT-DDL]

-- New accounts per plan:
--   BL Sch E gaps (depreciation 18 / mortgage interest 12 / property tax 16)
--   MB R&M + dedicated meals account (50% limitation — must stay separable)
--   PERS-2021 for the SELF-2007 Personal Branding fold (D1)
INSERT OR IGNORE INTO gl_accounts
  (code, vertical, purpose, name, ext_state, ext_target, notes, tax_form_line, is_tax_relevant, tax_jurisdiction) VALUES
  ('BL-905','BL','money_out','Depreciation — Lodges','pend',NULL,
     'added by migration_pack.sql §10 (Plan §3.6): Sch E line 18 was unpopulatable; per-property dimension still needed (no per-property data in staging)',
     'Sch E line 18',1,'US'),
  ('BL-910','BL','money_out','Mortgage Interest — Lodges','pend',NULL,
     'added by migration_pack.sql §10 (Plan §3.6): Sch E line 12 was unpopulatable',
     'Sch E line 12',1,'US'),
  ('BL-915','BL','money_out','Property Tax — Lodges','pend',NULL,
     'added by migration_pack.sql §10 (Plan §3.6): Sch E line 16 was unpopulatable',
     'Sch E line 16',1,'US'),
  ('MB-680','MB','money_out','Repairs & Maintenance — Machinery & Equipment','pend',NULL,
     'added by migration_pack.sql §10 (Plan §3.6): bridge target for Repairs & Maintenance (Machinery); Jamaica corporate deduction',
     'Jamaica corporate return — repairs',1,'JM'),
  ('MB-685','MB','money_out','Meals — Business (50% limitation)','pend',NULL,
     'added by migration_pack.sql §10 (Plan §3.6): dedicated meals sub-account; 50% limitation — MUST stay separable, never merge into travel',
     'Jamaica corporate return — meals (50% limitation)',1,'JM'),
  ('PERS-2021','PERS','money_out','Professional Services - Personal','local',NULL,
     'added by migration_pack.sql §10 (D1 fold): SELF-2007 Personal Branding has no clean home; post-fold NOT deductible (Form 2106/Sch A misc suspended through TY2025)',
     NULL,0,'US');

-- Interest correction (Plan §3.5): interest is card-charge EXPENSE, but the
-- four routing targets were wired as money_in "Interest Earned". Retype to
-- money_out interest expense. Evidence preserved in notes (prior notes kept,
-- retype appended). Guarded on purpose='money_in' so re-runs are no-ops.
-- Inspected current values: MB-420 'Interest Earned — Bakery' (interest MB
-- $7,896.34 / 89 rows), MM-420 'Interest Earned — Market' ($847.34 / 53),
-- BL-420 'Interest Earned — Lodges' ($3,805.09 / 64), TJP-410 'Interest
-- Earned' (GL $95.91 + BLab $0.44). NOTE: rollup covers only ~42% of the
-- $30,738.29 raw interest charges — owner must explain uncovered cards.
INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
SELECT 'B10-interest-retype', 'gl_accounts', code, 'purpose',
       purpose || ' (' || name || ')', 'money_out (Interest Expense)',
       'migration_pack.sql §10 / Plan §3.5', 'migration-agent'
  FROM gl_accounts
 WHERE code IN ('MB-420','MM-420','BL-420','TJP-410') AND purpose = 'money_in';

UPDATE gl_accounts
   SET purpose = 'money_out',
       name = REPLACE(name, 'Interest Earned', 'Interest Expense'),
       notes = COALESCE(notes,'') || ' | RETYPED 2026-08-07 per Plan §3.5: interest is card-charge EXPENSE (was money_in "Interest Earned"); rollup covers ~42% of raw interest charges — owner to explain uncovered cards',
       is_tax_relevant = 1
 WHERE code IN ('MB-420','MM-420','BL-420','TJP-410') AND purpose = 'money_in';

COMMIT;

-- POST §10a: new accounts present. EXPECT: 6
SELECT code, name, tax_form_line FROM gl_accounts
 WHERE code IN ('BL-905','BL-910','BL-915','MB-680','MB-685','PERS-2021');
-- POST §10b: interest accounts retyped. EXPECT: 0 money_in remainder / 4 money_out
SELECT COUNT(*) AS post_s10_interest_money_in FROM gl_accounts
 WHERE code IN ('MB-420','MM-420','BL-420','TJP-410') AND purpose = 'money_in';
SELECT code, purpose, name FROM gl_accounts WHERE code IN ('MB-420','MM-420','BL-420','TJP-410');


-- ============================================================================
-- §11  13-CATEGORY BRIDGE FILL (Plan §3.6 table — implemented exactly)
-- Safeguards: snapshot pre_B11 · dry-run report · B11 batch log row.
-- Runs AFTER §7 scrub, so the FAM medical rows use the scrubbed strings.
-- Category strings below verified verbatim against staging attribution_lines
-- (em-dash equity strings include the ' (equity)' suffix as stored).
-- disposition values: keep | decision | rail. Every row's notes flag whether
-- owner confirmation is required per the plan.
-- NOTE: rows 1–2 were already absorbed from master_coa in §8 (INSERT OR
-- IGNORE here is a no-op for them); rows 3–13 are new.
-- ============================================================================
BEGIN IMMEDIATE;

INSERT OR IGNORE INTO gl_category_map (legacy_category, gl_code, disposition, corrected_type, notes, is_suspense) VALUES
  ('Salary & Employment Income','PERS-400','keep','Income',
   '1040 line 1; JMD withholding question — OWNER CONFIRMATION REQUIRED (Plan §3.6)',0),
  ('Consultancy Income','MM-410','keep','Income',
   'Sch C line 1 + SE; confirm LLC classification — OWNER CONFIRMATION REQUIRED (Plan §3.6)',0),
  ('Director''s Emoluments (gross)','PERS-400','keep','Income',
   'mirror row; Jamaica PAYE/NIS/NHT/EdTax/HEART compliance note; aggregate=line leak (single $17,399.36 line) — sensitive_finance grant; OWNER CONFIRMATION REQUIRED',0),
  ('FAM — Medical/Therapy','FAM-540','keep','Expense',
   'scrubbed in §7 (was child-identifying); Sch A §213 7.5% floor; sensitive_finance grant — OWNER CONFIRMATION REQUIRED',0),
  ('FAM — Medical Travel','FAM-540','keep','Expense',
   'scrubbed in §7 (was child-identifying); medical-travel rules (primarily for/essential to medical care); sensitive_finance grant — OWNER CONFIRMATION REQUIRED',0),
  ('Interest Expense','MB-650','keep','Expense',
   'Jamaica corporate deduction; see §10 interest retype — confirmed per Plan §3.6',0),
  ('Repairs & Maintenance (Machinery)','MB-680','keep','Expense',
   'new MB-680 added in §10 — confirmed per Plan §3.6',0),
  ('Office Equipment','MB-130','keep','Expense',
   'capital-equipment asset account; consider capitalization threshold — OWNER CONFIRMATION REQUIRED',0),
  ('Travel - Meals','MB-685','keep','Expense',
   'new dedicated meals account added in §10; 50% limitation — must stay separable — confirmed per Plan §3.6',0),
  ('Capital — Owner Investment (equity)','MM-300','keep','Equity (our_stake)',
   'equity rail; Owner Investment 211 lines net -$1,810.81 matches MM-300 note (control); per-item contribution-vs-loan — OWNER CONFIRMATION REQUIRED',0),
  ('Capital — Owner Draw (equity)','MM-310','keep','Equity (our_stake)',
   'equity rail; reconcile against transfer_pairs representation so equity does not post twice — OWNER CONFIRMATION REQUIRED',0),
  ('Capital — Investment Withdrawal (equity)','PERS-110','decision','Equity (our_stake)',
   'PERS investment asset account; $30,797.95 American General variable-annuity distribution is a 1099-R event — review BEFORE any rail sweep — OWNER DECISION REQUIRED',0),
  ('Internal transfer (rail)',NULL,'rail','rail',
   'rail only: post via transfer_pairs, suppress P&L arm (precedence rule 1, Plan §3.4) — confirmed per Plan §3.6',0);

INSERT OR IGNORE INTO migration_change_log (batch_id, table_name, row_id, field, old_value, new_value, script, actor)
VALUES ('B11-bridge-fill', 'gl_category_map', NULL, '*batch*',
        '13 named category gaps un-bridged (of 169 in-use categories; 1,268 NULL-category lines / $485,795.89 separately need disposition before G3)',
        '13-category bridge fill per Plan §3.6 table; owner confirmations flagged in notes',
        'migration_pack.sql §11', 'migration-agent');

COMMIT;

-- POST §11a: all 13 categories bridged (gl_code or explicit rail NULL).
-- EXPECT: 13 rows; only 'Internal transfer (rail)' has gl_code NULL with
-- disposition 'rail', plus 'Capital — Investment Withdrawal (equity)' at
-- disposition 'decision'.
SELECT legacy_category, gl_code, disposition FROM gl_category_map
 WHERE legacy_category IN (
   'Salary & Employment Income','Consultancy Income','Director''s Emoluments (gross)',
   'FAM — Medical/Therapy','FAM — Medical Travel','Interest Expense',
   'Repairs & Maintenance (Machinery)','Office Equipment','Travel - Meals',
   'Capital — Owner Investment (equity)','Capital — Owner Draw (equity)',
   'Capital — Investment Withdrawal (equity)','Internal transfer (rail)');
-- POST §11b: no unmapped non-rail rows among the 13. EXPECT: 0
SELECT COUNT(*) AS post_s11_unmapped FROM gl_category_map
 WHERE legacy_category IN (
   'Salary & Employment Income','Consultancy Income','Director''s Emoluments (gross)',
   'FAM — Medical/Therapy','FAM — Medical Travel','Interest Expense',
   'Repairs & Maintenance (Machinery)','Office Equipment','Travel - Meals',
   'Capital — Owner Investment (equity)','Capital — Owner Draw (equity)',
   'Capital — Investment Withdrawal (equity)','Internal transfer (rail)')
   AND gl_code IS NULL AND disposition <> 'rail';


-- ============================================================================
-- §12  PERFORMANCE INDEXES (perf review — SQLite syntax; MySQL equivalents
-- in comments). All CREATE INDEX IF NOT EXISTS — natively idempotent.
-- Safeguards: snapshot pre_B12 · no data changes (indexes only).
-- ============================================================================
BEGIN IMMEDIATE;

-- Anchor + rollup scans.
CREATE INDEX IF NOT EXISTS ix_attr_vertical_amount   ON attribution_lines (vertical, amount);
CREATE INDEX IF NOT EXISTS ix_attr_txn               ON attribution_lines (txn_id);
CREATE INDEX IF NOT EXISTS ix_attr_vertical_cat_amt  ON attribution_lines (vertical, category, amount);
-- Transaction access paths.
CREATE INDEX IF NOT EXISTS ix_txn_account_date_id    ON transactions (account_id, date, id);
CREATE INDEX IF NOT EXISTS ix_txn_month              ON transactions (month);
-- Lineage + allocations.
CREATE INDEX IF NOT EXISTS ix_editlog_line           ON edit_log (line_id);
CREATE INDEX IF NOT EXISTS ix_alloc_txn              ON allocation_lines (txn_id);

-- Rail-sweep ABS-amount match (348x measured speedup vs quadratic ±1-day
-- self-join).
--   SQLite : expression index (below).
--   MySQL  : ALTER TABLE transactions
--              ADD COLUMN abs_amount DECIMAL(15,2)
--              GENERATED ALWAYS AS (ABS(amount)) STORED,
--            ADD INDEX ix_txn_absamt (abs_amount);
CREATE INDEX IF NOT EXISTS ix_txn_absamt ON transactions (ABS(amount));

COMMIT;

-- POST §12: all 8 indexes exist. EXPECT: 8
SELECT COUNT(*) AS post_s12_indexes FROM sqlite_master
 WHERE type='index' AND name IN (
   'ix_attr_vertical_amount','ix_attr_txn','ix_attr_vertical_cat_amt',
   'ix_txn_account_date_id','ix_txn_month','ix_editlog_line','ix_alloc_txn',
   'ix_txn_absamt');


-- ============================================================================
-- §13  ANCHOR_CACHE DDL (Plan §5 perf non-negotiables / invariant 8)
-- Self-busting memo table only — anchors are COMPUTED, never stored as
-- system of record. watermark = MAX(edit_log.id), NEVER edited_at
-- (format-mixed column). Cache entry is valid only while
--   watermark = (SELECT MAX(id) FROM edit_log).
-- Safeguards: snapshot pre_B13 · DDL only, no data changes.
-- ============================================================================
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS anchor_cache (
  vertical    TEXT PRIMARY KEY,
  anchor      DECIMAL(15,2) NOT NULL,
  watermark   INTEGER NOT NULL,      -- MAX(edit_log.id) at compute time
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

COMMIT;

-- POST §13: anchor_cache exists with expected columns. EXPECT: 4
SELECT COUNT(*) AS post_s13_cols FROM pragma_table_info('anchor_cache')
 WHERE name IN ('vertical','anchor','watermark','computed_at');

-- ============================================================================
-- END OF PACK — run POST validations and compare against the EXPECT comments
-- above. Open owner decisions referenced here: D4 (scotia_gold month
-- bucketing), D5 (2 NULL currencies), D6 (realm list), plus per-row
-- confirmation flags in §11 notes and the dedupe_conflict_queue (65) /
-- h5_conflict_queue (17) workbenches.
-- NEXT STEP (Plan v2.2 §2.6): staging→production transfer —
-- docs/finance/staging_to_production_transfer.sql + TRANSFER_RUNBOOK.md.
-- ============================================================================
