CREATE TABLE `chart_of_accounts` (
	`id` varchar(21) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`accountType` enum('income','cost_of_goods_sold','expense','other_expense','other_income','asset','liability','equity','accounts_receivable','accounts_payable','bank','credit_card') NOT NULL,
	`detailType` varchar(100) NOT NULL,
	`accountName` varchar(200) NOT NULL,
	`accountNumber` varchar(20),
	`description` varchar(500),
	`parentAccountId` varchar(21),
	`displayOrder` int DEFAULT 0,
	`qboAccountId` varchar(50),
	`qboFullyQualifiedName` varchar(300),
	`qboSyncStatus` enum('synced','pending_create','pending_map','geeves_only','deprecated') DEFAULT 'geeves_only',
	`lastSyncedAt` bigint,
	`isActive` boolean DEFAULT true,
	`isDefault` boolean DEFAULT false,
	`isSystemAccount` boolean DEFAULT false,
	`isTaxRelevant` boolean DEFAULT false,
	`taxFormLine` varchar(50),
	`taxJurisdiction` enum('us_federal','us_state','jamaica'),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	`createdBy` varchar(36),
	CONSTRAINT `chart_of_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `coa_unique_name` UNIQUE(`verticalId`,`accountName`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`verticalId_exp` varchar(36) NOT NULL,
	`propertyId_exp` varchar(36),
	`chartOfAccountId_exp` varchar(21) NOT NULL,
	`vendorOrderItemId` varchar(21),
	`vendorOrderId_exp` varchar(21),
	`financialTransactionId_exp` int,
	`transactionMatchId` varchar(21),
	`amount` decimal(12,2) NOT NULL,
	`currency_exp` varchar(3) NOT NULL DEFAULT 'USD',
	`description_exp` varchar(500) NOT NULL,
	`expenseDate` bigint NOT NULL,
	`paymentMethod_exp` varchar(100),
	`paymentAccountId` int,
	`vendorName_exp` varchar(200),
	`isTaxDeductible_exp` boolean NOT NULL DEFAULT false,
	`taxCategory_exp` varchar(100),
	`taxFormLine_exp` varchar(50),
	`approvalStatus` enum('auto_approved','pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
	`approvedBy` varchar(36),
	`approvedAt` bigint,
	`qboExportStatus` enum('not_exported','pending','exported','export_failed','excluded') NOT NULL DEFAULT 'not_exported',
	`qboExpenseId` varchar(50),
	`qboExportedAt` bigint,
	`qboExportError` text,
	`receiptUrl_exp` text,
	`source_exp` enum('vendor_order','bank_transaction','manual','recurring') NOT NULL DEFAULT 'vendor_order',
	`aiConfidence_exp` int,
	`isManualOverride_exp` boolean NOT NULL DEFAULT false,
	`notes_exp` text,
	`createdAt_exp` bigint NOT NULL,
	`updatedAt_exp` bigint NOT NULL,
	`createdBy_exp` varchar(36),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction_matches` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`financialTransactionId` int NOT NULL,
	`vendorOrderId` varchar(21) NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`matchMethod` enum('exact_amount','fuzzy_amount','date_vendor_amount','manual','ai_suggestion','rule_based') NOT NULL,
	`status_tm` enum('proposed','confirmed','rejected','overridden') NOT NULL DEFAULT 'proposed',
	`confirmedBy` varchar(36),
	`confirmedAt` bigint,
	`allocatedAmount` decimal(12,2),
	`matchReason` text,
	`verticalId_tm` varchar(36),
	`createdAt_tm` bigint NOT NULL,
	`updatedAt_tm` bigint NOT NULL,
	CONSTRAINT `transaction_matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_accounts` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`vendorName` varchar(200) NOT NULL,
	`vendorSlug` varchar(50) NOT NULL,
	`platform` enum('amazon','walmart','uber','google','apple','paypal','lowes','target','home_depot','shopify','wayfair','costco','sams_club','instacart','doordash','grubhub','other') NOT NULL,
	`bankStatementPatterns` json,
	`accountEmail` varchar(320),
	`accountUsername` varchar(200),
	`defaultVerticalId` varchar(36),
	`defaultChartOfAccountId` varchar(21),
	`defaultPropertyId` varchar(36),
	`matchStrategy` enum('strict','moderate','manual'),
	`importMethod` enum('email_scrape','api','csv_upload','manual','browser_extension') DEFAULT 'manual',
	`lastImportAt` bigint,
	`lastImportCount` int,
	`isActive` boolean DEFAULT true,
	`notes` text,
	`createdAt_va` bigint NOT NULL,
	`updatedAt_va` bigint NOT NULL,
	CONSTRAINT `vendor_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `va_slug_household_idx` UNIQUE(`householdId`,`vendorSlug`)
);
--> statement-breakpoint
CREATE TABLE `vendor_order_items` (
	`id` varchar(21) NOT NULL,
	`vendorOrderId` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`name` varchar(500) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(12,2),
	`lineTotal` decimal(12,2),
	`itemTax` decimal(12,2),
	`currency_voi` varchar(3) NOT NULL DEFAULT 'USD',
	`vendorProductId` varchar(255),
	`asin` varchar(20),
	`productUrl` text,
	`vendorCategory` varchar(200),
	`chartOfAccountId` varchar(21),
	`verticalId_voi` varchar(36),
	`propertyId_voi` varchar(36),
	`isTaxDeductible_voi` boolean NOT NULL DEFAULT false,
	`taxCategory` varchar(100),
	`taxFormLine_voi` varchar(50),
	`aiConfidence_voi` int,
	`isManualOverride_voi` boolean NOT NULL DEFAULT false,
	`deliveryAddress_voi` varchar(500),
	`tags_voi` json,
	`legacyOrderItemId` int,
	`createdAt_voi` bigint NOT NULL,
	`updatedAt_voi` bigint NOT NULL,
	CONSTRAINT `vendor_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_orders` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`vendorAccountId` varchar(21) NOT NULL,
	`orderNumber` varchar(255),
	`platform_vo` enum('amazon','walmart','uber','google','apple','paypal','lowes','target','home_depot','shopify','wayfair','costco','sams_club','instacart','doordash','grubhub','other') NOT NULL,
	`status_vo` enum('pending','processing','shipped','delivered','cancelled','returned','refunded') NOT NULL DEFAULT 'pending',
	`subtotal` decimal(12,2),
	`taxAmount` decimal(12,2),
	`shippingAmount` decimal(12,2),
	`totalAmount` decimal(12,2),
	`discountAmount` decimal(12,2),
	`currency_vo` varchar(3) NOT NULL DEFAULT 'USD',
	`orderDate` bigint NOT NULL,
	`deliveryDate` bigint,
	`trackingNumbers` json,
	`deliveryAddress` varchar(500),
	`paymentMethod` varchar(100),
	`paymentCardLast4` varchar(4),
	`importSource_vo` enum('email_scrape','api','csv_upload','manual','browser_extension','whatsapp') NOT NULL DEFAULT 'manual',
	`rawImportData` json,
	`legacyOrderId` int,
	`legacyWalmartOrderId` int,
	`notes` text,
	`createdAt_vo` bigint NOT NULL,
	`updatedAt_vo` bigint NOT NULL,
	CONSTRAINT `vendor_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vertical_financial_configs` (
	`id` varchar(21) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`defaultCurrency` varchar(3) NOT NULL DEFAULT 'USD',
	`supportedCurrencies` varchar(50) DEFAULT 'USD',
	`exchangeRateToUsd` decimal(12,6),
	`exchangeRateLastUpdated` bigint,
	`exchangeRateSource` varchar(50) DEFAULT 'manual',
	`reconciliationToleranceAbs` decimal(10,2) DEFAULT '1.00',
	`reconciliationTolerancePct` decimal(5,2) DEFAULT '2.00',
	`dateWindowDays` int DEFAULT 7,
	`autoMatchMinConfidence` decimal(5,2) DEFAULT '0.85',
	`proposalMinConfidence` decimal(5,2) DEFAULT '0.60',
	`qboRealmId` varchar(50),
	`qboCompanyName` varchar(200),
	`qboSyncEnabled` boolean DEFAULT false,
	`qboLastSyncAt` bigint,
	`qboSyncDirection` enum('geeves_to_qbo','qbo_to_geeves','bidirectional') DEFAULT 'geeves_to_qbo',
	`qboDefaultClassId` varchar(50),
	`qboDefaultClassName` varchar(100),
	`exportFormat` enum('api','iif','csv','qbo_web_connector') DEFAULT 'api',
	`exportApprovalRequired` boolean DEFAULT true,
	`exportBatchSize` int DEFAULT 50,
	`taxJurisdiction_vfc` enum('us_federal','us_state_ny','us_state_ca','jamaica'),
	`taxEntityType` enum('sole_proprietor','llc_single','llc_multi','corporation','partnership','personal'),
	`taxFormType` varchar(20),
	`fiscalYearEnd` varchar(5) DEFAULT '12-31',
	`accountingMethod` enum('cash','accrual') DEFAULT 'cash',
	`defaultVendorMatchStrategy` enum('strict','moderate','manual') DEFAULT 'strict',
	`createdAt_vfc` bigint NOT NULL,
	`updatedAt_vfc` bigint NOT NULL,
	CONSTRAINT `vertical_financial_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `vertical_financial_configs_verticalId_unique` UNIQUE(`verticalId`)
);
--> statement-breakpoint
CREATE INDEX `coa_vertical_idx` ON `chart_of_accounts` (`verticalId`);--> statement-breakpoint
CREATE INDEX `coa_household_vertical_idx` ON `chart_of_accounts` (`householdId`,`verticalId`);--> statement-breakpoint
CREATE INDEX `coa_account_type_idx` ON `chart_of_accounts` (`verticalId`,`accountType`);--> statement-breakpoint
CREATE INDEX `coa_qbo_account_idx` ON `chart_of_accounts` (`qboAccountId`);--> statement-breakpoint
CREATE INDEX `exp_household_idx` ON `expenses` (`householdId`);--> statement-breakpoint
CREATE INDEX `exp_vertical_idx` ON `expenses` (`verticalId_exp`);--> statement-breakpoint
CREATE INDEX `exp_property_idx` ON `expenses` (`propertyId_exp`);--> statement-breakpoint
CREATE INDEX `exp_coa_idx` ON `expenses` (`chartOfAccountId_exp`);--> statement-breakpoint
CREATE INDEX `exp_voi_idx` ON `expenses` (`vendorOrderItemId`);--> statement-breakpoint
CREATE INDEX `exp_transaction_idx` ON `expenses` (`financialTransactionId_exp`);--> statement-breakpoint
CREATE INDEX `exp_date_idx` ON `expenses` (`expenseDate`);--> statement-breakpoint
CREATE INDEX `exp_approval_idx` ON `expenses` (`approvalStatus`);--> statement-breakpoint
CREATE INDEX `exp_qbo_export_idx` ON `expenses` (`qboExportStatus`);--> statement-breakpoint
CREATE INDEX `tm_household_idx` ON `transaction_matches` (`householdId`);--> statement-breakpoint
CREATE INDEX `tm_transaction_idx` ON `transaction_matches` (`financialTransactionId`);--> statement-breakpoint
CREATE INDEX `tm_vendor_order_idx` ON `transaction_matches` (`vendorOrderId`);--> statement-breakpoint
CREATE INDEX `tm_status_idx` ON `transaction_matches` (`status_tm`);--> statement-breakpoint
CREATE INDEX `tm_vertical_idx` ON `transaction_matches` (`verticalId_tm`);--> statement-breakpoint
CREATE INDEX `va_household_idx` ON `vendor_accounts` (`householdId`);--> statement-breakpoint
CREATE INDEX `va_platform_idx` ON `vendor_accounts` (`platform`);--> statement-breakpoint
CREATE INDEX `voi_vendor_order_idx` ON `vendor_order_items` (`vendorOrderId`);--> statement-breakpoint
CREATE INDEX `voi_household_idx` ON `vendor_order_items` (`householdId`);--> statement-breakpoint
CREATE INDEX `voi_vertical_idx` ON `vendor_order_items` (`verticalId_voi`);--> statement-breakpoint
CREATE INDEX `voi_property_idx` ON `vendor_order_items` (`propertyId_voi`);--> statement-breakpoint
CREATE INDEX `voi_coa_idx` ON `vendor_order_items` (`chartOfAccountId`);--> statement-breakpoint
CREATE INDEX `voi_deductible_idx` ON `vendor_order_items` (`isTaxDeductible_voi`);--> statement-breakpoint
CREATE INDEX `voi_legacy_idx` ON `vendor_order_items` (`legacyOrderItemId`);--> statement-breakpoint
CREATE INDEX `vo_household_idx` ON `vendor_orders` (`householdId`);--> statement-breakpoint
CREATE INDEX `vo_vendor_account_idx` ON `vendor_orders` (`vendorAccountId`);--> statement-breakpoint
CREATE INDEX `vo_platform_idx` ON `vendor_orders` (`platform_vo`);--> statement-breakpoint
CREATE INDEX `vo_order_date_idx` ON `vendor_orders` (`orderDate`);--> statement-breakpoint
CREATE INDEX `vo_order_number_idx` ON `vendor_orders` (`orderNumber`);--> statement-breakpoint
CREATE INDEX `vo_legacy_order_idx` ON `vendor_orders` (`legacyOrderId`);--> statement-breakpoint
CREATE INDEX `vfc_vertical_idx` ON `vertical_financial_configs` (`verticalId`);--> statement-breakpoint
CREATE INDEX `vfc_household_idx` ON `vertical_financial_configs` (`householdId`);--> statement-breakpoint
CREATE INDEX `vfc_qbo_realm_idx` ON `vertical_financial_configs` (`qboRealmId`);