CREATE TABLE `airbnb_payout_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`property` enum('artistes_boutique','morabeza','sunset_studio') NOT NULL,
	`recordDate` timestamp NOT NULL,
	`recordType` varchar(100) NOT NULL,
	`confirmationCode` varchar(50),
	`bookingDate` timestamp,
	`startDate` timestamp,
	`endDate` timestamp,
	`nights` int,
	`guestName` varchar(255),
	`listingName` varchar(255),
	`details` varchar(500),
	`referenceCode` varchar(100),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`amount` decimal(12,2),
	`paidOut` decimal(12,2),
	`serviceFee` decimal(12,2),
	`cleaningFee` decimal(12,2),
	`managementFee` decimal(12,2),
	`petFee` decimal(12,2),
	`grossEarnings` decimal(12,2),
	`airbnbRemittedTax` decimal(12,2),
	`earningsYear` int,
	`bankTransactionId` int,
	`documentId` int,
	`isReconciled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `airbnb_payout_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`accountName` varchar(255) NOT NULL,
	`institution` varchar(100) NOT NULL,
	`accountType` enum('chequing','savings','credit_card','business_chequing','business_savings','business_credit','investment','airbnb_payout') NOT NULL,
	`lastFourDigits` varchar(10),
	`accountNumber` varchar(50),
	`currency` varchar(3) NOT NULL DEFAULT 'JMD',
	`creditLimitJMD` decimal(14,2),
	`vertical` enum('personal','artistes_boutique','morabeza','sunset_studio','maxfield_bakery','multi') NOT NULL DEFAULT 'personal',
	`isActive` boolean NOT NULL DEFAULT true,
	`statementFolderUrl` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`transactionId` int,
	`accountId` int,
	`documentType` enum('bank_statement','credit_card_statement','receipt','invoice','email_evidence','airbnb_report','vrbo_report','booking_report','tax_document','other') NOT NULL,
	`documentDate` timestamp,
	`description` varchar(500) NOT NULL,
	`s3Key` varchar(500) NOT NULL,
	`s3Url` text NOT NULL,
	`originalFilename` varchar(255),
	`vertical` enum('personal','artistes_boutique','morabeza','sunset_studio','maxfield_bakery','multi') NOT NULL DEFAULT 'personal',
	`statementYear` int,
	`statementMonth` int,
	`currency` varchar(3) DEFAULT 'JMD',
	`taxYear` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`transactionDate` timestamp NOT NULL,
	`postingDate` timestamp,
	`description` varchar(500) NOT NULL,
	`referenceNumber` varchar(100),
	`debitAmount` decimal(14,2),
	`creditAmount` decimal(14,2),
	`balance` decimal(14,2),
	`currency` varchar(3) NOT NULL DEFAULT 'JMD',
	`vertical` enum('personal','artistes_boutique','morabeza','sunset_studio','maxfield_bakery','multi','unclassified') NOT NULL DEFAULT 'unclassified',
	`expenseCategory` varchar(100),
	`aiConfidence` int,
	`isManualOverride` boolean NOT NULL DEFAULT false,
	`isReconciled` boolean NOT NULL DEFAULT false,
	`expenseRecordId` int,
	`receiptUrl` text,
	`source` enum('bank_statement','airbnb_csv','vrbo_csv','booking_csv','manual') NOT NULL DEFAULT 'bank_statement',
	`statementYear` int,
	`statementMonth` int,
	`isTaxDeductible` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_expense_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`property` enum('artistes_boutique','morabeza','sunset_studio') NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`expenseYear` int NOT NULL,
	`expenseMonth` int NOT NULL,
	`expenseDescription` varchar(500) NOT NULL,
	`category` varchar(100) NOT NULL,
	`amountJMD` decimal(14,2) NOT NULL,
	`paidTo` varchar(255),
	`paidFrom` varchar(100),
	`bankTransactionId` int,
	`documentId` int,
	`supportingDocUrl` text,
	`notes` text,
	`isReconciled` boolean NOT NULL DEFAULT false,
	`isTaxDeductible` boolean NOT NULL DEFAULT true,
	`source` enum('spreadsheet_import','manual') NOT NULL DEFAULT 'spreadsheet_import',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_expense_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `apr_household_idx` ON `airbnb_payout_records` (`householdId`);--> statement-breakpoint
CREATE INDEX `apr_property_idx` ON `airbnb_payout_records` (`property`);--> statement-breakpoint
CREATE INDEX `apr_year_idx` ON `airbnb_payout_records` (`earningsYear`);--> statement-breakpoint
CREATE INDEX `apr_confirmation_idx` ON `airbnb_payout_records` (`confirmationCode`);--> statement-breakpoint
CREATE INDEX `fa_household_idx` ON `financial_accounts` (`householdId`);--> statement-breakpoint
CREATE INDEX `fa_vertical_idx` ON `financial_accounts` (`vertical`);--> statement-breakpoint
CREATE INDEX `fd_household_idx` ON `financial_documents` (`householdId`);--> statement-breakpoint
CREATE INDEX `fd_account_idx` ON `financial_documents` (`accountId`);--> statement-breakpoint
CREATE INDEX `fd_transaction_idx` ON `financial_documents` (`transactionId`);--> statement-breakpoint
CREATE INDEX `fd_vertical_idx` ON `financial_documents` (`vertical`);--> statement-breakpoint
CREATE INDEX `fd_year_idx` ON `financial_documents` (`taxYear`);--> statement-breakpoint
CREATE INDEX `ft_household_idx` ON `financial_transactions` (`householdId`);--> statement-breakpoint
CREATE INDEX `ft_account_idx` ON `financial_transactions` (`accountId`);--> statement-breakpoint
CREATE INDEX `ft_date_idx` ON `financial_transactions` (`transactionDate`);--> statement-breakpoint
CREATE INDEX `ft_vertical_idx` ON `financial_transactions` (`vertical`);--> statement-breakpoint
CREATE INDEX `ft_year_month_idx` ON `financial_transactions` (`statementYear`,`statementMonth`);--> statement-breakpoint
CREATE INDEX `ft_reconciled_idx` ON `financial_transactions` (`isReconciled`);--> statement-breakpoint
CREATE INDEX `per_household_idx` ON `property_expense_records` (`householdId`);--> statement-breakpoint
CREATE INDEX `per_property_idx` ON `property_expense_records` (`property`);--> statement-breakpoint
CREATE INDEX `per_year_idx` ON `property_expense_records` (`expenseYear`);--> statement-breakpoint
CREATE INDEX `per_category_idx` ON `property_expense_records` (`category`);--> statement-breakpoint
CREATE INDEX `per_reconciled_idx` ON `property_expense_records` (`isReconciled`);