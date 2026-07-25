ALTER TABLE `property_platforms` ADD `notificationEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `property_platforms` ADD `emailScrapingEnabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `property_platforms` ADD `lastEmailScrapedAt` bigint;