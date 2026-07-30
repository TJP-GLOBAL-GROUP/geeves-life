-- MIGRATION: Unified General Ledger Phase 1
-- Date: 2026-07-30

-- Evolve chart_of_accounts
ALTER TABLE chart_of_accounts
  ADD COLUMN purpose ENUM('money_in','money_out','we_own','we_owe','our_stake') NULL AFTER accountType,
  ADD COLUMN taxFormSub VARCHAR(50) NULL AFTER taxFormLine,
  ADD COLUMN sortOrder INT DEFAULT 0 AFTER taxJurisdiction,
  ADD INDEX coa_purpose_idx (verticalId, purpose);

-- Evolve expenses (add migration tracking)
ALTER TABLE expenses
  ADD COLUMN migratedToJournalEntryId VARCHAR(21) NULL,
  ADD COLUMN migrationBatch VARCHAR(20) NULL,
  ADD INDEX idx_expenses_migrated (migratedToJournalEntryId);

-- Evolve property_expense_records (add migration tracking)
ALTER TABLE property_expense_records
  ADD COLUMN migratedToJournalEntryId VARCHAR(21) NULL,
  ADD INDEX idx_per_migrated (migratedToJournalEntryId);

-- Evolve bank_accounts (add balance tracking)
ALTER TABLE bank_accounts
  ADD COLUMN lastBalanceSyncAt TIMESTAMP NULL,
  ADD COLUMN lastStatementDate DATE NULL,
  ADD COLUMN notes TEXT NULL;

-- Create journal_entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(21) PRIMARY KEY,
  entry_date DATE NOT NULL,
  fiscal_year INT NOT NULL,
  fiscal_month INT NOT NULL,
  verticalId VARCHAR(36) NOT NULL,
  propertyId VARCHAR(21) NULL,
  entryType ENUM('revenue','expense','transfer','adjustment','dto','journal') NOT NULL,
  sourceTable VARCHAR(50) NULL,
  sourceId VARCHAR(21) NULL,
  reference VARCHAR(200) NULL,
  memo TEXT NULL,
  total_debit DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_credit DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(15,6) DEFAULT 1.000000,
  is_posted BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  posted_at TIMESTAMP NULL,
  postedBy VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX je_vertical_date_idx (verticalId, entry_date),
  INDEX je_fiscal_year_idx (fiscalYear, fiscalMonth),
  INDEX je_source_idx (sourceTable, sourceId),
  INDEX je_property_idx (propertyId),
  INDEX je_entry_type_idx (verticalId, entryType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create journal_lines
CREATE TABLE IF NOT EXISTS journal_lines (
  id VARCHAR(21) PRIMARY KEY,
  journalEntryId VARCHAR(21) NOT NULL,
  line_number INT NOT NULL,
  glAccountId VARCHAR(21) NOT NULL,
  propertyId VARCHAR(21) NULL,
  description VARCHAR(255) NULL,
  debit DECIMAL(15,2) DEFAULT 0.00,
  credit DECIMAL(15,2) DEFAULT 0.00,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(15,6) DEFAULT 1.000000,
  usd_equivalent DECIMAL(15,2) NULL,
  tax_form_line VARCHAR(50) NULL,
  is_tax_relevant BOOLEAN DEFAULT FALSE,
  receipt_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX jl_entry_idx (journalEntryId),
  INDEX jl_gl_account_idx (glAccountId),
  INDEX jl_property_idx (propertyId),
  INDEX jl_tax_form_idx (taxFormLine),
  INDEX jl_va_year_idx (glAccountId, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create transfer_pairs
CREATE TABLE IF NOT EXISTS transfer_pairs (
  id VARCHAR(21) PRIMARY KEY,
  fromEntryId VARCHAR(21) NOT NULL,
  toEntryId VARCHAR(21) NOT NULL,
  fromAccountId VARCHAR(21) NOT NULL,
  toAccountId VARCHAR(21) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  transferType ENUM('venmo','zelle','atm','owner_draw','loan_payment','credit_card_payment','internal_transfer') NOT NULL,
  description VARCHAR(255) NULL,
  is_reconciled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX tp_from_idx (fromEntryId),
  INDEX tp_to_idx (toEntryId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create tax_documents
CREATE TABLE IF NOT EXISTS tax_documents (
  id VARCHAR(21) PRIMARY KEY,
  verticalId VARCHAR(36) NOT NULL DEFAULT 'pers',
  householdId VARCHAR(36) NOT NULL,
  tax_year INT NOT NULL,
  documentType ENUM('form_1040','schedule_c','schedule_e','schedule_d','schedule_se','form_4562','form_4797','form_4684','form_8995','form_1116','form_5471','form_8582','preparation_guidance','w2','1099','payslip','bank_statement','receipt','other') NOT NULL,
  documentLabel VARCHAR(100) NULL,
  fileName VARCHAR(255) NOT NULL,
  gcsPath VARCHAR(500) NOT NULL,
  file_size_bytes INT NULL,
  mimeType VARCHAR(50) DEFAULT 'application/pdf',
  is_key_document BOOLEAN DEFAULT FALSE,
  extracted_data JSON NULL,
  uploadedBy VARCHAR(36) NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX td_year_type_idx (tax_year, documentType),
  INDEX td_vertical_idx (verticalId),
  INDEX td_key_doc_idx (verticalId, is_key_document)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create tax_line_items
CREATE TABLE IF NOT EXISTS tax_line_items (
  id VARCHAR(21) PRIMARY KEY,
  tax_year INT NOT NULL DEFAULT 2025,
  formName ENUM('1040','sch_c','sch_e','sch_d','sch_se','f4562','f4797','f4684','f8995','f1116','f5471','f8582') NOT NULL,
  formLine VARCHAR(20) NOT NULL,
  lineDescription VARCHAR(255) NULL,
  verticalId VARCHAR(36) NULL,
  propertyId VARCHAR(20) NULL,
  amount DECIMAL(15,2) NULL,
  sourceType ENUM('gl_sum','owner_input','prior_year_carryover','gap') DEFAULT 'gap',
  source_query TEXT NULL,
  confidence ENUM('certain','estimated','gap') DEFAULT 'gap',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX tli_form_line_idx (tax_year, formName, formLine),
  INDEX tli_vertical_idx (verticalId),
  UNIQUE KEY tli_unique_line (tax_year, formName, formLine, verticalId, propertyId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
