-- ═══════════════════════════════════════════════════════════════════════════
-- Phase A PATCH — Unified Finance v2.2 (verifier gap closure)
-- Spec: docs/Geeves_Unified_Finance_Implementation_Plan_v2.2.md §2.5
-- Closes verifier gaps on 0053:
--   1. journal_lines.householdId — D7/invariant 11 requires householdId as the
--      top-level scope key on EVERY financial table; 0053 added it to
--      journal_entries but missed the line table. varchar(36) to match
--      journal_entries.householdId exactly; nullable pending backfill (the
--      parent entry column is itself nullable until the Phase B transfer
--      backfills all rows to TJ Perkins Global, V8lk3KJatvxBTWURf4uo9).
--   2. A19 — UNIQUE (householdId, accountNumber) on chart_of_accounts: account
--      numbers are per-household vocabulary; duplicates would make QBO mapping
--      and account-prefix derivation (§2.3) ambiguous.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PRE-FLIGHT GUARDS — run these BEFORE applying 0053/0054, eyeball results ─
--
-- (a) journal_lines rows with NULL or orphaned glAccountId — MUST be 0 rows
--     before the 0053 jl_gl_account_fk constraint is applied, or the FK
--     creation fails / silently depends on row order:
--
--   SELECT l.`id`, l.`journalEntryId`, l.`glAccountId`
--   FROM `journal_lines` l
--   LEFT JOIN `chart_of_accounts` c ON c.`id` = l.`glAccountId`
--   WHERE l.`glAccountId` IS NULL OR c.`id` IS NULL;
--
-- (b) verticals name→code backfill match preview — eyeball the heuristic
--     mapping BEFORE the 0053 UPDATEs run; any row mapping to the wrong code
--     (or NULL = unmatched) must be fixed by hand first:
--
--   SELECT `id`, `name`,
--     CASE
--       WHEN LOWER(`name`) LIKE '%maxfield bakery%' THEN 'MB'
--       WHEN LOWER(`name`) LIKE '%maxfield market%' THEN 'MM'
--       WHEN LOWER(`name`) LIKE '%bohemian%' OR LOWER(`name`) LIKE '%blue lagoon%' THEN 'BL'
--       WHEN LOWER(`name`) LIKE '%personal%' THEN 'PERS'
--       WHEN LOWER(`name`) LIKE '%startout%' THEN 'SO'
--       WHEN LOWER(`name`) LIKE '%fam%' THEN 'FAM'
--       ELSE NULL
--     END AS `derived_code`
--   FROM `verticals`
--   WHERE `code` IS NULL
--   ORDER BY `name`;
--
-- (c) chart_of_accounts duplicate (householdId, accountNumber) — MUST be 0
--     rows before the A19 unique index below is created:
--
--   SELECT `householdId`, `accountNumber`, COUNT(*) AS n
--   FROM `chart_of_accounts`
--   GROUP BY `householdId`, `accountNumber`
--   HAVING n > 1;
--
-- (d) post-backfill orphan/NULL check for journal_lines.householdId — rows
--     still NULL after the backfill below indicate lines whose parent entry
--     has no householdId yet (expected for pre-Phase-B rows) OR lines with a
--     dangling journalEntryId (NOT expected — investigate):
--
--   SELECT l.`id`, l.`journalEntryId`, e.`householdId` AS parent_household
--   FROM `journal_lines` l
--   LEFT JOIN `journal_entries` e ON e.`id` = l.`journalEntryId`
--   WHERE l.`householdId` IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── journal_lines: householdId scope key (D7/invariant 11) ──────────────────
-- Denormalised from the parent entry so ledger/P&L queries never join through
-- the header for the tenant boundary. Type matches journal_entries.householdId
-- exactly (varchar(36), nullable).
ALTER TABLE `journal_lines` ADD COLUMN `householdId` varchar(36);--> statement-breakpoint
CREATE INDEX `jl_household_idx` ON `journal_lines` (`householdId`);--> statement-breakpoint
-- Backfill from the parent entry (idempotent: only where still NULL). Rows whose
-- parent entry householdId is itself NULL stay NULL until the Phase B transfer
-- backfills journal_entries — re-run this statement after that backfill.
UPDATE `journal_lines` l
JOIN `journal_entries` e ON e.`id` = l.`journalEntryId`
SET l.`householdId` = e.`householdId`
WHERE l.`householdId` IS NULL;--> statement-breakpoint

-- ─── chart_of_accounts: A19 — account numbers unique per household ────────────
CREATE UNIQUE INDEX `coa_household_account_number_uniq` ON `chart_of_accounts` (`householdId`, `accountNumber`);--> statement-breakpoint
