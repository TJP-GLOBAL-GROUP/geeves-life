CREATE TABLE `booking_screenshots` (
	`id` varchar(36) NOT NULL,
	`bookingId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`s3Url` text NOT NULL,
	`s3Key` text NOT NULL,
	`ocrExtractedData` json,
	`ocrConfidence` int,
	`isConfirmed` boolean NOT NULL DEFAULT false,
	`uploadedByMemberId` varchar(36),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `booking_screenshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_export_imports` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`platform` enum('airbnb','vrbo','booking_com') NOT NULL,
	`filename` varchar(255) NOT NULL,
	`s3Url` text NOT NULL,
	`s3Key` text NOT NULL,
	`recordCount` int,
	`matchedCount` int,
	`createdCount` int,
	`importStatus` enum('processing','completed','failed','partial') NOT NULL DEFAULT 'processing',
	`errorMessage` text,
	`uploadedByMemberId` varchar(36),
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_export_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_member_order` (
	`memberId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyOrder` json NOT NULL DEFAULT ('[]'),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_member_order_memberId` PRIMARY KEY(`memberId`)
);
--> statement-breakpoint
CREATE TABLE `property_photos` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`url` text NOT NULL,
	`s3Key` text NOT NULL,
	`caption` varchar(255),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `ltr_deposit_ledger`;--> statement-breakpoint
DROP TABLE `ltr_lease_tenants`;--> statement-breakpoint
DROP TABLE `ltr_leases`;--> statement-breakpoint
DROP TABLE `ltr_tenants`;--> statement-breakpoint
DROP INDEX `ltr_pay_property_idx` ON `ltr_payments`;--> statement-breakpoint
DROP INDEX `ltr_pay_lease_idx` ON `ltr_payments`;--> statement-breakpoint
DROP INDEX `ltr_pay_tenant_idx` ON `ltr_payments`;--> statement-breakpoint
DROP INDEX `ltr_pay_period_idx` ON `ltr_payments`;--> statement-breakpoint
DROP INDEX `ltr_pay_type_idx` ON `ltr_payments`;--> statement-breakpoint
ALTER TABLE `ltr_payments` MODIFY COLUMN `status` enum('paid','pending','overdue','partial','waived') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actorType` enum('user','system','geeves_ai','scheduled_job') DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `audit_log` ADD `verticalId` varchar(21);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `previousValue` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `newValue` text;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `tenantName` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `paymentType` enum('rent','utility_fee','deposit','late_fee','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `currency` varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `expectedAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `dueDate` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `paidDate` bigint;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `paymentMethod` varchar(100);--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `bankTransactionId` int;--> statement-breakpoint
ALTER TABLE `ltr_payments` ADD `source` enum('manual','stripe_webhook','zillow_import','email_scrape') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `taxRemittedByPlatform` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `taxOwedByHost` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `taxJurisdiction` varchar(50);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `passThroughTax` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `payoutDate` bigint;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `payoutBankAccount` varchar(100);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `financialSource` enum('email_scrape','platform_export','manual','screenshot_ocr','channex_api');--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `sync_status` enum('pending_sync','synced','sync_failed') DEFAULT 'pending_sync' NOT NULL;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `sync_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `last_sync_error` text;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `last_sync_attempt_at` bigint;--> statement-breakpoint
CREATE INDEX `bs_booking_idx` ON `booking_screenshots` (`bookingId`);--> statement-breakpoint
CREATE INDEX `bs_household_idx` ON `booking_screenshots` (`householdId`);--> statement-breakpoint
CREATE INDEX `pei_household_idx` ON `platform_export_imports` (`householdId`);--> statement-breakpoint
CREATE INDEX `pei_platform_idx` ON `platform_export_imports` (`platform`);--> statement-breakpoint
CREATE INDEX `pmo_household_idx` ON `property_member_order` (`householdId`);--> statement-breakpoint
CREATE INDEX `pp_property_idx` ON `property_photos` (`propertyId`);--> statement-breakpoint
CREATE INDEX `audit_log_vertical_idx` ON `audit_log` (`verticalId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_log_resource_idx` ON `audit_log` (`resourceType`,`resourceId`);--> statement-breakpoint
CREATE INDEX `ltr_property_idx` ON `ltr_payments` (`propertyId`);--> statement-breakpoint
CREATE INDEX `ltr_household_idx` ON `ltr_payments` (`householdId`);--> statement-breakpoint
CREATE INDEX `ltr_due_date_idx` ON `ltr_payments` (`dueDate`);--> statement-breakpoint
CREATE INDEX `ltr_status_idx` ON `ltr_payments` (`status`);--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `leaseId`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `tenantId`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `method`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `periodStart`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `paidAt`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `externalRef`;--> statement-breakpoint
ALTER TABLE `ltr_payments` DROP COLUMN `memo`;