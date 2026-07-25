CREATE TABLE `email_scrape_jobs` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`emailAddress` varchar(320) NOT NULL,
	`status` enum('pending','running','done','failed') NOT NULL DEFAULT 'pending',
	`startedAt` bigint,
	`completedAt` bigint,
	`emailsScanned` int DEFAULT 0,
	`bookingsEnriched` int DEFAULT 0,
	`bookingsCreated` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_scrape_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_email_tokens` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`emailAddress` varchar(320) NOT NULL,
	`provider` enum('gmail','outlook') NOT NULL DEFAULT 'gmail',
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiry` bigint,
	`scope` varchar(500),
	`lastUsedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_email_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `pet_property_email_uniq` UNIQUE(`propertyId`,`emailAddress`)
);
--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `guestCount` int;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `cleaningFee` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `platformBookingUrl` text;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `rawEmailSubject` varchar(500);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `rawEmailDate` bigint;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `emailScrapeSource` varchar(64);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `scrapeConfidence` int;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `lastEnrichedAt` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `deviceTimezone` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `deviceCity` varchar(128);--> statement-breakpoint
ALTER TABLE `vertical_member_access` ADD `excludeMultiDayEvents` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `esj_property_idx` ON `email_scrape_jobs` (`propertyId`);--> statement-breakpoint
CREATE INDEX `esj_status_idx` ON `email_scrape_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `pet_property_idx` ON `property_email_tokens` (`propertyId`);