-- ═══════════════════════════════════════════════════════════════════════════
-- Phase A — Unified Finance v2.2 production schema delta
-- Spec: docs/Geeves_Unified_Finance_Implementation_Plan_v2.2.md §2.5
-- Target: production MySQL 8.0 (utf8mb4_0900_ai_ci), DECIMAL(15,2) money columns.
-- Resolves Manus review CRITICAL-1 (no production migration), CRITICAL-2
-- (chart_of_accounts canonical + real glAccountId FK, D8), CRITICAL-3
-- (vertical code↔UUID bridge), CRITICAL-6 (reversal mechanics), HIGH-2/3/4/5/8.
-- NOTE: journal_entries.householdId is added here even though §2.5's delta table
-- omits it — D7/invariant 11 require householdId as the top-level scope key on
-- every financial table and journal_entries lacked one. Nullable + backfilled in
-- Phase B (all rows → TJ Perkins Global, V8lk3KJatvxBTWURf4uo9).
-- NOTE: audit_log.category is already varchar(64) in production (not an enum as
-- the Manus review assumed), so 'financial' needs NO schema change (HIGH-5).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── journal_entries: reversal mechanics (CRITICAL-6) + recon state (HIGH-3) ─
ALTER TABLE `journal_entries` ADD COLUMN `householdId` varchar(36);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `status` enum('draft','posted','reversed','reversal') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reversesEntryId` varchar(21);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reversedByEntryId` varchar(21);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reversalReason` text;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reversedBy` varchar(36);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reversedAt` timestamp;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reconStatus` enum('unreconciled','matched','verified','disputed') NOT NULL DEFAULT 'unreconciled';--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reconRef` varchar(128);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reconciledAt` timestamp;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD COLUMN `reconciledBy` varchar(36);--> statement-breakpoint
-- Double reversal impossible by constraint, not convention (v2.2 §4.5).
CREATE UNIQUE INDEX `je_reversed_by_uniq` ON `journal_entries` (`reversedByEntryId`);--> statement-breakpoint
CREATE INDEX `je_household_idx` ON `journal_entries` (`householdId`);--> statement-breakpoint
CREATE INDEX `je_status_idx` ON `journal_entries` (`status`);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `je_reverses_fk` FOREIGN KEY (`reversesEntryId`) REFERENCES `journal_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `je_reversed_by_fk` FOREIGN KEY (`reversedByEntryId`) REFERENCES `journal_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
-- Backfill: existing rows with is_posted=1 are 'posted', the rest 'draft'.
UPDATE `journal_entries` SET `status` = 'posted' WHERE `is_posted` = 1;--> statement-breakpoint

