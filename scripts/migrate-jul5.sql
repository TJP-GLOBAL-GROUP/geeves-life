-- Migration: Jul 5, 2026 — Property Financial Overhaul
-- Adds tax fields to property_bookings, creates new tables for photos, ordering, screenshots, and platform imports

-- 1. Add tax & payout fields to property_bookings
ALTER TABLE `property_bookings`
  ADD COLUMN `taxRemittedByPlatform` decimal(12,2) DEFAULT NULL,
  ADD COLUMN `taxOwedByHost` decimal(12,2) DEFAULT NULL,
  ADD COLUMN `taxJurisdiction` varchar(50) DEFAULT NULL,
  ADD COLUMN `passThroughTax` decimal(12,2) DEFAULT NULL,
  ADD COLUMN `payoutDate` bigint DEFAULT NULL,
  ADD COLUMN `payoutBankAccount` varchar(100) DEFAULT NULL,
  ADD COLUMN `financialSource` enum('email_scrape','platform_export','manual','screenshot_ocr','channex_api') DEFAULT NULL;

-- 2. Create property_photos table
CREATE TABLE IF NOT EXISTS `property_photos` (
  `id` varchar(36) NOT NULL,
  `propertyId` varchar(36) NOT NULL,
  `householdId` varchar(36) NOT NULL,
  `url` text NOT NULL,
  `s3Key` text NOT NULL,
  `caption` varchar(255) DEFAULT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pp_property_idx` (`propertyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create property_member_order table
CREATE TABLE IF NOT EXISTS `property_member_order` (
  `memberId` varchar(36) NOT NULL,
  `householdId` varchar(36) NOT NULL,
  `propertyOrder` json NOT NULL DEFAULT ('[]'),
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`memberId`),
  KEY `pmo_household_idx` (`householdId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Add new columns to existing ltr_payments table (it already exists with different schema)
-- The existing table has: id, householdId, propertyId, leaseId, tenantId, amount, type, method, status, periodStart, paidAt, externalRef, memo, notes, createdAt, updatedAt
-- We need to add: tenantName, paymentType, currency, expectedAmount, dueDate, paymentMethod, bankTransactionId, source
ALTER TABLE `ltr_payments`
  ADD COLUMN `tenantName` varchar(255) DEFAULT NULL,
  ADD COLUMN `paymentType` enum('rent','utility_fee','deposit','late_fee','other') DEFAULT NULL,
  ADD COLUMN `currency` varchar(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN `expectedAmount` decimal(12,2) DEFAULT NULL,
  ADD COLUMN `dueDate` bigint DEFAULT NULL,
  ADD COLUMN `paymentMethod` varchar(100) DEFAULT NULL,
  ADD COLUMN `bankTransactionId` int DEFAULT NULL,
  ADD COLUMN `source` enum('manual','stripe_webhook','zillow_import','email_scrape') NOT NULL DEFAULT 'manual';

-- 5. Create booking_screenshots table
CREATE TABLE IF NOT EXISTS `booking_screenshots` (
  `id` varchar(36) NOT NULL,
  `bookingId` varchar(36) NOT NULL,
  `householdId` varchar(36) NOT NULL,
  `s3Url` text NOT NULL,
  `s3Key` text NOT NULL,
  `ocrExtractedData` json DEFAULT NULL,
  `ocrConfidence` int DEFAULT NULL,
  `isConfirmed` tinyint(1) NOT NULL DEFAULT 0,
  `uploadedByMemberId` varchar(36) DEFAULT NULL,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bs_booking_idx` (`bookingId`),
  KEY `bs_household_idx` (`householdId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Create platform_export_imports table
CREATE TABLE IF NOT EXISTS `platform_export_imports` (
  `id` varchar(36) NOT NULL,
  `householdId` varchar(36) NOT NULL,
  `platform` enum('airbnb','vrbo','booking_com') NOT NULL,
  `filename` varchar(255) NOT NULL,
  `s3Url` text NOT NULL,
  `s3Key` text NOT NULL,
  `recordCount` int DEFAULT NULL,
  `matchedCount` int DEFAULT NULL,
  `createdCount` int DEFAULT NULL,
  `importStatus` enum('processing','completed','failed','partial') NOT NULL DEFAULT 'processing',
  `errorMessage` text DEFAULT NULL,
  `uploadedByMemberId` varchar(36) DEFAULT NULL,
  `importedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pei_household_idx` (`householdId`),
  KEY `pei_platform_idx` (`platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
