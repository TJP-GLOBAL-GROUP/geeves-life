CREATE TABLE `expense_categorization_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`namePattern` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`defaultProperty` enum('artistes_boutique','morabeza','sunset_studio','personal'),
	`hitCount` int NOT NULL DEFAULT 0,
	`minConfidence` int NOT NULL DEFAULT 80,
	`isActive` boolean NOT NULL DEFAULT true,
	`source` enum('ai_learned','manual','seed') NOT NULL DEFAULT 'ai_learned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_categorization_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`name` varchar(500) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(12,2),
	`lineTotal` decimal(12,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`productUrl` text,
	`vendorProductId` varchar(255),
	`asin` varchar(20),
	`expenseCategory` varchar(100),
	`propertyAttribution` enum('artistes_boutique','morabeza','sunset_studio','personal','unclassified') NOT NULL DEFAULT 'unclassified',
	`isTaxDeductible` boolean NOT NULL DEFAULT false,
	`aiConfidence` int,
	`isManualOverride` boolean NOT NULL DEFAULT false,
	`expenseRecordId` int,
	`deliveryAddress` varchar(500),
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `property_expense_records` MODIFY COLUMN `source` enum('spreadsheet_import','manual','email_scrape','order_import') NOT NULL DEFAULT 'spreadsheet_import';--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `amountUSD` decimal(14,2);--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `exchangeRateUsed` decimal(10,4);--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `qboExpenseId` varchar(100);--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `qboSyncStatus` enum('pending','synced','failed','skipped') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `qboSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `qboSyncError` text;--> statement-breakpoint
ALTER TABLE `property_expense_records` ADD `orderItemId` int;--> statement-breakpoint
CREATE INDEX `ecr_pattern_idx` ON `expense_categorization_rules` (`namePattern`);--> statement-breakpoint
CREATE INDEX `ecr_category_idx` ON `expense_categorization_rules` (`category`);--> statement-breakpoint
CREATE INDEX `oi_order_idx` ON `order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `oi_property_idx` ON `order_items` (`propertyAttribution`);--> statement-breakpoint
CREATE INDEX `oi_category_idx` ON `order_items` (`expenseCategory`);--> statement-breakpoint
CREATE INDEX `oi_deductible_idx` ON `order_items` (`isTaxDeductible`);