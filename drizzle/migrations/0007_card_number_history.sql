-- Card grouping: group replacement/reissued/virtual card numbers onto one canonical account
ALTER TABLE bank_accounts
  ADD COLUMN cardNumberHistory JSON NULL,
  ADD COLUMN canonicalAccountId INT NULL;
CREATE INDEX idx_bank_accounts_canonical ON bank_accounts (canonicalAccountId);
-- Backfill known aliases (adjust to production data before running):
-- UPDATE bank_accounts SET cardNumberHistory = JSON_ARRAY('5000') WHERE lastFourDigits = '3005';
-- UPDATE bank_accounts SET cardNumberHistory = JSON_ARRAY('9282') WHERE lastFourDigits = '6376';