-- ─── journal_lines: real glAccountId FK (D8/CRITICAL-2) + line vertical + reporting currency (HIGH-4) + receipt link (HIGH-8) ─
-- glAccountId widened 21 → 32 to match chart_of_accounts.id (varchar(32));
-- the FK target type must match exactly or MySQL rejects the constraint.
ALTER TABLE `journal_lines` MODIFY COLUMN `glAccountId` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD COLUMN `verticalId` varchar(36);--> statement-breakpoint
ALTER TABLE `journal_lines` ADD COLUMN `reporting_amount` decimal(15,2);--> statement-breakpoint
ALTER TABLE `journal_lines` ADD COLUMN `reporting_currency` varchar(3);--> statement-breakpoint
ALTER TABLE `journal_lines` ADD COLUMN `receipt_id` varchar(21);--> statement-breakpoint
CREATE INDEX `jl_vertical_idx` ON `journal_lines` (`verticalId`);--> statement-breakpoint
CREATE INDEX `jl_receipt_idx` ON `journal_lines` (`receipt_id`);--> statement-breakpoint
ALTER TABLE `journal_lines` ADD CONSTRAINT `jl_gl_account_fk` FOREIGN KEY (`glAccountId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint

-- ─── verticals: code bridge (CRITICAL-3) + system buckets + reporting currency + redaction label ─
ALTER TABLE `verticals` ADD COLUMN `code` varchar(16);--> statement-breakpoint
ALTER TABLE `verticals` ADD COLUMN `isSystemBucket` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `verticals` ADD COLUMN `reportingCurrency` varchar(3);--> statement-breakpoint
ALTER TABLE `verticals` ADD COLUMN `financeRedactedLabel` varchar(100) DEFAULT 'Internal — Personal';--> statement-breakpoint
CREATE UNIQUE INDEX `verticals_code_uniq` ON `verticals` (`code`);--> statement-breakpoint

-- ─── households: reporting currency (HIGH-4) ─
ALTER TABLE `households` ADD COLUMN `reportingCurrency` varchar(3) NOT NULL DEFAULT 'USD';--> statement-breakpoint

-- ─── vertical_owners: financial co-admin flag (D9/CRITICAL-5) ─
ALTER TABLE `vertical_owners` ADD COLUMN `isFinancialOwner` boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- ─── transfer_pairs: enum → varchar(50) backed by transfer_rail_types (HIGH-2) ─
ALTER TABLE `transfer_pairs` MODIFY COLUMN `transferType` varchar(50) NOT NULL;--> statement-breakpoint
CREATE TABLE `transfer_rail_types` (
	`code` varchar(50) NOT NULL,
	`label` varchar(255) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `transfer_rail_types_code` PRIMARY KEY(`code`)
);--> statement-breakpoint
-- Seeded with the existing 7 enum values + the 6 new rails from v2.2 §2.5.
-- NO `square` row — Square is an explicit non-goal (v2.2 §8, owner decision 2026-08-07).
INSERT IGNORE INTO `transfer_rail_types` (`code`, `label`, `description`) VALUES
	('venmo', 'Venmo', 'Venmo peer-to-peer rail'),
	('zelle', 'Zelle', 'Zelle bank-to-bank rail'),
	('atm', 'ATM Withdrawal', 'Cash withdrawal rail'),
	('owner_draw', 'Owner Draw', 'Owner draw / equity distribution'),
	('loan_payment', 'Loan Payment', 'Loan principal/interest payment rail'),
	('credit_card_payment', 'Credit Card Payment', 'Card balance payment rail'),
	('internal_transfer', 'Internal Transfer', 'Between own accounts, same vertical'),
	('stripe', 'Stripe Clearing', 'Merchant clearing: gross charges → income, fees → fee expense, net payout → asset transfer'),
	('ota_payout', 'OTA Payout', 'Booking-platform payout clearing (Airbnb/Vrbo/Booking.com)'),
	('card_funding', 'Card Funding', 'Card funding / top-up rail'),
	('wire', 'Wire Transfer', 'Bank wire rail'),
	('ach', 'ACH Transfer', 'ACH rail'),
	('multi_clearing', 'Multi-Vertical Clearing', 'MULTI bucket clearing rail — never posts to P&L');--> statement-breakpoint

-- ─── tax_documents: fix invalid default "pers" (CRITICAL-3 live bug) ─
ALTER TABLE `tax_documents` ALTER COLUMN `verticalId` DROP DEFAULT;--> statement-breakpoint

-- ─── workbench_queue (new, A10) ─
CREATE TABLE `workbench_queue` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`verticalId` varchar(36),
	`tentativeVerticalId` varchar(36),
	`queueType` enum('uncategorised','vertical_assignment','dedupe_conflict','allocation_conflict','pair_attribution_overlap','mis_paired_deposit','rail_sweep','unattributed') NOT NULL,
	`status` enum('open','in_progress','resolved','deferred') NOT NULL DEFAULT 'open',
	`amount` decimal(15,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`sourceTable` varchar(50),
	`sourceId` varchar(36),
	`payload` json,
	`assignedToMemberId` varchar(36),
	`resolvedByMemberId` varchar(36),
	`resolvedAt` timestamp,
	`resolutionNote` text,
	`journalEntryId` varchar(21),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workbench_queue_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `wq_household_status_idx` ON `workbench_queue` (`householdId`, `status`);--> statement-breakpoint
CREATE INDEX `wq_vertical_idx` ON `workbench_queue` (`verticalId`, `status`);--> statement-breakpoint
CREATE INDEX `wq_tentative_idx` ON `workbench_queue` (`tentativeVerticalId`);--> statement-breakpoint
CREATE INDEX `wq_queue_type_idx` ON `workbench_queue` (`queueType`, `status`);--> statement-breakpoint
CREATE INDEX `wq_materiality_idx` ON `workbench_queue` (`status`, `amount`);--> statement-breakpoint

-- ─── receipt_images (new, A11; bytes in S3 via storagePut — never DB blobs) ─
CREATE TABLE `receipt_images` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`verticalId` varchar(36),
	`storageKey` varchar(500) NOT NULL,
	`originalFileName` varchar(255),
	`mimeType` varchar(50),
	`file_size_bytes` int,
	`source` enum('camera','file') NOT NULL DEFAULT 'file',
	`uploadedByMemberId` varchar(36),
	`uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`extractedText` text,
	`extraction_confidence` int,
	`journalEntryId` varchar(21),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receipt_images_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `ri_household_idx` ON `receipt_images` (`householdId`);--> statement-breakpoint
CREATE INDEX `ri_entry_idx` ON `receipt_images` (`journalEntryId`);--> statement-breakpoint
ALTER TABLE `journal_lines` ADD CONSTRAINT `jl_receipt_fk` FOREIGN KEY (`receipt_id`) REFERENCES `receipt_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint

-- ─── period_locks (new, A12; unlock = dual control + mandatory reason) ─
CREATE TABLE `period_locks` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`fiscal_year` int NOT NULL,
	`fiscal_month` int NOT NULL,
	`lockedByMemberId` varchar(36) NOT NULL,
	`locked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`unlockedByMemberId` varchar(36),
	`unlockApprovedByMemberId` varchar(36),
	`unlockReason` text,
	`unlocked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `period_locks_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `pl_household_period_uniq` ON `period_locks` (`householdId`, `fiscal_year`, `fiscal_month`);--> statement-breakpoint

-- ─── Registry + migration bookkeeping (A12; MySQL production twins of the staging SQLite tables) ─
CREATE TABLE `vertical_code_map` (
	`staging_code` varchar(16) NOT NULL,
	`vertical_id` varchar(36),
	`doc_code` varchar(16),
	`display_name` varchar(255) NOT NULL,
	`doc_display_name` varchar(255),
	`account_prefix` varchar(16) NOT NULL,
	`is_system_bucket` boolean NOT NULL DEFAULT false,
	`qbo_entity` varchar(255),
	`sync_allowlisted` boolean NOT NULL DEFAULT false,
	`status` enum('active','retired','merged') NOT NULL DEFAULT 'active',
	`merged_into` varchar(16),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vertical_code_map_staging_code` PRIMARY KEY(`staging_code`)
);--> statement-breakpoint
CREATE INDEX `vcm_vertical_idx` ON `vertical_code_map` (`vertical_id`);--> statement-breakpoint
ALTER TABLE `vertical_code_map` ADD CONSTRAINT `vcm_vertical_fk` FOREIGN KEY (`vertical_id`) REFERENCES `verticals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
-- Registry seed per v2.2 §2.4: D6 sync_allowlisted = true for EXACTLY MB + MM;
-- Geeves.Life qbo_entity = 'pending' (realm does not exist yet); SELF merged into PERS (D1).
INSERT IGNORE INTO `vertical_code_map` (`staging_code`, `display_name`, `doc_display_name`, `account_prefix`, `is_system_bucket`, `qbo_entity`, `sync_allowlisted`, `status`, `merged_into`, `notes`) VALUES
	('MB', 'Maxfield Bakery', 'Maxfield Bakery', 'MB', false, 'Maxfield Bakery QBO (realm 123145971566304)', true, 'active', NULL, 'D6 allowlisted realm 1 of 2'),
	('MM', 'Maxfield Market', 'Maxfield Market', 'MM', false, 'Maxfield Market QBO (realm 9130350512376806)', true, 'active', NULL, 'D6 allowlisted realm 2 of 2'),
	('BL', 'Bohemian Lodges', 'Bohemian Lodges', 'BL', false, 'geeves_only', false, 'active', NULL, 'Export-ready, not sync-allowlisted'),
	('PERS', 'Personal', 'Personal', 'PERS', false, NULL, false, 'active', NULL, 'Hard-excluded from QBO export (D6)'),
	('FAM', 'Home & Family', 'Home & Family', 'FAM', false, NULL, false, 'active', NULL, 'Hard-excluded from QBO export (D6); production vertical row to confirm at migration'),
	('GL', 'Geeves.Life', 'Geeves.Life', 'GL', false, 'pending', false, 'active', NULL, 'CRITICAL-1b fix: realm does not exist yet — pending, not a third realm'),
	('SO', 'StartOut', 'StartOut', 'SO', false, 'geeves_only', false, 'active', NULL, NULL),
	('BLab', 'Beta Lab', 'Beta Lab', 'BLAB', false, 'geeves_only', false, 'active', NULL, NULL),
	('TJPGG', 'TJP Global Group', 'TJP Global Group', 'TJP', false, 'geeves_only', false, 'active', NULL, 'Invariant 7: TJP prefix retained'),
	('SELF', 'Self (merged)', 'Self', 'SELF', false, NULL, false, 'merged', 'PERS', 'D1: SELF folded into PERS; zero DB rows'),
	('REV', 'Needs Review', 'Needs Review', 'REV', true, NULL, false, 'active', NULL, 'System bucket — never posts, never user-selectable'),
	('MULTI', 'Multi-Vertical Rail', 'Multi-Vertical Rail', 'MULTI', true, NULL, false, 'active', NULL, 'System bucket — rail clearing only, never posts to P&L');--> statement-breakpoint

CREATE TABLE `migration_change_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`batch_id` varchar(64) NOT NULL,
	`snapshot_id` varchar(128) NOT NULL,
	`table_name` varchar(128) NOT NULL,
	`row_key` varchar(128) NOT NULL,
	`change_type` enum('insert','update','delete','move','retype') NOT NULL,
	`old_value_hash` varchar(64),
	`new_value_hash` varchar(64),
	`old_value_summary` varchar(255),
	`new_value_summary` varchar(255),
	`applied_by` varchar(128) NOT NULL,
	`dry_run` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `migration_change_log_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `mcl_batch_idx` ON `migration_change_log` (`batch_id`);--> statement-breakpoint
CREATE INDEX `mcl_table_idx` ON `migration_change_log` (`table_name`, `row_key`);--> statement-breakpoint

CREATE TABLE `retired_txn_map` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`retired_txn_id` varchar(64) NOT NULL,
	`surviving_txn_id` varchar(64),
	`dedupe_class` varchar(32) NOT NULL,
	`batch_id` varchar(64) NOT NULL,
	`reason` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `retired_txn_map_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `rtm_retired_uniq` ON `retired_txn_map` (`retired_txn_id`);--> statement-breakpoint
CREATE INDEX `rtm_surviving_idx` ON `retired_txn_map` (`surviving_txn_id`);--> statement-breakpoint

CREATE TABLE `anchor_cache` (
	`cache_key` varchar(191) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`payload` json NOT NULL,
	`watermark` bigint NOT NULL,
	`computed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `anchor_cache_cache_key` PRIMARY KEY(`cache_key`)
);--> statement-breakpoint
CREATE INDEX `ac_household_idx` ON `anchor_cache` (`householdId`);--> statement-breakpoint

-- ─── Vertical seed (CRITICAL-3): codes are vocabulary, UUIDs are keys (invariant 13) ─
-- Backfill codes onto existing vertical rows by name match (idempotent: only where code IS NULL).
UPDATE `verticals` SET `code` = 'MB' WHERE `code` IS NULL AND LOWER(`name`) LIKE '%maxfield bakery%';--> statement-breakpoint
UPDATE `verticals` SET `code` = 'MM' WHERE `code` IS NULL AND LOWER(`name`) LIKE '%maxfield market%';--> statement-breakpoint
UPDATE `verticals` SET `code` = 'BL' WHERE `code` IS NULL AND (LOWER(`name`) LIKE '%bohemian%' OR LOWER(`name`) LIKE '%blue lagoon%');--> statement-breakpoint
UPDATE `verticals` SET `code` = 'PERS' WHERE `code` IS NULL AND LOWER(`name`) LIKE '%personal%';--> statement-breakpoint
UPDATE `verticals` SET `code` = 'SO' WHERE `code` IS NULL AND LOWER(`name`) LIKE '%startout%';--> statement-breakpoint
UPDATE `verticals` SET `code` = 'FAM' WHERE `code` IS NULL AND LOWER(`name`) LIKE '%fam%';--> statement-breakpoint
-- BL reports in JMD (production QBO realm runs a JMD home currency — HIGH-4).
UPDATE `verticals` SET `reportingCurrency` = 'JMD' WHERE `code` = 'BL' AND `reportingCurrency` IS NULL;--> statement-breakpoint
-- Seed the five missing registry verticals into the Global ledger household (D7).
-- Deterministic ids so re-runs and downstream references are stable; colours/icons
-- are placeholders to be set from the approved brand palette at checklist E18.
INSERT INTO `verticals` (`id`, `householdId`, `name`, `code`, `isSystemBucket`, `reportingCurrency`, `financeRedactedLabel`, `isActive`, `sortOrder`, `privacyLevel`)
SELECT 'vert-TJPGG-000000000000000001', 'V8lk3KJatvxBTWURf4uo9', 'TJP Global Group', 'TJPGG', false, 'USD', 'Inter-company', true, 90, 'admin_only'
WHERE NOT EXISTS (SELECT 1 FROM `verticals` WHERE `code` = 'TJPGG');--> statement-breakpoint
INSERT INTO `verticals` (`id`, `householdId`, `name`, `code`, `isSystemBucket`, `reportingCurrency`, `financeRedactedLabel`, `isActive`, `sortOrder`, `privacyLevel`)
SELECT 'vert-BLab-0000000000000000001', 'V8lk3KJatvxBTWURf4uo9', 'Beta Lab', 'BLab', false, 'USD', 'Inter-company', true, 91, 'admin_only'
WHERE NOT EXISTS (SELECT 1 FROM `verticals` WHERE `code` = 'BLab');--> statement-breakpoint
INSERT INTO `verticals` (`id`, `householdId`, `name`, `code`, `isSystemBucket`, `reportingCurrency`, `financeRedactedLabel`, `isActive`, `sortOrder`, `privacyLevel`)
SELECT 'vert-GL-000000000000000000001', 'V8lk3KJatvxBTWURf4uo9', 'Geeves.Life', 'GL', false, 'USD', 'Inter-company', true, 92, 'admin_only'
WHERE NOT EXISTS (SELECT 1 FROM `verticals` WHERE `code` = 'GL');--> statement-breakpoint
INSERT INTO `verticals` (`id`, `householdId`, `name`, `code`, `isSystemBucket`, `reportingCurrency`, `financeRedactedLabel`, `isActive`, `sortOrder`, `privacyLevel`)
SELECT 'vert-REV-00000000000000000001', 'V8lk3KJatvxBTWURf4uo9', 'Needs Review', 'REV', true, 'USD', 'Internal — Personal', true, 98, 'admin_only'
WHERE NOT EXISTS (SELECT 1 FROM `verticals` WHERE `code` = 'REV');--> statement-breakpoint
INSERT INTO `verticals` (`id`, `householdId`, `name`, `code`, `isSystemBucket`, `reportingCurrency`, `financeRedactedLabel`, `isActive`, `sortOrder`, `privacyLevel`)
SELECT 'vert-MULTI-000000000000000001', 'V8lk3KJatvxBTWURf4uo9', 'Multi-Vertical Rail', 'MULTI', true, 'USD', 'Inter-company', true, 99, 'admin_only'
WHERE NOT EXISTS (SELECT 1 FROM `verticals` WHERE `code` = 'MULTI');--> statement-breakpoint
-- Bridge the registry to production UUIDs (§2.3: vertical_code_map.vertical_id).
UPDATE `vertical_code_map` m JOIN `verticals` v ON v.`code` = m.`staging_code` SET m.`vertical_id` = v.`id` WHERE m.`vertical_id` IS NULL;--> statement-breakpoint
