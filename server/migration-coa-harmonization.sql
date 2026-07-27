-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PART A: INGEST master_coa INTO chart_of_accounts                           │
-- │ Creates initial records for all 191 accounts with vertical prefix codes    │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Temporarily disable unique constraint during ingestion
SET @disable_checks = 1;

-- Common household ID placeholder (to be updated with actual household in production)
-- Using a sentinel value for migration; update post-migration
SET @household_id = 'HH_SYSTEM_MIGRATION';

-- Insert all 191 accounts from master_coa into chart_of_accounts
-- Each gets a nanoid-style ID and vertical prefix based on name analysis

INSERT INTO `chart_of_accounts` (
  `id`, `verticalId`, `householdId`, `accountType`, `detailType`, `accountName`,
  `accountNumber`, `description`, `displayOrder`, `qboAccountId`, `qboFullyQualifiedName`,
  `qboSyncStatus`, `isActive`, `isDefault`, `isSystemAccount`, `isTaxRelevant`,
  `taxFormLine`, `taxJurisdiction`, `createdAt`, `updatedAt`, `createdBy`
) VALUES
  ('odJFCrnl2edlBDdz1C5Ja', 'SHARED', @household_id, 'expense', '(no QBO — Geeves.life only)', '(no QBO — Geeves.life only)', 'SHARED-001', 'Migrated from master_coa.id=1 | purpose=money_out | vertical=SHARED', 1, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('u2RJtBRnlWmTSHf6pWkLU', 'SHARED', @household_id, 'expense', '6040 Computer & Internet', '6040 Computer & Internet', 'SHARED-002', 'Migrated from master_coa.id=2 | purpose=money_out | vertical=SHARED', 2, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('yifDLkDmWJ6UuVTAIjvFu', 'SHARED', @household_id, 'expense', '6130 Supplies', '6130 Supplies', 'SHARED-003', 'Migrated from master_coa.id=3 | purpose=money_out | vertical=SHARED', 3, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('7WICPhDeOZIiBOB-Y6sHr', 'SHARED', @household_id, 'expense', 'ATM', 'ATM', 'SHARED-004', 'Migrated from master_coa.id=4 | purpose=money_out | vertical=SHARED', 4, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('FH2ZUCr-lgotu2iXW7Gbo', 'SHARED', @household_id, 'expense', 'ATM/Mobile Deposit', 'ATM/Mobile Deposit', 'SHARED-005', 'Migrated from master_coa.id=5 | purpose=money_out | vertical=SHARED', 5, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('IRoL3u6aHwnMztVuaP_co', 'SHARED', @household_id, 'expense', 'Adjustments (review)', 'Adjustments (review)', 'SHARED-006', 'Migrated from master_coa.id=6 | purpose=money_out | vertical=SHARED', 6, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('UNEhEkk_iqq8vH2BzNZV4', 'SHARED', @household_id, 'expense', 'Administrative Expenses', 'Administrative Expenses', 'SHARED-007', 'Migrated from master_coa.id=7 | purpose=money_out | vertical=SHARED', 7, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('5pFCiRcDCajhDieQjEJ_B', 'PERS', @household_id, 'expense', 'Allowance', 'Allowance', 'PERS-008', 'Migrated from master_coa.id=8 | purpose=money_out | vertical=PERS', 8, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('q8F80ymm3T207gmhZRnFy', 'SHARED', @household_id, 'expense', 'Amazon', 'Amazon', 'SHARED-009', 'Migrated from master_coa.id=9 | purpose=money_out | vertical=SHARED', 9, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('y5r2xJ7Fj4mgblEv0_9BZ', 'SHARED', @household_id, 'asset', 'Amazon credit/refund', 'Amazon credit/refund', 'SHARED-010', 'Migrated from master_coa.id=10 | purpose=we_own | vertical=SHARED', 10, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hvWaXH6K2_tyLBhhOhg9u', 'SHARED', @household_id, 'expense', 'Amazon gift/combo payment', 'Amazon gift/combo payment', 'SHARED-011', 'Migrated from master_coa.id=11 | purpose=money_out | vertical=SHARED', 11, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hkxiiEZpFfk1OHAOEHYqM', 'SHARED', @household_id, 'expense', 'Amazon order — charge not found on statement', 'Amazon order — charge not found on statement', 'SHARED-012', 'Migrated from master_coa.id=12 | purpose=money_out | vertical=SHARED', 12, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6Ojb6mjBHqSiFVKu4MbMn', 'SHARED', @household_id, 'expense', 'Amazon — not in order files', 'Amazon — not in order files', 'SHARED-013', 'Migrated from master_coa.id=13 | purpose=money_out | vertical=SHARED', 13, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rHontIKARAH_Ggl2JfaQq', 'SHARED', @household_id, 'expense', 'American Express - Business', 'American Express - Business', 'SHARED-014', 'Migrated from master_coa.id=14 | purpose=money_out | vertical=SHARED', 14, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Hu42bojteVs3qfNUfTAFn', 'SHARED', @household_id, 'income', 'Annuity Payout', 'Annuity Payout', 'SHARED-015', 'Migrated from master_coa.id=15 | purpose=money_in | vertical=SHARED', 15, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('T0tEuw0dwQ0FIunWe8Cz6', 'SHARED', @household_id, 'expense', 'Ask My Accountant', 'Ask My Accountant', 'SHARED-016', 'Migrated from master_coa.id=16 | purpose=money_out | vertical=SHARED', 16, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('SNDCdyZQJiJSZQdoHwHen', 'SHARED', @household_id, 'liability', 'Auto Loan Payment', 'Auto Loan Payment', 'SHARED-017', 'Migrated from master_coa.id=17 | purpose=we_owe | vertical=SHARED', 17, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('3SO3oXyGf3azU3iQOpMN0', 'BKY', @household_id, 'expense', 'Bakery Operations', 'Bakery Operations', 'BKY-018', 'Migrated from master_coa.id=18 | purpose=money_out | vertical=BKY', 18, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('PZLqy1WwMZaMKA3P744B8', 'BKY', @household_id, 'expense', 'Bakery: Advertising Expense', 'Bakery: Advertising Expense', 'BKY-019', 'Migrated from master_coa.id=19 | purpose=money_out | vertical=BKY', 19, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('vkKQlENCzsdfF8j61yX-Z', 'BKY', @household_id, 'expense', 'Bakery: Legal and Professional Expenses', 'Bakery: Legal and Professional Expenses', 'BKY-020', 'Migrated from master_coa.id=20 | purpose=money_out | vertical=BKY', 20, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Fsan2Cw7gFp6r7O425u85', 'BKY', @household_id, 'expense', 'Bakery: Staff Welfare', 'Bakery: Staff Welfare', 'BKY-021', 'Migrated from master_coa.id=21 | purpose=money_out | vertical=BKY', 21, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('HFJ_EJ4jKEIQOkrtDXtBi', 'BKY', @household_id, 'expense', 'Bakery: Wages and Salaries:Director''s Emoluments', 'Bakery: Wages and Salaries:Director''s Emoluments', 'BKY-022', 'Migrated from master_coa.id=22 | purpose=money_out | vertical=BKY', 22, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('10Q71hA1XcW9aTMX1C_CI', 'SHARED', @household_id, 'expense', 'Bank Charges & Fees', 'Bank Charges & Fees', 'SHARED-023', 'Migrated from master_coa.id=23 | purpose=money_out | vertical=SHARED', 23, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('3_dXRZv7qdYdk2r7xgHWP', 'SHARED', @household_id, 'asset', 'Bank Deposit', 'Bank Deposit', 'SHARED-024', 'Migrated from master_coa.id=24 | purpose=we_own | vertical=SHARED', 24, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('B6PRWJ1Gk8cgSCifdFzct', 'SHARED', @household_id, 'expense', 'Bank Fees & Charges', 'Bank Fees & Charges', 'SHARED-025', 'Migrated from master_coa.id=25 | purpose=money_out | vertical=SHARED', 25, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Eq8oB7GVvouNndNWYzjFn', 'SHARED', @household_id, 'income', 'Bank Interest', 'Bank Interest', 'SHARED-026', 'Migrated from master_coa.id=26 | purpose=money_in | vertical=SHARED', 26, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('MpfS2ViRb1_n3U6t3wI97', 'BL', @household_id, 'expense', 'Bohemian: Bank Fees', 'Bohemian: Bank Fees', 'BL-027', 'Migrated from master_coa.id=27 | purpose=money_out | vertical=BL', 27, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('3IPFlJ5F7WRd-Px_BTHRJ', 'BL', @household_id, 'expense', 'Bohemian: Cleaning Expense (Rental Property)', 'Bohemian: Cleaning Expense (Rental Property)', 'BL-028', 'Migrated from master_coa.id=28 | purpose=money_out | vertical=BL', 28, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('JbykE0_E8_5clLCZFNV8S', 'BL', @household_id, 'income', 'Bohemian: Long Term Rental Income', 'Bohemian: Long Term Rental Income', 'BL-029', 'Migrated from master_coa.id=29 | purpose=money_in | vertical=BL', 29, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('2QT6INGDpyOpxyB9JKmyL', 'BL', @household_id, 'expense', 'Bohemian: Repairs & Maintenance', 'Bohemian: Repairs & Maintenance', 'BL-030', 'Migrated from master_coa.id=30 | purpose=money_out | vertical=BL', 30, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('DUwMbqJfgLq_nbK894Rxg', 'BL', @household_id, 'expense', 'Bohemian: Travel', 'Bohemian: Travel', 'BL-031', 'Migrated from master_coa.id=31 | purpose=money_out | vertical=BL', 31, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('G9oiZ_jgttMkFp1CW54M2', 'BL', @household_id, 'expense', 'Bohemian: Utilities', 'Bohemian: Utilities', 'BL-032', 'Migrated from master_coa.id=32 | purpose=money_out | vertical=BL', 32, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('NhmABHkuEwjua058LeDKK', 'SHARED', @household_id, 'asset', 'Brokerage Withdrawal', 'Brokerage Withdrawal', 'SHARED-033', 'Migrated from master_coa.id=33 | purpose=we_own | vertical=SHARED', 33, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6jDHz2oCtIsjhvNK4p7MZ', 'SHARED', @household_id, 'expense', 'Business and Trade License Expenses', 'Business and Trade License Expenses', 'SHARED-034', 'Migrated from master_coa.id=34 | purpose=money_out | vertical=SHARED', 34, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('I-4kf3PGdlDcIfw84Jx3_', 'SHARED', @household_id, 'liability', 'CapitalOne Credit Card', 'CapitalOne Credit Card', 'SHARED-035', 'Migrated from master_coa.id=35 | purpose=we_owe | vertical=SHARED', 35, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('l8S0QPnuQ0-KZe6lOGPoZ', 'SHARED', @household_id, 'expense', 'Car & Truck', 'Car & Truck', 'SHARED-036', 'Migrated from master_coa.id=36 | purpose=money_out | vertical=SHARED', 36, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('a70gyU-4gAIqK4_pdEuNb', 'SHARED', @household_id, 'asset', 'Cash App', 'Cash App', 'SHARED-037', 'Migrated from master_coa.id=37 | purpose=we_own | vertical=SHARED', 37, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('0lCo7pt-LI198F6sXyriJ', 'PERS', @household_id, 'expense', 'Childcare', 'Childcare', 'PERS-038', 'Migrated from master_coa.id=38 | purpose=money_out | vertical=PERS', 38, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('1RIaKM_t59SQW6PyEXD0f', 'BL', @household_id, 'expense', 'Cleaning Expense (Rental Property)', 'Cleaning Expense (Rental Property)', 'BL-039', 'Migrated from master_coa.id=39 | purpose=money_out | vertical=BL', 39, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('O8WXt-eqQm4m6bs0tj8HR', 'SHARED', @household_id, 'expense', 'Cleaning and Sanitationi', 'Cleaning and Sanitationi', 'SHARED-040', 'Migrated from master_coa.id=40 | purpose=money_out | vertical=SHARED', 40, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('YkQWO_eiEKDl3mm4vMdfP', 'SHARED', @household_id, 'expense', 'Computer & Internet Expenses', 'Computer & Internet Expenses', 'SHARED-041', 'Migrated from master_coa.id=41 | purpose=money_out | vertical=SHARED', 41, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hLTV3sF0xvwkWE-sD7G6G', 'SHARED', @household_id, 'expense', 'Cost of Goods sold:Packaging', 'Cost of Goods sold:Packaging', 'SHARED-042', 'Migrated from master_coa.id=42 | purpose=money_out | vertical=SHARED', 42, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('b7Kuj4SM2G6MzX9nEWTLL', 'PERS', @household_id, 'expense', 'Dining', 'Dining', 'PERS-043', 'Migrated from master_coa.id=43 | purpose=money_out | vertical=PERS', 43, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('cYJbg-KDTCyGrmfN4eUql', 'SELF', @household_id, 'expense', 'Director Emolument', 'Director Emolument', 'SELF-044', 'Migrated from master_coa.id=44 | purpose=money_out | vertical=SELF', 44, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('LP1wzqUIvG9LRo7jsCYUl', 'SHARED', @household_id, 'expense', 'E-commerce Platform', 'E-commerce Platform', 'SHARED-045', 'Migrated from master_coa.id=45 | purpose=money_out | vertical=SHARED', 45, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('YbHp6VHWVnD8dPCi7M0or', 'SHARED', @household_id, 'expense', 'Electronics / Tablet', 'Electronics / Tablet', 'SHARED-046', 'Migrated from master_coa.id=46 | purpose=money_out | vertical=SHARED', 46, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('feM-omErX6V1t1m_0JeVB', 'PERS', @household_id, 'expense', 'Entertainment', 'Entertainment', 'PERS-047', 'Migrated from master_coa.id=47 | purpose=money_out | vertical=PERS', 47, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('44EUmVThYJyp6lBcgQFqA', 'SHARED', @household_id, 'expense', 'Financial services (review)', 'Financial services (review)', 'SHARED-048', 'Migrated from master_coa.id=48 | purpose=money_out | vertical=SHARED', 48, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('iABDQsaJsqGwodqbTEPcw', 'SHARED', @household_id, 'expense', 'Forex', 'Forex', 'SHARED-049', 'Migrated from master_coa.id=49 | purpose=money_out | vertical=SHARED', 49, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Hgq1oi85Un5CfM6dh9Z2n', 'SHARED', @household_id, 'liability', 'Friends and Family Loans', 'Friends and Family Loans', 'SHARED-050', 'Migrated from master_coa.id=50 | purpose=we_owe | vertical=SHARED', 50, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('_4jkPsiqJPWL63moB35D0', 'SHARED', @household_id, 'liability', 'Friends and Family Loans:Dr Millicent Comrie Loan', 'Friends and Family Loans:Dr Millicent Comrie Loan', 'SHARED-051', 'Migrated from master_coa.id=51 | purpose=we_owe | vertical=SHARED', 51, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('R6Z1mO2OGVt8ilkl3mVqh', 'SHARED', @household_id, 'expense', 'Fulfillment', 'Fulfillment', 'SHARED-052', 'Migrated from master_coa.id=52 | purpose=money_out | vertical=SHARED', 52, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Qp0T2gKNTnBt9CnSVoJC2', 'SHARED', @household_id, 'asset', 'Fundrise', 'Fundrise', 'SHARED-053', 'Migrated from master_coa.id=53 | purpose=we_own | vertical=SHARED', 53, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('dIdxINRSaxsZisdlBW16R', 'SHARED', @household_id, 'expense', 'Gift/combo payment', 'Gift/combo payment', 'SHARED-054', 'Migrated from master_coa.id=54 | purpose=money_out | vertical=SHARED', 54, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('uVNPkgtugkI42_41IBoS3', 'SHARED', @household_id, 'expense', 'Google', 'Google', 'SHARED-055', 'Migrated from master_coa.id=55 | purpose=money_out | vertical=SHARED', 55, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('oK_NfCYhaAMBrGLPpa-3w', 'SHARED', @household_id, 'expense', 'Government & Filing', 'Government & Filing', 'SHARED-056', 'Migrated from master_coa.id=56 | purpose=money_out | vertical=SHARED', 56, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('qWDTjYf3c6jO2Z1LoZcPv', 'PERS', @household_id, 'expense', 'Groceries', 'Groceries', 'PERS-057', 'Migrated from master_coa.id=57 | purpose=money_out | vertical=PERS', 57, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6Ul3nF3ZkYNRCQvjoySSs', 'PERS', @household_id, 'expense', 'Groceries (review)', 'Groceries (review)', 'PERS-058', 'Migrated from master_coa.id=58 | purpose=money_out | vertical=PERS', 58, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('EnsGzwtjw-75POt4i84MJ', 'PERS', @household_id, 'expense', 'Groceries/Household', 'Groceries/Household', 'PERS-059', 'Migrated from master_coa.id=59 | purpose=money_out | vertical=PERS', 59, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hTjN75ehVKjlX7f5yP8th', 'PERS', @household_id, 'expense', 'Grooming', 'Grooming', 'PERS-060', 'Migrated from master_coa.id=60 | purpose=money_out | vertical=PERS', 60, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('5nRkwfF44uUVKX0RgQiQm', 'PERS', @household_id, 'expense', 'Grooming / Hair Care', 'Grooming / Hair Care', 'PERS-061', 'Migrated from master_coa.id=61 | purpose=money_out | vertical=PERS', 61, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('XKGtQksSNYqkNWQql2UcU', 'SHARED', @household_id, 'expense', 'Ground transport (review)', 'Ground transport (review)', 'SHARED-062', 'Migrated from master_coa.id=62 | purpose=money_out | vertical=SHARED', 62, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('NxBR_yCrtjLmeRqWtuxv4', 'PERS', @household_id, 'expense', 'Health', 'Health', 'PERS-063', 'Migrated from master_coa.id=63 | purpose=money_out | vertical=PERS', 63, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('f0UE4K5DEN8yV47KW1uzr', 'PERS', @household_id, 'expense', 'Health / Wellness', 'Health / Wellness', 'PERS-064', 'Migrated from master_coa.id=64 | purpose=money_out | vertical=PERS', 64, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Gg9VnpKkuI5s3lC5Sd1gY', 'PERS', @household_id, 'expense', 'Home & Family', 'Home & Family', 'PERS-065', 'Migrated from master_coa.id=65 | purpose=money_out | vertical=PERS', 65, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('VEXkVCdOmQsreK8r85akc', 'PERS', @household_id, 'expense', 'Home Improvement', 'Home Improvement', 'PERS-066', 'Migrated from master_coa.id=66 | purpose=money_out | vertical=PERS', 66, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('GBt2oKEMpgE16io-cEsL2', 'SHARED', @household_id, 'expense', 'Insurance', 'Insurance', 'SHARED-067', 'Migrated from master_coa.id=67 | purpose=money_out | vertical=SHARED', 67, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('aTE1xkUicX8fXVGcTiSEn', 'SHARED', @household_id, 'expense', 'Insurance Reimbursement', 'Insurance Reimbursement', 'SHARED-068', 'Migrated from master_coa.id=68 | purpose=money_out | vertical=SHARED', 68, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('QrfTRw79xri6eLzfzfONY', 'SHARED', @household_id, 'income', 'Interest Earned', 'Interest Earned', 'SHARED-069', 'Migrated from master_coa.id=69 | purpose=money_in | vertical=SHARED', 69, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('8GeyKTgQIpV3Z4XRx--VI', 'SHARED', @household_id, 'income', 'Interest Income', 'Interest Income', 'SHARED-070', 'Migrated from master_coa.id=70 | purpose=money_in | vertical=SHARED', 70, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('k2k3xLPnkPLN52v4S5fT3', 'SHARED', @household_id, 'expense', 'Internal Transfer', 'Internal Transfer', 'SHARED-071', 'Migrated from master_coa.id=71 | purpose=money_out | vertical=SHARED', 71, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('JhjZUuds4eqiEUUXet5VV', 'PERS', @household_id, 'expense', 'Kids Accessories', 'Kids Accessories', 'PERS-072', 'Migrated from master_coa.id=72 | purpose=money_out | vertical=PERS', 72, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('4jrUYOJFodx-XpHH5BK_z', 'PERS', @household_id, 'expense', 'Kids Allowance', 'Kids Allowance', 'PERS-073', 'Migrated from master_coa.id=73 | purpose=money_out | vertical=PERS', 73, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('prj5w4lOSiLMuwUCpzrE-', 'PERS', @household_id, 'expense', 'Kids Bedding', 'Kids Bedding', 'PERS-074', 'Migrated from master_coa.id=74 | purpose=money_out | vertical=PERS', 74, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('dUV7qliNY900jqOj57Sqx', 'PERS', @household_id, 'expense', 'Kids Furniture', 'Kids Furniture', 'PERS-075', 'Migrated from master_coa.id=75 | purpose=money_out | vertical=PERS', 75, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('q3hptMvuPCSKkGzJqMlvt', 'PERS', @household_id, 'expense', 'Kids Room / Decor', 'Kids Room / Decor', 'PERS-076', 'Migrated from master_coa.id=76 | purpose=money_out | vertical=PERS', 76, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('vRfdkfHA1d-LM9FZM6jhu', 'SHARED', @household_id, 'liability', 'Loan', 'Loan', 'SHARED-077', 'Migrated from master_coa.id=77 | purpose=we_owe | vertical=SHARED', 77, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('4197ARsOOSZqVnOE7pI5F', 'SHARED', @household_id, 'liability', 'Loan Repayment', 'Loan Repayment', 'SHARED-078', 'Migrated from master_coa.id=78 | purpose=we_owe | vertical=SHARED', 78, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('smgLX1FuPOyu-7-N-clY6', 'BKY', @household_id, 'liability', 'Loan to Maxfield Bakery & Pastries', 'Loan to Maxfield Bakery & Pastries', 'BKY-079', 'Migrated from master_coa.id=79 | purpose=we_owe | vertical=BKY', 79, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('EBTggK-8Kbn3rHUZUfZgy', 'BL', @household_id, 'income', 'Long Term Rental Income', 'Long Term Rental Income', 'BL-080', 'Migrated from master_coa.id=80 | purpose=money_in | vertical=BL', 80, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('UKjX5JpqmYVRUszZfferQ', 'MKT', @household_id, 'expense', 'Market: Bank Charges & Fees', 'Market: Bank Charges & Fees', 'MKT-081', 'Migrated from master_coa.id=81 | purpose=money_out | vertical=MKT', 81, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('86trPOuYMR_M8cVQo1Nd8', 'SHARED', @household_id, 'expense', 'Marketing & Ads', 'Marketing & Ads', 'SHARED-082', 'Migrated from master_coa.id=82 | purpose=money_out | vertical=SHARED', 82, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('HDg9vWsFeoyc4O1t0A08h', 'SHARED', @household_id, 'expense', 'Marketing & Advertising', 'Marketing & Advertising', 'SHARED-083', 'Migrated from master_coa.id=83 | purpose=money_out | vertical=SHARED', 83, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rAP9WOw6RTH9yFJMCMKA_', 'SHARED', @household_id, 'expense', 'Memberships (review)', 'Memberships (review)', 'SHARED-084', 'Migrated from master_coa.id=84 | purpose=money_out | vertical=SHARED', 84, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('O9SJKpWYSsLfKkS4G9BzI', 'SHARED', @household_id, 'expense', 'Merchandise', 'Merchandise', 'SHARED-085', 'Migrated from master_coa.id=85 | purpose=money_out | vertical=SHARED', 85, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('IrnEFgCDgm0Q8mrau089z', 'GL', @household_id, 'expense', 'Mind / Spiritual', 'Mind / Spiritual', 'GL-086', 'Migrated from master_coa.id=86 | purpose=money_out | vertical=GL', 86, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('KPKhlDew1weY-xLebMnQK', 'SHARED', @household_id, 'expense', 'NY Times', 'NY Times', 'SHARED-087', 'Migrated from master_coa.id=87 | purpose=money_out | vertical=SHARED', 87, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6-r7IyoQu6GxbRLywZ2Pl', 'SELF', @household_id, 'equity', 'Owner''s Draw', 'Owner''s Draw', 'SELF-088', 'Migrated from master_coa.id=88 | purpose=our_stake | vertical=SELF', 88, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Zmxr9PFaHXE5IQMbHUEhp', 'SELF', @household_id, 'asset', 'Owner''s Investment', 'Owner''s Investment', 'SELF-089', 'Migrated from master_coa.id=89 | purpose=we_own | vertical=SELF', 89, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('7NuZNpLVCCr9t6V18BFk5', 'PERS', @household_id, 'expense', 'Owner''s Pay & Personal Expenses', 'Owner''s Pay & Personal Expenses', 'PERS-090', 'Migrated from master_coa.id=90 | purpose=money_out | vertical=PERS', 90, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('UjohztvP4oA_l5h6q16h7', 'SHARED', @household_id, 'expense', 'PayPal', 'PayPal', 'SHARED-091', 'Migrated from master_coa.id=91 | purpose=money_out | vertical=SHARED', 91, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('NcYGaBjf2Sihi8eK0xr1V', 'SHARED', @household_id, 'expense', 'Person-to-person (review)', 'Person-to-person (review)', 'SHARED-092', 'Migrated from master_coa.id=92 | purpose=money_out | vertical=SHARED', 92, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('W5WWkrSpwYqCacM72WDF6', 'PERS', @household_id, 'expense', 'Personal', 'Personal', 'PERS-093', 'Migrated from master_coa.id=93 | purpose=money_out | vertical=PERS', 93, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('StJyoe1cEAime5gFfZ4DB', 'PERS', @household_id, 'expense', 'Personal / Intimate Health', 'Personal / Intimate Health', 'PERS-094', 'Migrated from master_coa.id=94 | purpose=money_out | vertical=PERS', 94, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hrLDOPEMsC0MJhw2-gSWO', 'PERS', @household_id, 'expense', 'Personal Accessories', 'Personal Accessories', 'PERS-095', 'Migrated from master_coa.id=95 | purpose=money_out | vertical=PERS', 95, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('10tMWx8ECMs7h01rXFGAQ', 'PERS', @household_id, 'expense', 'Personal Care', 'Personal Care', 'PERS-096', 'Migrated from master_coa.id=96 | purpose=money_out | vertical=PERS', 96, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('k5VlygIWfjyB9AQMbByp9', 'PERS', @household_id, 'expense', 'Personal Items', 'Personal Items', 'PERS-097', 'Migrated from master_coa.id=97 | purpose=money_out | vertical=PERS', 97, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('FAYEPKW7TNHU-7m8OAVO0', 'PERS', @household_id, 'expense', 'Personal: Food & Groceries', 'Personal: Food & Groceries', 'PERS-098', 'Migrated from master_coa.id=98 | purpose=money_out | vertical=PERS', 98, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('fCscH1LtzQDWF-RG__6vT', 'PERS', @household_id, 'expense', 'Personal: Healthcare', 'Personal: Healthcare', 'PERS-099', 'Migrated from master_coa.id=99 | purpose=money_out | vertical=PERS', 99, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('vr_xhejga0rDitbB6Vh9_', 'PERS', @household_id, 'expense', 'Personal: Insurance', 'Personal: Insurance', 'PERS-100', 'Migrated from master_coa.id=100 | purpose=money_out | vertical=PERS', 100, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ca0bcJKc3wnmtEyGTIYkV', 'PERS', @household_id, 'expense', 'Personal: Transportation', 'Personal: Transportation', 'PERS-101', 'Migrated from master_coa.id=101 | purpose=money_out | vertical=PERS', 101, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Z6FCMkelZWW8hbvk-3Qmf', 'PERS', @household_id, 'expense', 'Personal: Utilities', 'Personal: Utilities', 'PERS-102', 'Migrated from master_coa.id=102 | purpose=money_out | vertical=PERS', 102, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('DB8IfjJewOcAsYjMuEXQX', 'SHARED', @household_id, 'expense', 'Phone', 'Phone', 'SHARED-103', 'Migrated from master_coa.id=103 | purpose=money_out | vertical=SHARED', 103, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rkSgm3DjRYPdI5_DTW3xW', 'SELF', @household_id, 'expense', 'Professional Services', 'Professional Services', 'SELF-104', 'Migrated from master_coa.id=104 | purpose=money_out | vertical=SELF', 104, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('kLFjkItWtXOUnlaN4UInq', 'SHARED', @household_id, 'asset', 'Property', 'Property', 'SHARED-105', 'Migrated from master_coa.id=105 | purpose=we_own | vertical=SHARED', 105, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('lx350ndlTlPXbL0XkFvWv', 'SHARED', @household_id, 'asset', 'Property (review)', 'Property (review)', 'SHARED-106', 'Migrated from master_coa.id=106 | purpose=we_own | vertical=SHARED', 106, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rIMI-siv3J1M9jUGF-z6n', 'SHARED', @household_id, 'asset', 'Property - Furnishings', 'Property - Furnishings', 'SHARED-107', 'Migrated from master_coa.id=107 | purpose=we_own | vertical=SHARED', 107, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rMaYQWQ4Q3rMPz9OwYOL_', 'SHARED', @household_id, 'asset', 'Property - Improvements', 'Property - Improvements', 'SHARED-108', 'Migrated from master_coa.id=108 | purpose=we_own | vertical=SHARED', 108, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('FPWJYUozxd7A4Li0-rMEG', 'SHARED', @household_id, 'expense', 'Property Insurance Expense', 'Property Insurance Expense', 'SHARED-109', 'Migrated from master_coa.id=109 | purpose=money_out | vertical=SHARED', 109, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('t2Wj59Z1eUknFTvfZQ3nb', 'SHARED', @household_id, 'asset', 'Real Estate Fund', 'Real Estate Fund', 'SHARED-110', 'Migrated from master_coa.id=110 | purpose=we_own | vertical=SHARED', 110, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('mHCC5VY7tSd9nL1kosSNR', 'SHARED', @household_id, 'expense', 'Reimbursable Expenses', 'Reimbursable Expenses', 'SHARED-111', 'Migrated from master_coa.id=111 | purpose=money_out | vertical=SHARED', 111, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6A9S8m45OiMfocRnvFwuQ', 'SHARED', @household_id, 'expense', 'Rent', 'Rent', 'SHARED-112', 'Migrated from master_coa.id=112 | purpose=money_out | vertical=SHARED', 112, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('27DZxx3Ydz52XaBAJinxU', 'SHARED', @household_id, 'expense', 'Rent & Lease', 'Rent & Lease', 'SHARED-113', 'Migrated from master_coa.id=113 | purpose=money_out | vertical=SHARED', 113, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Pz6oH_OXYoST6wMkrOpEN', 'SHARED', @household_id, 'expense', 'Repairs & Maintenance', 'Repairs & Maintenance', 'SHARED-114', 'Migrated from master_coa.id=114 | purpose=money_out | vertical=SHARED', 114, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('oxVsX1rX2x_wv_KrxO5gT', 'SHARED', @household_id, 'expense', 'Retail (review)', 'Retail (review)', 'SHARED-115', 'Migrated from master_coa.id=115 | purpose=money_out | vertical=SHARED', 115, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('b_ryX-0_14_vkdCLeJCKv', 'SHARED', @household_id, 'expense', 'Retail Supplies', 'Retail Supplies', 'SHARED-116', 'Migrated from master_coa.id=116 | purpose=money_out | vertical=SHARED', 116, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('6-ooIUf4B2nFMe5HSl4pE', 'SHARED', @household_id, 'expense', 'Robinhood', 'Robinhood', 'SHARED-117', 'Migrated from master_coa.id=117 | purpose=money_out | vertical=SHARED', 117, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('AS2vrAAhSJvPLLImr0hJq', 'SO', @household_id, 'liability', 'SMBX LOAN PRINCIPAL', 'SMBX LOAN PRINCIPAL', 'SO-118', 'Migrated from master_coa.id=118 | purpose=we_owe | vertical=SO', 118, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('qFsPFY_sI1W5jlZJV6_Pa', 'SELF', @household_id, 'expense', 'Salary', 'Salary', 'SELF-119', 'Migrated from master_coa.id=119 | purpose=money_out | vertical=SELF', 119, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('l6TiYB2B-IPKRq_Rgfm6c', 'SHARED', @household_id, 'income', 'Sale of Services - Consutlancy Income', 'Sale of Services - Consutlancy Income', 'SHARED-120', 'Migrated from master_coa.id=120 | purpose=money_in | vertical=SHARED', 120, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('pu46a2zqMuJlUGkVvgYND', 'SHARED', @household_id, 'income', 'Sales of Product Income', 'Sales of Product Income', 'SHARED-121', 'Migrated from master_coa.id=121 | purpose=money_in | vertical=SHARED', 121, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('2lmaB9jqC4bbRp2q9jDXl', 'BKY', @household_id, 'income', 'Sales:Easter Bun Sales', 'Sales:Easter Bun Sales', 'BKY-122', 'Migrated from master_coa.id=122 | purpose=money_in | vertical=BKY', 122, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('nnOVMrWrsibv4SBt04Blm', 'BKY', @household_id, 'income', 'Sales:Spice Bun Sales', 'Sales:Spice Bun Sales', 'BKY-123', 'Migrated from master_coa.id=123 | purpose=money_in | vertical=BKY', 123, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rpXS2OrFJkFKdMAyYLgE-', 'SHARED', @household_id, 'expense', 'School Supplies', 'School Supplies', 'SHARED-124', 'Migrated from master_coa.id=124 | purpose=money_out | vertical=SHARED', 124, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('XoE-jbUOqX1Uw8jcibHBf', 'SHARED', @household_id, 'expense', 'Scotia gold', 'Scotia gold', 'SHARED-125', 'Migrated from master_coa.id=125 | purpose=money_out | vertical=SHARED', 125, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hYK12ZktJkNkAtPYiN3Eh', 'SHARED', @household_id, 'expense', 'Settlement', 'Settlement', 'SHARED-126', 'Migrated from master_coa.id=126 | purpose=money_out | vertical=SHARED', 126, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Fl3o6hNwpbrbu-SHvVqIp', 'SHARED', @household_id, 'expense', 'Shipping COST', 'Shipping COST', 'SHARED-127', 'Migrated from master_coa.id=127 | purpose=money_out | vertical=SHARED', 127, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('dQ2IiHj-6Uh-vVuGnoDaf', 'PERS', @household_id, 'expense', 'Shopping', 'Shopping', 'PERS-128', 'Migrated from master_coa.id=128 | purpose=money_out | vertical=PERS', 128, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('bFf8UXtwe1CPF1OIjVpgw', 'BL', @household_id, 'income', 'Short Term Rental Income', 'Short Term Rental Income', 'BL-129', 'Migrated from master_coa.id=129 | purpose=money_in | vertical=BL', 129, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('CfZi7KNPl6bVzLMF7V-zF', 'BL', @household_id, 'income', 'Short Term Rental Income:Airbnb Rental Income', 'Short Term Rental Income:Airbnb Rental Income', 'BL-130', 'Migrated from master_coa.id=130 | purpose=money_in | vertical=BL', 130, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ta0dDSbQaWNnAE1_hsJlf', 'BL', @household_id, 'income', 'Short Term Rental Income:Booking.com Income', 'Short Term Rental Income:Booking.com Income', 'BL-131', 'Migrated from master_coa.id=131 | purpose=money_in | vertical=BL', 131, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('D0V6kmrYjh3qELHOYPO5I', 'BL', @household_id, 'income', 'Short Term Rental Income:VRBO Income', 'Short Term Rental Income:VRBO Income', 'BL-132', 'Migrated from master_coa.id=132 | purpose=money_in | vertical=BL', 132, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('Djzrntnv57O0pTA5N7Hpl', 'SHARED', @household_id, 'expense', 'Software & AI Tools', 'Software & AI Tools', 'SHARED-133', 'Migrated from master_coa.id=133 | purpose=money_out | vertical=SHARED', 133, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('uMfBPslFTYgMHwdZ5Fm7n', 'SHARED', @household_id, 'expense', 'Software (review)', 'Software (review)', 'SHARED-134', 'Migrated from master_coa.id=134 | purpose=money_out | vertical=SHARED', 134, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('rpbhCqzZVkHjciz4qlQpf', 'SHARED', @household_id, 'expense', 'Software Expenses', 'Software Expenses', 'SHARED-135', 'Migrated from master_coa.id=135 | purpose=money_out | vertical=SHARED', 135, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('7gv3Y-dW2wTBxJJ5teFL-', 'SHARED', @household_id, 'expense', 'Spotify', 'Spotify', 'SHARED-136', 'Migrated from master_coa.id=136 | purpose=money_out | vertical=SHARED', 136, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('09hlJXr1zFcWT9_SPXIxd', 'SHARED', @household_id, 'expense', 'Stash', 'Stash', 'SHARED-137', 'Migrated from master_coa.id=137 | purpose=money_out | vertical=SHARED', 137, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('OCdJh8TDumFEIhCXTwwEO', 'SHARED', @household_id, 'expense', 'Subscriptions', 'Subscriptions', 'SHARED-138', 'Migrated from master_coa.id=138 | purpose=money_out | vertical=SHARED', 138, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('TdTsy-Nw_elhDCc9aQzqR', 'GL', @household_id, 'expense', 'Supplements', 'Supplements', 'GL-139', 'Migrated from master_coa.id=139 | purpose=money_out | vertical=GL', 139, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('wPhcssoUjVYmRMPru3_Ow', 'SHARED', @household_id, 'expense', 'Supplies & Materials', 'Supplies & Materials', 'SHARED-140', 'Migrated from master_coa.id=140 | purpose=money_out | vertical=SHARED', 140, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('TCwWNLqwaYexOCn-sQjES', 'SHARED', @household_id, 'asset', 'Tax Refund', 'Tax Refund', 'SHARED-141', 'Migrated from master_coa.id=141 | purpose=we_own | vertical=SHARED', 141, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('OvlQ5bHAFiSGnagX41v0-', 'SHARED', @household_id, 'expense', 'Taxes Paid', 'Taxes Paid', 'SHARED-142', 'Migrated from master_coa.id=142 | purpose=money_out | vertical=SHARED', 142, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('WSWm9Cu5jeLcOHnjRvWuj', 'SHARED', @household_id, 'expense', 'Toys / Crafts', 'Toys / Crafts', 'SHARED-143', 'Migrated from master_coa.id=143 | purpose=money_out | vertical=SHARED', 143, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('lR9d3v3ugmQAy0HKMEmgY', 'SHARED', @household_id, 'expense', 'Toys / Play & Learning', 'Toys / Play & Learning', 'SHARED-144', 'Migrated from master_coa.id=144 | purpose=money_out | vertical=SHARED', 144, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('_tgUa2lL9zmdAvLk8oNY8', 'SHARED', @household_id, 'expense', 'Transfer', 'Transfer', 'SHARED-145', 'Migrated from master_coa.id=145 | purpose=money_out | vertical=SHARED', 145, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('_HlXxVWVx5fH47HCIhtmk', 'SHARED', @household_id, 'expense', 'Transfer to Joint', 'Transfer to Joint', 'SHARED-146', 'Migrated from master_coa.id=146 | purpose=money_out | vertical=SHARED', 146, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('S0DhX18E8MkYesp5wvByq', 'SHARED', @household_id, 'expense', 'Transfer to Maxfield', 'Transfer to Maxfield', 'SHARED-147', 'Migrated from master_coa.id=147 | purpose=money_out | vertical=SHARED', 147, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('f2k3zsHOilXYPJ6b1o1ts', 'PERS', @household_id, 'expense', 'Travel', 'Travel', 'PERS-148', 'Migrated from master_coa.id=148 | purpose=money_out | vertical=PERS', 148, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('mnmKS0HX_8ewJZsZeYQEg', 'PERS', @household_id, 'expense', 'Travel & Vacation', 'Travel & Vacation', 'PERS-149', 'Migrated from master_coa.id=149 | purpose=money_out | vertical=PERS', 149, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('8IVcRMNJ_mDrM4PI1ly4B', 'PERS', @household_id, 'expense', 'Travel - Air', 'Travel - Air', 'PERS-150', 'Migrated from master_coa.id=150 | purpose=money_out | vertical=PERS', 150, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('0_VhuiNZrdwyzhFe6gUzJ', 'PERS', @household_id, 'expense', 'Travel - Ground', 'Travel - Ground', 'PERS-151', 'Migrated from master_coa.id=151 | purpose=money_out | vertical=PERS', 151, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('V7YpdEV_5w8SSuHlKdXgu', 'BL', @household_id, 'expense', 'Travel - Lodging', 'Travel - Lodging', 'BL-152', 'Migrated from master_coa.id=152 | purpose=money_out | vertical=BL', 152, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('BCCAI0cb8qwbCGNJ2WS6G', 'PERS', @household_id, 'expense', 'Travel - Rail', 'Travel - Rail', 'PERS-153', 'Migrated from master_coa.id=153 | purpose=money_out | vertical=PERS', 153, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('B7MYnaVKMn9iRJPJHMytE', 'SHARED', @household_id, 'expense', 'Uncategorized', 'Uncategorized', 'SHARED-154', 'Migrated from master_coa.id=154 | purpose=money_out | vertical=SHARED', 154, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('hZOrd-LH1ZXeyRC8TMvxL', 'SHARED', @household_id, 'expense', 'Uncategorized — Herma Perkins (manual review)', 'Uncategorized — Herma Perkins (manual review)', 'SHARED-155', 'Migrated from master_coa.id=155 | purpose=money_out | vertical=SHARED', 155, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('m8qHxQlCTCN1QVHL7p8gj', 'SHARED', @household_id, 'expense', 'Unknown vendor (review)', 'Unknown vendor (review)', 'SHARED-156', 'Migrated from master_coa.id=156 | purpose=money_out | vertical=SHARED', 156, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('8ypWM0gtrzR06sOxk_QwO', 'SHARED', @household_id, 'expense', 'Utilities', 'Utilities', 'SHARED-157', 'Migrated from master_coa.id=157 | purpose=money_out | vertical=SHARED', 157, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ha5JAvu_lq32Z29XaezVb', 'SHARED', @household_id, 'expense', 'Utilities (review)', 'Utilities (review)', 'SHARED-158', 'Migrated from master_coa.id=158 | purpose=money_out | vertical=SHARED', 158, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('PycaFCSNqnXNvifML6R3r', 'SHARED', @household_id, 'expense', 'Utilities - Jamaica', 'Utilities - Jamaica', 'SHARED-159', 'Migrated from master_coa.id=159 | purpose=money_out | vertical=SHARED', 159, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('R_TyvZcDCqBcvpUeWGggn', 'SHARED', @household_id, 'expense', 'Utilities: Internet', 'Utilities: Internet', 'SHARED-160', 'Migrated from master_coa.id=160 | purpose=money_out | vertical=SHARED', 160, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('cgo14WpG8tAbM1mIr1npK', 'PERS', @household_id, 'expense', 'Vehicle', 'Vehicle', 'PERS-161', 'Migrated from master_coa.id=161 | purpose=money_out | vertical=PERS', 161, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('on-zzHzT0Luf-A9QEablo', 'PERS', @household_id, 'expense', 'Vehicle (review)', 'Vehicle (review)', 'PERS-162', 'Migrated from master_coa.id=162 | purpose=money_out | vertical=PERS', 162, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('-tljmGD6LH7gmwfLUO2om', 'SHARED', @household_id, 'expense', 'Venmo', 'Venmo', 'SHARED-163', 'Migrated from master_coa.id=163 | purpose=money_out | vertical=SHARED', 163, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('fbrvQT4IlVRxoZZ6IX91v', 'SHARED', @household_id, 'expense', 'Web Services', 'Web Services', 'SHARED-164', 'Migrated from master_coa.id=164 | purpose=money_out | vertical=SHARED', 164, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('oqhun194xWTdq9_o04fiH', 'PERS', @household_id, 'expense', 'Wellness', 'Wellness', 'PERS-165', 'Migrated from master_coa.id=165 | purpose=money_out | vertical=PERS', 165, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ObCRm3F9SXtgbu8-vj_PE', 'SHARED', @household_id, 'asset', 'bank_transfer', 'bank_transfer', 'SHARED-166', 'Migrated from master_coa.id=166 | purpose=we_own | vertical=SHARED', 166, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('QJgCWZEk645l-5Op-cnZ0', 'BL', @household_id, 'income', 'booking_com_invoice_payment', 'booking_com_invoice_payment', 'BL-167', 'Migrated from master_coa.id=167 | purpose=money_in | vertical=BL', 167, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ealMA6RUgC6Q8U5omCaRT', 'BL', @household_id, 'income', 'booking_com_payment', 'booking_com_payment', 'BL-168', 'Migrated from master_coa.id=168 | purpose=money_in | vertical=BL', 168, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('LVnfv-r0nGzypYB6yRn1f', 'SHARED', @household_id, 'expense', 'chargeback', 'chargeback', 'SHARED-169', 'Migrated from master_coa.id=169 | purpose=money_out | vertical=SHARED', 169, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('p56r-ag39wwqnXPX1FJYR', 'BL', @household_id, 'expense', 'damage_fee', 'damage_fee', 'BL-170', 'Migrated from master_coa.id=170 | purpose=money_out | vertical=BL', 170, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('L5rr0MOBzALSqwPoT91K2', 'BL', @household_id, 'income', 'direct_booking', 'direct_booking', 'BL-171', 'Migrated from master_coa.id=171 | purpose=money_in | vertical=BL', 171, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('bndWsghzIuKGshLAeT5nC', 'BKY', @household_id, 'expense', 'easter_bun_order', 'easter_bun_order', 'BKY-172', 'Migrated from master_coa.id=172 | purpose=money_out | vertical=BKY', 172, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('XEKgWX1OgbGz4CVzyL5wj', 'PERS', @household_id, 'expense', 'health', 'health', 'PERS-173', 'Migrated from master_coa.id=173 | purpose=money_out | vertical=PERS', 173, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('xwpWf2JHquGaQ7tftPgM_', 'SHARED', @household_id, 'income', 'instant_payout_movement', 'instant_payout_movement', 'SHARED-174', 'Migrated from master_coa.id=174 | purpose=money_in | vertical=SHARED', 174, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('TjOCxiu1ZlSCBQQULB8bo', 'BKY', @household_id, 'expense', 'mboms_order', 'mboms_order', 'BKY-175', 'Migrated from master_coa.id=175 | purpose=money_out | vertical=BKY', 175, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('S5EFfPWoXGKdV5_fLyPkm', 'SHARED', @household_id, 'asset', 'retirement', 'retirement', 'SHARED-176', 'Migrated from master_coa.id=176 | purpose=we_own | vertical=SHARED', 176, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('vaiAB2nA3jtd6QeljgwGj', 'SHARED', @household_id, 'expense', 'rickeys_caribbean', 'rickeys_caribbean', 'SHARED-177', 'Migrated from master_coa.id=177 | purpose=money_out | vertical=SHARED', 177, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('DH0X5Z3OcXpaifjTnLMlK', 'SHARED', @household_id, 'expense', 'stripe_service_fee', 'stripe_service_fee', 'SHARED-178', 'Migrated from master_coa.id=178 | purpose=money_out | vertical=SHARED', 178, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('4WYd8uCrYLsMVbspfaYkN', 'SHARED', @household_id, 'expense', 'transfer', 'transfer', 'SHARED-179', 'Migrated from master_coa.id=179 | purpose=money_out | vertical=SHARED', 179, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('ASB0suxCGyoxg7jLiGmz_', 'SELF', @household_id, 'asset', 'transfer to Bank of Tarik', 'transfer to Bank of Tarik', 'SELF-180', 'Migrated from master_coa.id=180 | purpose=we_own | vertical=SELF', 180, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('QTqEmKiyO_5QNtUO2vaOF', 'SHARED', @household_id, 'expense', 'website_order', 'website_order', 'SHARED-181', 'Migrated from master_coa.id=181 | purpose=money_out | vertical=SHARED', 181, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('C3JUrQ975TN_nwkJrzHjj', 'SHARED', @household_id, 'expense', 'Ask My Accountant (Suspense)', 'Ask My Accountant (Suspense)', 'SHARED-182', 'Migrated from master_coa.id=182 | purpose=money_out | vertical=SHARED', 182, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('cdZBeH8tUYCLr7lYUbEvr', 'SHARED', @household_id, 'income', 'Sales Income', 'Sales Income', 'SHARED-183', 'Migrated from master_coa.id=183 | purpose=money_in | vertical=SHARED', 183, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('5uws9TfC_DiHVDfAUX86f', 'SHARED', @household_id, 'expense', 'Stripe Processing Fees', 'Stripe Processing Fees', 'SHARED-184', 'Migrated from master_coa.id=184 | purpose=money_out | vertical=SHARED', 184, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('fPnJHwWWUjGWCZTS_9ar4', 'SHARED', @household_id, 'income', 'Bank Interest Income', 'Bank Interest Income', 'SHARED-185', 'Migrated from master_coa.id=185 | purpose=money_in | vertical=SHARED', 185, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('vDjJBtxuUpD1Qo999Au0c', 'SHARED', @household_id, 'expense', 'Transfer In/Out (non-P&L)', 'Transfer In/Out (non-P&L)', 'SHARED-186', 'Migrated from master_coa.id=186 | purpose=money_out | vertical=SHARED', 186, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('FfqurfshvHxZcKkB589vC', 'SHARED', @household_id, 'expense', 'Merchant Processing Fees', 'Merchant Processing Fees', 'SHARED-187', 'Migrated from master_coa.id=187 | purpose=money_out | vertical=SHARED', 187, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('0sxHvR6iDWXqncz1tmw8e', 'BL', @household_id, 'income', 'Rental Income', 'Rental Income', 'BL-188', 'Migrated from master_coa.id=188 | purpose=money_in | vertical=BL', 188, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('pl9qa31Vf2D9WSm2rG9Dk', 'SHARED', @household_id, 'income', 'Booking & Platform Payouts', 'Booking & Platform Payouts', 'SHARED-189', 'Migrated from master_coa.id=189 | purpose=money_in | vertical=SHARED', 189, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('K0GyaapaWAO0Unt2GH2UJ', 'SHARED', @household_id, 'income', 'Other Income', 'Other Income', 'SHARED-190', 'Migrated from master_coa.id=190 | purpose=money_in | vertical=SHARED', 190, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'),
  ('YA09wV9GNSYrpD5umBZRg', 'SHARED', @household_id, 'expense', 'Foreign Exchange Gain/Loss', 'Foreign Exchange Gain/Loss', 'SHARED-191', 'Migrated from master_coa.id=191 | purpose=money_out | vertical=SHARED', 191, NULL, NULL, 'geeves_only', TRUE, FALSE, FALSE, FALSE, NULL, NULL, UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration');

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PART B: CLEAN THE 191 → ~128                                               │
-- │ B1: Retype 25 income accounts from expense → income/other_income           │
-- │ B2: Retype 14 financial accounts to asset/liability/equity                 │
-- │ B3: Remove 14 transfer rails (payment methods, not categories)             │
-- │ B4: Consolidate 22 groups of near-duplicates                               │
-- │ B5: Mark deprecated accounts                                               │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ═══════════════════════════════════════════════════════════════════════════════
-- B1: RETYPE 25 INCOME ACCOUNTS (expense → income/other_income)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Rental Income accounts → other_income
UPDATE `chart_of_accounts` SET `accountType` = 'other_income', `detailType` = 'Rental Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to other_income (rental)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` LIKE '%Rental Income%' AND `accountType` = 'expense';

-- Interest Income accounts → other_income
UPDATE `chart_of_accounts` SET `accountType` = 'other_income', `detailType` = 'Interest Earned',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to other_income (interest)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Interest Earned', 'Interest Income', 'Bank Interest Income') AND `accountType` = 'expense';

-- Product Sales → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Sales of Product Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (product sales)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Sales of Product Income', 'Sales Income', 'Sales:Easter Bun Sales', 'Sales:Spice Bun Sales') AND `accountType` = 'expense';

-- Service Income → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Service Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (services)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Sale of Services - Consutlancy Income' AND `accountType` = 'expense';

-- Short Term Rental Income (platform sub-accounts) → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Booking Platform Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (platform)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` LIKE 'Short Term Rental Income:%' AND `accountType` = 'expense';

-- Booking platform payments → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Platform Payouts',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (booking platform)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Booking & Platform Payouts', 'booking_com_payment', 'booking_com_invoice_payment', 'direct_booking') AND `accountType` = 'expense';

-- Order income → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Order Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (order)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('easter_bun_order', 'mboms_order', 'website_order', 'rickeys_caribbean') AND `accountType` = 'expense';

-- Tax Refund → other_income
UPDATE `chart_of_accounts` SET `accountType` = 'other_income', `detailType` = 'Tax Refund',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to other_income (tax refund)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Tax Refund' AND `accountType` = 'expense';

-- Other Income → other_income
UPDATE `chart_of_accounts` SET `accountType` = 'other_income', `detailType` = 'Other Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to other_income'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Other Income' AND `accountType` = 'expense';

-- Short Term Rental Income (parent) → income
UPDATE `chart_of_accounts` SET `accountType` = 'income', `detailType` = 'Short Term Rental Income',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to income (short term rental)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Short Term Rental Income' AND `accountType` = 'expense';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B2: RETYPE 14 FINANCIAL ACCOUNTS (expense → asset/liability/equity/credit_card)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Credit Cards → credit_card type
UPDATE `chart_of_accounts` SET `accountType` = 'credit_card', `detailType` = 'Credit Card',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to credit_card (payment method)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('American Express - Business', 'CapitalOne Credit Card', 'Scotia gold') AND `accountType` = 'expense';

-- Brokerage/Investment → asset type
UPDATE `chart_of_accounts` SET `accountType` = 'asset', `detailType` = 'Investment Account',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to asset (investment)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Robinhood', 'Fundrise', 'Stash', 'Real Estate Fund', 'retirement') AND `accountType` = 'expense';

-- Loans → liability type
UPDATE `chart_of_accounts` SET `accountType` = 'liability', `detailType` = 'Loan Payable',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to liability (loan)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Loan', 'Loan Repayment', 'SMBX LOAN PRINCIPAL',
  'Friends and Family Loans', 'Friends and Family Loans:Dr Millicent Comrie Loan',
  'Loan to Maxfield Bakery & Pastries') AND `accountType` = 'expense';

-- Annuity → asset type
UPDATE `chart_of_accounts` SET `accountType` = 'asset', `detailType` = 'Annuity',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to asset (annuity)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Annuity Payout' AND `accountType` = 'expense';

-- Brokerage Withdrawal → other_expense (distribution, not category)
UPDATE `chart_of_accounts` SET `accountType` = 'other_expense', `detailType` = 'Brokerage Distribution',
  `description` = CONCAT(`description`, ' | CLEANED: retyped from expense to other_expense (distribution)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Brokerage Withdrawal' AND `accountType` = 'expense';

-- Auto Loan Payment → liability + rename
UPDATE `chart_of_accounts` SET `accountType` = 'liability', `detailType` = 'Auto Loan',
  `accountName` = 'Auto Loan', `accountNumber` = 'SHARED-622',
  `description` = CONCAT(`description`, ' | CLEANED: renamed from Auto Loan Payment | retyped to liability'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Auto Loan Payment' AND `accountType` = 'expense';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B3: REMOVE 14 TRANSFER RAILS — Mark as deprecated
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: transfer rail / payment method, not expense category'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN (
  'ATM', 'ATM/Mobile Deposit', 'Bank Deposit', 'Cash App', 'Internal Transfer',
  'PayPal', 'Transfer', 'Transfer to Joint', 'Transfer to Maxfield', 'Venmo',
  'bank_transfer', 'transfer', 'transfer to Bank of Tarik', 'Transfer In/Out (non-P&L)'
);

-- Create single consolidated "Inter-Account Transfer" for bookkeeping
INSERT INTO `chart_of_accounts` (
  `id`, `verticalId`, `householdId`, `accountType`, `detailType`, `accountName`,
  `accountNumber`, `description`, `displayOrder`, `qboSyncStatus`, `isActive`,
  `isSystemAccount`, `createdAt`, `updatedAt`, `createdBy`
) VALUES (
  'acct_inter_transfer_01', 'SHARED', @household_id, 'expense', 'Inter-Account Transfer',
  'Inter-Account Transfer', 'SHARED-900', 'Consolidated transfer mechanism | Non-P&L | Created from merge of 14 transfer rails',
  900, 'geeves_only', TRUE, TRUE,
  UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000, 'migration'
) ON DUPLICATE KEY UPDATE `accountName` = 'Inter-Account Transfer';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B4: CONSOLIDATE 22 GROUPS OF NEAR-DUPLICATES
-- ═══════════════════════════════════════════════════════════════════════════════

-- 4.1: Computer & Internet (IDs 2, 41 → keep ID 2)
UPDATE `chart_of_accounts` SET `accountName` = 'Computer & Internet',
  `accountNumber` = 'SHARED-601', `detailType` = 'Computer & Internet Expenses',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged 6040 Computer & Internet + Computer & Internet Expenses'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = '6040 Computer & Internet';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Computer & Internet'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Computer & Internet Expenses';

-- 4.2: Bank Charges & Fees (IDs 23, 25, 81 → keep ID 23)
UPDATE `chart_of_accounts` SET `accountName` = 'Bank Charges & Fees',
  `accountNumber` = 'SHARED-602', `detailType` = 'Bank Charges and Fees',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bank Charges & Fees + Bank Fees & Charges + Market: Bank Charges & Fees'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Bank Charges & Fees';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Bank Charges & Fees'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Bank Fees & Charges', 'Market: Bank Charges & Fees');

-- 4.3: Cleaning & Sanitation (Rental) (IDs 28, 39, 40 → keep ID 39)
UPDATE `chart_of_accounts` SET `accountName` = 'Cleaning & Sanitation (Rental)',
  `accountNumber` = 'BL-603', `detailType` = 'Cleaning Expenses', `verticalId` = 'BL',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bohemian: Cleaning + Cleaning Expense (Rental) + Cleaning and Sanitationi'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Cleaning Expense (Rental Property)';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Cleaning & Sanitation (Rental)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Bohemian: Cleaning Expense (Rental Property)', 'Cleaning and Sanitationi');

-- 4.4: Repairs & Maintenance (IDs 30, 114 → keep ID 114)
UPDATE `chart_of_accounts` SET `accountName` = 'Repairs & Maintenance',
  `accountNumber` = 'SHARED-604', `detailType` = 'Repairs and Maintenance',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bohemian: Repairs & Maintenance + Repairs & Maintenance'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Repairs & Maintenance';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Repairs & Maintenance'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Bohemian: Repairs & Maintenance';

-- 4.5: Utilities (IDs 32, 157, 158, 159 → keep ID 157)
UPDATE `chart_of_accounts` SET `accountName` = 'Utilities',
  `accountNumber` = 'SHARED-605', `detailType` = 'Utilities',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bohemian: Utilities + Utilities + Utilities (review) + Utilities - Jamaica'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Utilities' AND `isActive` = TRUE;
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Utilities'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Bohemian: Utilities', 'Utilities (review)', 'Utilities - Jamaica');

-- 4.6: Marketing & Advertising (IDs 19, 82, 83 → keep ID 82)
UPDATE `chart_of_accounts` SET `accountName` = 'Marketing & Advertising',
  `accountNumber` = 'BKY-606', `detailType` = 'Advertising and Promotion', `verticalId` = 'BKY',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bakery: Advertising + Marketing & Ads + Marketing & Advertising'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Marketing & Ads';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Marketing & Advertising'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Bakery: Advertising Expense', 'Marketing & Advertising');

-- 4.7: Software & Tools (IDs 133, 134, 135, 164 → keep ID 133)
UPDATE `chart_of_accounts` SET `accountName` = 'Software & Tools',
  `accountNumber` = 'SHARED-607', `detailType` = 'Software Expenses',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Software & AI Tools + Software (review) + Software Expenses + Web Services'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Software & AI Tools';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Software & Tools'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Software (review)', 'Software Expenses', 'Web Services');

-- 4.8: Subscriptions (IDs 136, 138 → keep ID 138)
UPDATE `chart_of_accounts` SET `accountName` = 'Subscriptions',
  `accountNumber` = 'PERS-608', `detailType` = 'Subscriptions', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Spotify + Subscriptions'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Subscriptions';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Subscriptions'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Spotify';

-- 4.9: Personal Care & Grooming (IDs 60, 61, 96 → keep ID 96)
UPDATE `chart_of_accounts` SET `accountName` = 'Personal Care & Grooming',
  `accountNumber` = 'PERS-609', `detailType` = 'Personal Care', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Grooming + Grooming / Hair Care + Personal Care'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Personal Care';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Personal Care & Grooming'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Grooming', 'Grooming / Hair Care');

-- 4.10: Health & Wellness (IDs 63, 64, 165, 173 → keep ID 64)
UPDATE `chart_of_accounts` SET `accountName` = 'Health & Wellness',
  `accountNumber` = 'PERS-610', `detailType` = 'Health and Wellness', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Health + Health / Wellness + Wellness + health'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Health / Wellness';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Health & Wellness'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Health', 'Wellness', 'health');

-- 4.11: Groceries & Food (IDs 57, 58, 59, 98 → keep ID 59)
UPDATE `chart_of_accounts` SET `accountName` = 'Groceries & Food',
  `accountNumber` = 'PERS-611', `detailType` = 'Groceries', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Groceries + Groceries (review) + Groceries/Household + Personal: Food & Groceries'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Groceries/Household';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Groceries & Food'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Groceries', 'Groceries (review)', 'Personal: Food & Groceries');

-- 4.12: Travel (IDs 31, 148, 149 → keep ID 148)
UPDATE `chart_of_accounts` SET `accountName` = 'Travel',
  `accountNumber` = 'PERS-612', `detailType` = 'Travel Expenses', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bohemian: Travel + Travel + Travel & Vacation'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Travel' AND `isActive` = TRUE;
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Travel'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Bohemian: Travel', 'Travel & Vacation');

-- 4.13: Property & Improvements (IDs 105, 106, 107, 108 → keep ID 108)
UPDATE `chart_of_accounts` SET `accountName` = 'Property & Improvements',
  `accountNumber` = 'BL-613', `detailType` = 'Property Improvements', `verticalId` = 'BL',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Property + Property (review) + Property - Furnishings + Property - Improvements'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Property - Improvements';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Property & Improvements'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Property', 'Property (review)', 'Property - Furnishings');

-- 4.14: Ask My Accountant (IDs 16, 182 → keep ID 16)
UPDATE `chart_of_accounts` SET `accountName` = 'Ask My Accountant',
  `accountNumber` = 'SHARED-614', `detailType` = 'Ask My Accountant', `isSystemAccount` = TRUE,
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Ask My Accountant + Ask My Accountant (Suspense) | System suspense account'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Ask My Accountant' AND `isActive` = TRUE;
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Ask My Accountant'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Ask My Accountant (Suspense)';

-- 4.15: Interest Income (IDs 69, 70, 185 → keep ID 70)
UPDATE `chart_of_accounts` SET `accountName` = 'Interest Income',
  `accountNumber` = 'SHARED-615', `detailType` = 'Interest Earned', `accountType` = 'other_income',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Interest Earned + Interest Income + Bank Interest Income | Retyped to other_income'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Interest Income';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Interest Income'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Interest Earned', 'Bank Interest Income');

-- 4.16: Rental Income: Long Term (IDs 29, 80 → keep ID 80)
UPDATE `chart_of_accounts` SET `accountName` = 'Rental Income: Long Term',
  `accountNumber` = 'BL-616', `detailType` = 'Rental Income', `accountType` = 'other_income', `verticalId` = 'BL',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Bohemian: Long Term Rental Income + Long Term Rental Income | Retyped to other_income'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Long Term Rental Income';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Rental Income: Long Term'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Bohemian: Long Term Rental Income';

-- 4.17: Owner Equity & Draws (IDs 88, 89 → keep ID 88)
UPDATE `chart_of_accounts` SET `accountName` = 'Owner Equity & Draws',
  `accountNumber` = 'SELF-617', `detailType` = 'Owner Draw/Investment', `accountType` = 'equity', `verticalId` = 'SELF',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Owner''s Draw + Owner''s Investment | Retyped to equity'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Owner''s Draw';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Owner Equity & Draws'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Owner''s Investment';

-- 4.18: Kids Expenses (IDs 72, 73, 74, 75, 76, 124, 143, 144 → keep ID 76)
UPDATE `chart_of_accounts` SET `accountName` = 'Kids Expenses',
  `accountNumber` = 'PERS-618', `detailType` = 'Children Expenses', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged all Kids sub-accounts (Accessories, Allowance, Bedding, Furniture, Room/Decor, School Supplies, Toys/Crafts, Toys/Play)'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Kids Room / Decor';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Kids Expenses'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Kids Accessories', 'Kids Allowance', 'Kids Bedding', 'Kids Furniture', 'School Supplies', 'Toys / Crafts', 'Toys / Play & Learning');

-- 4.19: Supplies & Materials (IDs 3, 42, 116, 140 → keep ID 140)
UPDATE `chart_of_accounts` SET `accountName` = 'Supplies & Materials',
  `accountNumber` = 'BKY-619', `detailType` = 'Supplies and Materials', `verticalId` = 'BKY',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged 6130 Supplies + Cost of Goods Sold:Packaging + Retail Supplies + Supplies & Materials'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Supplies & Materials';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Supplies & Materials'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('6130 Supplies', 'Cost of Goods sold:Packaging', 'Retail Supplies');

-- 4.20: Insurance (IDs 67, 68, 100, 109 → keep ID 67)
UPDATE `chart_of_accounts` SET `accountName` = 'Insurance',
  `accountNumber` = 'SHARED-620', `detailType` = 'Insurance Expenses',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged Insurance + Insurance Reimbursement + Personal: Insurance + Property Insurance Expense'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Insurance';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Insurance'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` IN ('Insurance Reimbursement', 'Personal: Insurance', 'Property Insurance Expense');

-- 4.21: Communication & Media (IDs 87, 103 → keep ID 103)
UPDATE `chart_of_accounts` SET `accountName` = 'Communication & Media',
  `accountNumber` = 'PERS-621', `detailType` = 'Telephone and Communication', `verticalId` = 'PERS',
  `description` = CONCAT(`description`, ' | CONSOLIDATED: merged NY Times + Phone'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Phone';
UPDATE `chart_of_accounts` SET `isActive` = FALSE, `qboSyncStatus` = 'deprecated',
  `description` = CONCAT(`description`, ' | DEPRECATED: consolidated into Communication & Media'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'NY Times';

-- 4.22: Rename specific accounts for clarity
UPDATE `chart_of_accounts` SET `accountName` = 'Car & Truck Expenses',
  `description` = CONCAT(`description`, ' | CLEANED: renamed for clarity'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Car & Truck';

UPDATE `chart_of_accounts` SET `accountName` = 'E-commerce Platform Fees',
  `description` = CONCAT(`description`, ' | CLEANED: renamed for clarity'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'E-commerce Platform';

UPDATE `chart_of_accounts` SET `accountName` = 'Government & Filing Fees',
  `description` = CONCAT(`description`, ' | CLEANED: renamed for clarity'),
  `updatedAt` = UNIX_TIMESTAMP(NOW()) * 1000
WHERE `accountName` = 'Government & Filing';


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PART C: BUILD 9 VERTICAL G.L. CATALOG DEFINITIONS                          │
-- │ Each vertical gets a curated subset of the master COA                      │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- ═══════════════════════════════════════════════════════════════════════════════
-- C1: Maxfield Bakery (BKY-*) — ~25 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_bky_', SUBSTRING(MD5(CONCAT('BKY', ca.id)), 1, 14)),
  'BKY', 'BKY', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Sales%' OR ca.accountName LIKE '%Income%' OR ca.accountName LIKE '%Order%' THEN 100
    WHEN ca.accountName LIKE '%Cost of Goods%' OR ca.accountName LIKE '%Packaging%' OR ca.accountName LIKE '%Supplies%' THEN 200
    WHEN ca.accountName LIKE '%Labor%' OR ca.accountName LIKE '%Wages%' OR ca.accountName LIKE '%Salary%' OR ca.accountName LIKE '%Director%' THEN 300
    WHEN ca.accountName LIKE '%Marketing%' OR ca.accountName LIKE '%Advertising%' THEN 400
    WHEN ca.accountName LIKE '%Equipment%' THEN 500
    WHEN ca.accountName LIKE '%Bank Charges%' THEN 600
    WHEN ca.accountName LIKE '%Professional%' OR ca.accountName LIKE '%Legal%' THEN 700
    WHEN ca.accountName LIKE '%Insurance%' THEN 800
    WHEN ca.accountName LIKE '%Utilities%' OR ca.accountName LIKE '%Internet%' THEN 900
    ELSE 1000
  END,
  'Bakery vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'BKY'
    OR ca.accountName IN (
      'Sales of Product Income', 'Sales Income', 'Sales:Easter Bun Sales', 'Sales:Spice Bun Sales',
      'Easter Bun Orders', 'MBOMS Orders', 'Website Orders',
      'Cost of Goods Sold: Packaging', 'Supplies & Materials',
      'Bakery Operations', 'Bakery: Staff Welfare',
      'Bakery: Wages and Salaries:Director''s Emoluments', 'Marketing & Advertising',
      'Bank Charges & Fees', 'Utilities', 'Utilities: Internet',
      'Professional Services', 'Computer & Internet', 'Software & Tools',
      'Repairs & Maintenance', 'Cleaning & Sanitation (Rental)',
      'Insurance', 'Rent & Lease', 'Taxes Paid', 'Interest Income'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C2: Maxfield Market Global (MKT-*) — ~20 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_mkt_', SUBSTRING(MD5(CONCAT('MKT', ca.id)), 1, 14)),
  'MKT', 'MKT', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Sales%' OR ca.accountName LIKE '%Income%' OR ca.accountName LIKE '%Order%' THEN 100
    WHEN ca.accountName LIKE '%Inventory%' OR ca.accountName LIKE '%Cost%' OR ca.accountName LIKE '%COGS%' OR ca.accountName LIKE '%Supplies%' THEN 200
    WHEN ca.accountName LIKE '%Shipping%' OR ca.accountName LIKE '%Fulfillment%' THEN 300
    WHEN ca.accountName LIKE '%E-commerce%' OR ca.accountName LIKE '%Platform%' THEN 500
    WHEN ca.accountName LIKE '%Marketing%' OR ca.accountName LIKE '%Advertising%' THEN 600
    WHEN ca.accountName LIKE '%Bank Charges%' OR ca.accountName LIKE '%Processing%' OR ca.accountName LIKE '%Stripe%' THEN 700
    WHEN ca.accountName LIKE '%Professional%' THEN 800
    ELSE 1000
  END,
  'Market vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'MKT'
    OR ca.accountName IN (
      'Sales of Product Income', 'Website Orders', 'Rickeys Caribbean Sales',
      'Supplies & Materials', 'Shipping COST', 'Fulfillment', 'E-commerce Platform Fees',
      'Marketing & Advertising', 'Professional Services',
      'Bank Charges & Fees', 'Software & Tools',
      'Utilities', 'Computer & Internet', 'Insurance',
      'Taxes Paid', 'Rent & Lease', 'Repairs & Maintenance',
      'Rent', 'Interest Income'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C3: Blue Lagoon Lodges (BL-*) — ~30 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_bl_', SUBSTRING(MD5(CONCAT('BL', ca.id)), 1, 14)),
  'BL', 'BL', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Rental Income%' OR ca.accountName LIKE '%Booking%' OR ca.accountName LIKE '%Payout%' OR ca.accountName LIKE '%direct_booking%' THEN 100
    WHEN ca.accountName LIKE '%Cleaning%' OR ca.accountName LIKE '%Sanitation%' THEN 200
    WHEN ca.accountName LIKE '%Maintenance%' OR ca.accountName LIKE '%Repair%' THEN 300
    WHEN ca.accountName LIKE '%Utilities%' OR ca.accountName LIKE '%Internet%' THEN 400
    WHEN ca.accountName LIKE '%Property%' THEN 500
    WHEN ca.accountName LIKE '%Insurance%' THEN 600
    WHEN ca.accountName LIKE '%Bank Charges%' OR ca.accountName LIKE '%Processing%' OR ca.accountName LIKE '%Stripe%' OR ca.accountName LIKE '%Merchant%' THEN 700
    WHEN ca.accountName LIKE '%Furnish%' OR ca.accountName LIKE '%Supplies%' THEN 800
    WHEN ca.accountName LIKE '%Taxes%' THEN 900
    WHEN ca.accountName LIKE '%Travel%' OR ca.accountName LIKE '%Ground%' OR ca.accountName LIKE '%Air%' THEN 1000
    ELSE 1100
  END,
  'Blue Lagoon Lodges vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'BL'
    OR ca.accountName IN (
      'Short Term Rental Income', 'Short Term Rental Income: Airbnb', 'Short Term Rental Income: Booking.com',
      'Short Term Rental Income: VRBO', 'Rental Income: Long Term', 'Rental Income',
      'Booking & Platform Payouts', 'Booking.com Payments',
      'Cleaning & Sanitation (Rental)',
      'Repairs & Maintenance', 'Property & Improvements',
      'Utilities', 'Utilities: Internet', 'Utilities - Jamaica',
      'Insurance',
      'Bank Charges & Fees', 'Stripe Processing Fees', 'Merchant Processing Fees',
      'Supplies & Materials', 'Taxes Paid',
      'Travel', 'Travel - Ground', 'Travel - Air',
      'Computer & Internet', 'Software & Tools',
      'Ask My Accountant', 'Interest Income', 'Damage Fee', 'Chargeback'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C4: Personal (PERS-*) — ~35 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_pers_', SUBSTRING(MD5(CONCAT('PERS', ca.id)), 1, 14)),
  'PERS', 'PERS', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Groceries%' OR ca.accountName LIKE '%Food%' THEN 100
    WHEN ca.accountName LIKE '%Dining%' THEN 200
    WHEN ca.accountName LIKE '%Utilities%' OR ca.accountName LIKE '%Internet%' OR ca.accountName LIKE '%Phone%' OR ca.accountName LIKE '%Communication%' THEN 300
    WHEN ca.accountName LIKE '%Transport%' OR ca.accountName LIKE '%Car%' OR ca.accountName LIKE '%Vehicle%' OR ca.accountName LIKE '%Ground%' THEN 400
    WHEN ca.accountName LIKE '%Health%' OR ca.accountName LIKE '%Wellness%' OR ca.accountName LIKE '%Medical%' OR ca.accountName LIKE '%Supplement%' THEN 500
    WHEN ca.accountName LIKE '%Grooming%' OR ca.accountName LIKE '%Personal Care%' THEN 600
    WHEN ca.accountName LIKE '%Kids%' OR ca.accountName LIKE '%Child%' THEN 700
    WHEN ca.accountName LIKE '%Entertainment%' OR ca.accountName LIKE '%Subscription%' THEN 800
    WHEN ca.accountName LIKE '%Shopping%' THEN 900
    WHEN ca.accountName LIKE '%Rent%' OR ca.accountName LIKE '%Home%' THEN 1000
    WHEN ca.accountName LIKE '%Travel%' OR ca.accountName LIKE '%Vacation%' THEN 1100
    WHEN ca.accountName LIKE '%Insurance%' THEN 1200
    ELSE 1300
  END,
  'Personal vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'PERS'
    OR ca.accountName IN (
      'Groceries & Food', 'Dining',
      'Utilities', 'Utilities: Internet', 'Communication & Media',
      'Personal: Transportation', 'Car & Truck Expenses', 'Vehicle', 'Ground transport (review)',
      'Health & Wellness', 'Personal: Healthcare', 'Supplements',
      'Personal Care & Grooming',
      'Kids Expenses', 'Childcare',
      'Entertainment', 'Subscriptions',
      'Shopping', 'Personal Accessories', 'Personal Items',
      'Rent', 'Rent & Lease', 'Home & Family', 'Home Improvement',
      'Travel', 'Travel - Air', 'Travel - Ground', 'Travel - Lodging', 'Travel - Rail',
      'Insurance', 'Personal: Insurance',
      'Bank Charges & Fees', 'Phone',
      'Taxes Paid', 'Tax Refund',
      'Allowance', 'Owner Equity & Draws',
      'Mind / Spiritual', 'NY Times', 'Electronics / Tablet',
      'Owner''s Pay & Personal Expenses'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C5: Self / Tarik (SELF-*) — ~15 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_self_', SUBSTRING(MD5(CONCAT('SELF', ca.id)), 1, 14)),
  'SELF', 'SELF', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Salary%' OR ca.accountName LIKE '%Wages%' OR ca.accountName LIKE '%Income%' OR ca.accountName LIKE '%Consult%' THEN 100
    WHEN ca.accountName LIKE '%Owner%' OR ca.accountName LIKE '%Equity%' OR ca.accountName LIKE '%Draw%' THEN 200
    WHEN ca.accountName LIKE '%Professional%' OR ca.accountName LIKE '%Consult%' THEN 300
    WHEN ca.accountName LIKE '%Taxes%' OR ca.accountName LIKE '%Filing%' THEN 400
    WHEN ca.accountName LIKE '%Bank%' OR ca.accountName LIKE '%Interest%' THEN 500
    WHEN ca.accountName LIKE '%Insurance%' THEN 600
    ELSE 700
  END,
  'Self vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'SELF'
    OR ca.accountName IN (
      'Salary', 'Owner Equity & Draws', 'Owner''s Pay & Personal Expenses',
      'Director Emolument', 'Professional Services',
      'Computer & Internet', 'Software & Tools',
      'Taxes Paid', 'Government & Filing Fees',
      'Bank Charges & Fees', 'Interest Income',
      'Health & Wellness', 'Supplements', 'Insurance',
      'Rent & Lease'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C6: Bohemian Lagoon (SO-*) — ~15 accounts (sister entity)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_so_', SUBSTRING(MD5(CONCAT('SO', ca.id)), 1, 14)),
  'SO', 'SO', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Loan%' OR ca.accountName LIKE '%SMBX%' THEN 100
    WHEN ca.accountName LIKE '%Interest%' THEN 200
    WHEN ca.accountName LIKE '%Bank%' THEN 300
    WHEN ca.accountName LIKE '%Professional%' THEN 400
    WHEN ca.accountName LIKE '%Insurance%' THEN 500
    ELSE 600
  END,
  'Bohemian Lagoon vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'SO'
    OR ca.accountName IN (
      'SMBX LOAN PRINCIPAL', 'Loan', 'Loan Repayment',
      'Friends and Family Loans', 'Friends and Family Loans:Dr Millicent Comrie Loan',
      'Bank Charges & Fees', 'Interest Income',
      'Professional Services', 'Insurance',
      'Taxes Paid', 'Rent & Lease',
      'Computer & Internet', 'Software & Tools'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C7: Good Life (GL-*) — ~15 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_gl_', SUBSTRING(MD5(CONCAT('GL', ca.id)), 1, 14)),
  'GL', 'GL', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountName LIKE '%Health%' OR ca.accountName LIKE '%Wellness%' OR ca.accountName LIKE '%Supplement%' THEN 100
    WHEN ca.accountName LIKE '%Mind%' OR ca.accountName LIKE '%Spiritual%' THEN 200
    WHEN ca.accountName LIKE '%Insurance%' THEN 300
    WHEN ca.accountName LIKE '%Bank%' OR ca.accountName LIKE '%Interest%' THEN 400
    WHEN ca.accountName LIKE '%Professional%' THEN 500
    ELSE 600
  END,
  'Good Life vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.verticalId = 'GL'
    OR ca.accountName IN (
      'Health & Wellness', 'Supplements', 'Mind / Spiritual',
      'Personal Care & Grooming',
      'Insurance', 'Bank Charges & Fees', 'Interest Income',
      'Professional Services', 'Computer & Internet',
      'Software & Tools', 'Subscriptions',
      'Taxes Paid', 'Rent & Lease', 'Utilities'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- C8: Shared / Overhead (SHARED-*) — ~40 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_shared_', SUBSTRING(MD5(CONCAT('SHARED', ca.id)), 1, 14)),
  'SHARED', 'SHARED', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountType IN ('income', 'other_income') THEN 100
    WHEN ca.accountName LIKE '%Bank%' OR ca.accountName LIKE '%Interest%' THEN 200
    WHEN ca.accountName LIKE '%Professional%' OR ca.accountName LIKE '%Legal%' THEN 300
    WHEN ca.accountName LIKE '%Software%' OR ca.accountName LIKE '%Computer%' OR ca.accountName LIKE '%Internet%' THEN 400
    WHEN ca.accountName LIKE '%Insurance%' THEN 500
    WHEN ca.accountName LIKE '%Rent%' OR ca.accountName LIKE '%Lease%' THEN 600
    WHEN ca.accountName LIKE '%Utilities%' THEN 700
    WHEN ca.accountName LIKE '%Marketing%' THEN 800
    WHEN ca.accountName LIKE '%Tax%' THEN 900
    WHEN ca.accountType IN ('asset', 'liability', 'equity', 'credit_card') THEN 1000
    ELSE 1100
  END,
  'Shared overhead vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND ca.verticalId = 'SHARED';

-- ═══════════════════════════════════════════════════════════════════════════════
-- C9: TJPGG (TJP-*) — Parent holding company ~10 accounts
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO `vertical_coa_catalogs` (`id`, `verticalId`, `verticalPrefix`, `chartOfAccountId`, `isRelevant`, `isRequired`, `displayOrder`, `mappingNotes`, `createdAt`)
SELECT 
  CONCAT('vcc_tjp_', SUBSTRING(MD5(CONCAT('TJP', ca.id)), 1, 14)),
  'TJP', 'TJP', ca.id, TRUE, FALSE,
  CASE 
    WHEN ca.accountType IN ('income', 'other_income') THEN 100
    WHEN ca.accountName LIKE '%Owner%' OR ca.accountName LIKE '%Equity%' THEN 200
    WHEN ca.accountName LIKE '%Investment%' OR ca.accountName LIKE '%Brokerage%' OR ca.accountName LIKE '%Fund%' THEN 300
    WHEN ca.accountName LIKE '%Loan%' THEN 400
    WHEN ca.accountName LIKE '%Bank%' OR ca.accountName LIKE '%Interest%' THEN 500
    WHEN ca.accountName LIKE '%Professional%' THEN 600
    ELSE 700
  END,
  'TJPGG vertical catalog',
  UNIX_TIMESTAMP(NOW()) * 1000
FROM `chart_of_accounts` ca
WHERE ca.isActive = TRUE
  AND (
    ca.accountName IN (
      'Owner Equity & Draws', 'Owner''s Investment',
      'Fundrise', 'Robinhood', 'Stash', 'Real Estate Fund', 'retirement',
      'Brokerage Withdrawal', 'Annuity Payout',
      'SMBX LOAN PRINCIPAL', 'Loan', 'Loan Repayment',
      'Friends and Family Loans', 'Friends and Family Loans:Dr Millicent Comrie Loan',
      'CapitalOne Credit Card', 'American Express - Business', 'Scotia gold',
      'Interest Income', 'Bank Interest',
      'Professional Services', 'Taxes Paid',
      'Auto Loan'
    )
  );

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ PART D: QBO MAPPING FRAMEWORK INITIALIZATION                               │
-- │ Pre-seed qbo_account_mappings with known QBO-to-Geeves correspondences     │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Pre-seed mappings for the two known QBO realm IDs
-- Realm 1: 123145971566304 (Maxfield Bakery)
-- Realm 2: 9130350512376806 (Maxfield Market Global LLC)

INSERT INTO `qbo_account_mappings` (`id`, `geevesAccountId`, `qboRealmId`, `qboCompanyName`, `mappingType`, `mappingStatus`, `notes`, `createdAt`, `updatedAt`)
VALUES
  -- Maxfield Bakery realm (123145971566304)
  ('qam_bky_001', (SELECT id FROM chart_of_accounts WHERE accountName = 'Sales:Easter Bun Sales' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Product Sales - Easter Bun', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_bky_002', (SELECT id FROM chart_of_accounts WHERE accountName = 'Sales:Spice Bun Sales' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Product Sales - Spice Bun', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_bky_003', (SELECT id FROM chart_of_accounts WHERE accountName = 'Bakery Operations' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Operating Expenses', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_bky_004', (SELECT id FROM chart_of_accounts WHERE accountName = 'Marketing & Advertising' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Advertising & Marketing', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_bky_005', (SELECT id FROM chart_of_accounts WHERE accountName = 'Supplies & Materials' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Cost of Goods Sold - Supplies', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_bky_006', (SELECT id FROM chart_of_accounts WHERE accountName = 'Bank Charges & Fees' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Bank Service Charges', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),

  -- Maxfield Market Global realm (9130350512376806)
  ('qam_mkt_001', (SELECT id FROM chart_of_accounts WHERE accountName = 'Sales of Product Income' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Product Sales', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_002', (SELECT id FROM chart_of_accounts WHERE accountName = 'E-commerce Platform Fees' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Platform Fees / Merchant Fees', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_003', (SELECT id FROM chart_of_accounts WHERE accountName = 'Shipping COST' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Shipping & Delivery', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_004', (SELECT id FROM chart_of_accounts WHERE accountName = 'Fulfillment' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Fulfillment Costs', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_005', (SELECT id FROM chart_of_accounts WHERE accountName = 'Marketing & Advertising' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Advertising & Marketing', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_006', (SELECT id FROM chart_of_accounts WHERE accountName = 'Bank Charges & Fees' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Bank Service Charges', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_007', (SELECT id FROM chart_of_accounts WHERE accountName = 'Professional Services' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Professional Fees', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_008', (SELECT id FROM chart_of_accounts WHERE accountName = 'Insurance' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Insurance', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_009', (SELECT id FROM chart_of_accounts WHERE accountName = 'Utilities' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Utilities', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_010', (SELECT id FROM chart_of_accounts WHERE accountName = 'Rent & Lease' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Rent Expense', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_011', (SELECT id FROM chart_of_accounts WHERE accountName = 'Taxes Paid' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Taxes', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_012', (SELECT id FROM chart_of_accounts WHERE accountName = 'Repairs & Maintenance' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Repairs & Maintenance', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_013', (SELECT id FROM chart_of_accounts WHERE accountName = 'Interest Income' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Interest Income', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_014', (SELECT id FROM chart_of_accounts WHERE accountName = 'Computer & Internet' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Computer & Internet Expenses', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_mkt_015', (SELECT id FROM chart_of_accounts WHERE accountName = 'Software & Tools' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Software', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000)
ON DUPLICATE KEY UPDATE `updatedAt` = UNIX_TIMESTAMP(NOW())*1000;

-- ═══════════════════════════════════════════════════════════════════════════════
-- D4: 17 FINANCIAL ACCOUNTS — Map to we_own/we_owe (assets/liabilities)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO `qbo_account_mappings` (`id`, `geevesAccountId`, `qboRealmId`, `qboCompanyName`, `mappingType`, `mappingStatus`, `notes`, `createdAt`, `updatedAt`)
VALUES
  ('qam_f001', (SELECT id FROM chart_of_accounts WHERE accountName = 'American Express - Business' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Credit Card - Amex Business', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f002', (SELECT id FROM chart_of_accounts WHERE accountName = 'CapitalOne Credit Card' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Credit Card - CapitalOne', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f003', (SELECT id FROM chart_of_accounts WHERE accountName = 'Scotia gold' LIMIT 1), '9130350512376806', 'Maxfield Market Global LLC', 'exact', 'pending', 'QBO: Credit Card - Scotia Gold', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f004', (SELECT id FROM chart_of_accounts WHERE accountName = 'Robinhood' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Investment - Robinhood', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f005', (SELECT id FROM chart_of_accounts WHERE accountName = 'Stash' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Investment - Stash', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f006', (SELECT id FROM chart_of_accounts WHERE accountName = 'Fundrise' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Investment - Fundrise', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f007', (SELECT id FROM chart_of_accounts WHERE accountName = 'Loan' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Loan Payable', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000),
  ('qam_f008', (SELECT id FROM chart_of_accounts WHERE accountName = 'SMBX LOAN PRINCIPAL' LIMIT 1), '123145971566304', 'Maxfield Bakery', 'exact', 'pending', 'QBO: Loan Payable - SMBX', UNIX_TIMESTAMP(NOW())*1000, UNIX_TIMESTAMP(NOW())*1000)
ON DUPLICATE KEY UPDATE `updatedAt` = UNIX_TIMESTAMP(NOW())*1000;


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ SCHEMA ADDITIONS — Add lineage fields to chart_of_accounts                 │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Add purpose column (5-purpose taxonomy)
ALTER TABLE `chart_of_accounts`
  ADD COLUMN IF NOT EXISTS `accountPurpose` enum('money_in','money_out','we_own','we_owe','our_stake') DEFAULT 'money_out'
    COMMENT '5-purpose taxonomy: money_in, money_out, we_own, we_owe, our_stake'
    AFTER `accountType`,
  ADD COLUMN IF NOT EXISTS `masterCoaId` int DEFAULT NULL
    COMMENT 'Lineage: original master_coa.id this account was ingested from'
    AFTER `accountPurpose`,
  ADD COLUMN IF NOT EXISTS `lineageNotes` varchar(500) DEFAULT NULL
    COMMENT 'Human-readable lineage description'
    AFTER `masterCoaId`,
  ADD COLUMN IF NOT EXISTS `mergedFrom` json DEFAULT NULL
    COMMENT 'JSON array of master_coa.ids merged into this account during consolidation'
    AFTER `lineageNotes`,
  ADD KEY `coa_purpose_idx` (`accountPurpose`),
  ADD KEY `coa_master_coa_idx` (`masterCoaId`);

-- Backfill purpose from existing account types
UPDATE `chart_of_accounts` SET `accountPurpose` = 'money_in' WHERE `accountType` IN ('income', 'other_income');
UPDATE `chart_of_accounts` SET `accountPurpose` = 'money_out' WHERE `accountType` IN ('expense', 'other_expense', 'cost_of_goods_sold');
UPDATE `chart_of_accounts` SET `accountPurpose` = 'we_own' WHERE `accountType` IN ('asset', 'bank', 'accounts_receivable');
UPDATE `chart_of_accounts` SET `accountPurpose` = 'we_owe' WHERE `accountType` IN ('liability', 'credit_card', 'accounts_payable');
UPDATE `chart_of_accounts` SET `accountPurpose` = 'our_stake' WHERE `accountType` = 'equity';

-- Backfill masterCoaId from accountNumber (extract from vertical prefix + number pattern)
UPDATE `chart_of_accounts` SET `masterCoaId` = CAST(SUBSTRING(`accountNumber`, LOCATE('-', `accountNumber`) + 1) AS UNSIGNED)
WHERE `accountNumber` LIKE '%-%' AND `masterCoaId` IS NULL;

-- ─── Populate COA Change Log with all transformation records ───

INSERT INTO `coa_change_log` (`id`, `changeType`, `oldAccountId`, `newAccountId`, `oldName`, `newName`, `oldAccountType`, `newAccountType`, `oldPurpose`, `newPurpose`, `verticalPrefix`, `qboMappingType`, `consolidatedFrom`, `reason`, `performedAt`)
VALUES
  -- Income retypes
  ('ccl_rt_029', 'retype', 29, NULL, 'Bohemian: Long Term Rental Income', 'Rental Income: Long Term', 'expense', 'other_income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to other_income — rental income account hidden in expense categories', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_069', 'retype', 69, NULL, 'Interest Earned', 'Interest Income', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', NULL, 'Retyped from expense to other_income — interest income consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_070', 'retype', 70, NULL, 'Interest Income', 'Interest Income', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', NULL, 'Retyped from expense to other_income — interest income consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_080', 'retype', 80, NULL, 'Long Term Rental Income', 'Rental Income: Long Term', 'expense', 'other_income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to other_income — rental income consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_120', 'retype', 120, NULL, 'Sale of Services - Consutlancy Income', 'Sale of Services - Consultancy Income', 'expense', 'income', 'money_out', 'money_in', 'SELF', 'none', NULL, 'Retyped from expense to income — consultancy income account hidden in expense categories', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_121', 'retype', 121, NULL, 'Sales of Product Income', 'Sales of Product Income', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'none', NULL, 'Retyped from expense to income — product sales', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_122', 'retype', 122, NULL, 'Sales:Easter Bun Sales', 'Sales:Easter Bun Sales', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'rollup', NULL, 'Retyped from expense to income — bakery product sales', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_123', 'retype', 123, NULL, 'Sales:Spice Bun Sales', 'Sales:Spice Bun Sales', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'rollup', NULL, 'Retyped from expense to income — bakery product sales', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_129', 'retype', 129, NULL, 'Short Term Rental Income', 'Short Term Rental Income', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — STR parent account', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_130', 'retype', 130, NULL, 'Short Term Rental Income:Airbnb Rental Income', 'Short Term Rental Income: Airbnb', 'expense', 'income', 'money_out', 'money_in', 'BL', 'rollup', NULL, 'Retyped from expense to income — Airbnb platform income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_131', 'retype', 131, NULL, 'Short Term Rental Income:Booking.com Income', 'Short Term Rental Income: Booking.com', 'expense', 'income', 'money_out', 'money_in', 'BL', 'rollup', NULL, 'Retyped from expense to income — Booking.com platform income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_132', 'retype', 132, NULL, 'Short Term Rental Income:VRBO Income', 'Short Term Rental Income: VRBO', 'expense', 'income', 'money_out', 'money_in', 'BL', 'rollup', NULL, 'Retyped from expense to income — VRBO platform income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_141', 'retype', 141, NULL, 'Tax Refund', 'Tax Refund', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', NULL, 'Retyped from expense to other_income — tax refund is income not expense', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_167', 'retype', 167, NULL, 'booking_com_invoice_payment', 'Booking.com Invoice Payments', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — booking platform payment', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_168', 'retype', 168, NULL, 'booking_com_payment', 'Booking.com Payments', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — booking platform payment', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_171', 'retype', 171, NULL, 'direct_booking', 'Direct Bookings', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — direct booking income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_172', 'retype', 172, NULL, 'easter_bun_order', 'Easter Bun Orders', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'none', NULL, 'Retyped from expense to income — bakery order income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_175', 'retype', 175, NULL, 'mboms_order', 'MBOMS Orders', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'none', NULL, 'Retyped from expense to income — bakery order income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_177', 'retype', 177, NULL, 'rickeys_caribbean', 'Rickeys Caribbean Sales', 'expense', 'income', 'money_out', 'money_in', 'MKT', 'none', NULL, 'Retyped from expense to income — market sales income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_181', 'retype', 181, NULL, 'website_order', 'Website Orders', 'expense', 'income', 'money_out', 'money_in', 'MKT', 'none', NULL, 'Retyped from expense to income — website order income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_183', 'retype', 183, NULL, 'Sales Income', 'Sales Income', 'expense', 'income', 'money_out', 'money_in', 'BKY', 'none', NULL, 'Retyped from expense to income — general sales income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_185', 'retype', 185, NULL, 'Bank Interest Income', 'Interest Income', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', NULL, 'Retyped from expense to other_income — interest income consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_188', 'retype', 188, NULL, 'Rental Income', 'Rental Income', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — rental income', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_189', 'retype', 189, NULL, 'Booking & Platform Payouts', 'Booking & Platform Payouts', 'expense', 'income', 'money_out', 'money_in', 'BL', 'none', NULL, 'Retyped from expense to income — booking platform payouts', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rt_190', 'retype', 190, NULL, 'Other Income', 'Other Income', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', NULL, 'Retyped from expense to other_income — miscellaneous income', UNIX_TIMESTAMP(NOW())*1000),

  -- Transfer rail removals
  ('ccl_rm_004', 'remove', 4, NULL, 'ATM', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer rail / payment method (ATM withdrawal), not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_005', 'remove', 5, NULL, 'ATM/Mobile Deposit', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer rail / deposit mechanism, not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_024', 'remove', 24, NULL, 'Bank Deposit', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: deposit mechanism, not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_037', 'remove', 37, NULL, 'Cash App', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: payment method (Cash App), not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_071', 'remove', 71, NULL, 'Internal Transfer', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_091', 'remove', 91, NULL, 'PayPal', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: payment method (PayPal), not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_145', 'remove', 145, NULL, 'Transfer', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_146', 'remove', 146, NULL, 'Transfer to Joint', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_147', 'remove', 147, NULL, 'Transfer to Maxfield', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: inter-entity transfer, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_163', 'remove', 163, NULL, 'Venmo', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: payment method (Venmo), not expense category', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_166', 'remove', 166, NULL, 'bank_transfer', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_179', 'remove', 179, NULL, 'transfer', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_180', 'remove', 180, NULL, 'transfer to Bank of Tarik', NULL, 'expense', NULL, 'money_out', NULL, 'SELF', 'none', NULL, 'Removed: personal transfer, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_rm_186', 'remove', 186, NULL, 'Transfer In/Out (non-P&L)', NULL, 'expense', NULL, 'money_out', NULL, 'SHARED', 'none', NULL, 'Removed: non-P&L transfer mechanism, consolidated into Inter-Account Transfer', UNIX_TIMESTAMP(NOW())*1000),

  -- Consolidations
  ('ccl_cs_002', 'consolidate', 2, NULL, '6040 Computer & Internet', 'Computer & Internet', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[41]', 'Near-duplicate: 6040 Computer & Internet + Computer & Internet Expenses', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_023', 'consolidate', 23, NULL, 'Bank Charges & Fees', 'Bank Charges & Fees', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[25,81]', 'Three variants of bank charges consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_039', 'consolidate', 39, NULL, 'Cleaning Expense (Rental Property)', 'Cleaning & Sanitation (Rental)', 'expense', 'expense', 'money_out', 'money_out', 'BL', 'none', '[28,40]', 'Three cleaning expense variants for rental properties', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_114', 'consolidate', 114, NULL, 'Repairs & Maintenance', 'Repairs & Maintenance', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[30]', 'Bohemian prefix + shared repairs consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_157', 'consolidate', 157, NULL, 'Utilities', 'Utilities', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[32,158,159]', 'Four utility variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_082', 'consolidate', 82, NULL, 'Marketing & Ads', 'Marketing & Advertising', 'expense', 'expense', 'money_out', 'money_out', 'BKY', 'none', '[19,83]', 'Bakery-specific + shared marketing accounts', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_133', 'consolidate', 133, NULL, 'Software & AI Tools', 'Software & Tools', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[134,135,164]', 'Four software-related accounts merged', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_138', 'consolidate', 138, NULL, 'Subscriptions', 'Subscriptions', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[136]', 'Spotify + general subscriptions merged', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_096', 'consolidate', 96, NULL, 'Personal Care', 'Personal Care & Grooming', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[60,61]', 'Three personal care variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_064', 'consolidate', 64, NULL, 'Health / Wellness', 'Health & Wellness', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[63,165,173]', 'Four health/wellness variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_059', 'consolidate', 59, NULL, 'Groceries/Household', 'Groceries & Food', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[57,58,98]', 'Four grocery/food variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_148', 'consolidate', 148, NULL, 'Travel', 'Travel', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[31,149]', 'Three travel variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_108', 'consolidate', 108, NULL, 'Property - Improvements', 'Property & Improvements', 'expense', 'expense', 'money_out', 'money_out', 'BL', 'none', '[105,106,107]', 'Four property-related accounts consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_016', 'consolidate', 16, NULL, 'Ask My Accountant', 'Ask My Accountant', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[182]', 'Main + suspense variant — system suspense account', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_070', 'consolidate', 70, NULL, 'Interest Income', 'Interest Income', 'expense', 'other_income', 'money_out', 'money_in', 'SHARED', 'none', '[69,185]', 'Three interest income variants consolidated + retyped', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_080', 'consolidate', 80, NULL, 'Long Term Rental Income', 'Rental Income: Long Term', 'expense', 'other_income', 'money_out', 'money_in', 'BL', 'none', '[29]', 'Bohemian prefix + shared long term rental consolidated + retyped', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_088', 'consolidate', 88, NULL, 'Owner''s Draw', 'Owner Equity & Draws', 'expense', 'equity', 'money_out', 'our_stake', 'SELF', 'none', '[89]', 'Draw + Investment consolidated as equity + retyped', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_076', 'consolidate', 76, NULL, 'Kids Room / Decor', 'Kids Expenses', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[72,73,74,75,124,143,144]', 'Eight kids sub-accounts into single parent', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_140', 'consolidate', 140, NULL, 'Supplies & Materials', 'Supplies & Materials', 'expense', 'expense', 'money_out', 'money_out', 'BKY', 'none', '[3,42,116]', 'Four supply/packaging accounts consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_067', 'consolidate', 67, NULL, 'Insurance', 'Insurance', 'expense', 'expense', 'money_out', 'money_out', 'SHARED', 'none', '[68,100,109]', 'Four insurance variants consolidated', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_103', 'consolidate', 103, NULL, 'Phone', 'Communication & Media', 'expense', 'expense', 'money_out', 'money_out', 'PERS', 'none', '[87]', 'NY Times + Phone merged', UNIX_TIMESTAMP(NOW())*1000),
  ('ccl_cs_017', 'consolidate', 17, NULL, 'Auto Loan Payment', 'Auto Loan', 'expense', 'liability', 'money_out', 'we_owe', 'SHARED', 'none', NULL, 'Renamed from Auto Loan Payment, retyped to liability', UNIX_TIMESTAMP(NOW())*1000);

-- ─── Create Inter-Account Transfer change log entry ───
INSERT INTO `coa_change_log` (`id`, `changeType`, `oldAccountId`, `newAccountId`, `oldName`, `newName`, `oldAccountType`, `newAccountType`, `oldPurpose`, `newPurpose`, `verticalPrefix`, `qboMappingType`, `consolidatedFrom`, `reason`, `performedAt`)
VALUES
  ('ccl_create_900', 'create', NULL, 'acct_inter_transfer_01', NULL, 'Inter-Account Transfer', NULL, 'expense', NULL, 'money_out', 'SHARED', 'none', '[4,5,24,37,71,91,145,146,147,163,166,179,180,186]', 'Created: consolidated transfer mechanism from 14 deprecated transfer rails', UNIX_TIMESTAMP(NOW())*1000);

SET FOREIGN_KEY_CHECKS = 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Summary:
--   - 191 accounts ingested from master_coa
--   - 25 income accounts retyped from expense to income/other_income
--   - 14 financial accounts retyped to asset/liability/equity/credit_card
--   - 14 transfer rails deprecated (consolidated into Inter-Account Transfer)
--   - 22 groups of near-duplicates consolidated into clean accounts
--   - Final active account count: ~128
--   - 9 vertical G.L. catalogs created
--   - QBO mapping framework initialized for 2 realms
--   - Full audit trail in coa_change_log
-- ═══════════════════════════════════════════════════════════════════════════════