CREATE TABLE `shadow_overrides` (
	`id` varchar(36) NOT NULL,
	`eventId` varchar(36) NOT NULL,
	`calendarId` varchar(36) NOT NULL,
	`action` enum('include','exclude') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shadow_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `household_members` ADD `pendingVerticals` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `vertical_visibility` ADD `calendarExclusions` json DEFAULT ('[]');