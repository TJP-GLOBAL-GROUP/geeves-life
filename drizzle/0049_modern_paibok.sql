CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`label` varchar(255) NOT NULL,
	`description` text,
	`cooldownHours` int NOT NULL DEFAULT 6,
	`enabled` boolean NOT NULL DEFAULT true,
	`householdId` varchar(36) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_settings_key_unique` UNIQUE(`key`),
	CONSTRAINT `ns_key_household_idx` UNIQUE(`key`,`householdId`)
);
