CREATE TABLE `vertical_integrations` (
	`id` varchar(36) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`integrationType` enum('calendar','email','task','security','other') NOT NULL,
	`provider` varchar(100) NOT NULL,
	`accountEmail` varchar(320),
	`displayName` varchar(255),
	`calendarId` varchar(36),
	`status` enum('active','pending','error','disconnected') NOT NULL DEFAULT 'active',
	`metadata` json,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vertical_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vertical_owners` (
	`id` varchar(36) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'owner',
	`addedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vertical_owners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vertical_visibility` (
	`id` varchar(36) NOT NULL,
	`fromVerticalId` varchar(36) NOT NULL,
	`toVerticalId` varchar(36) NOT NULL,
	`visibilityLevel` enum('none','busy_only','full') NOT NULL DEFAULT 'none',
	`configuredByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vertical_visibility_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `household_members` MODIFY COLUMN `role` enum('household_admin','ea','member','caregiver','child','elder') NOT NULL DEFAULT 'member';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','system_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `calendars` ADD `accountEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `household_members` ADD `pronouns` varchar(100);--> statement-breakpoint
ALTER TABLE `household_members` ADD `genderIdentity` varchar(100);--> statement-breakpoint
ALTER TABLE `household_members` ADD `relationshipLabel` varchar(100);--> statement-breakpoint
ALTER TABLE `household_members` ADD `isBillingContact` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `households` ADD `createdByUserId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `ownerUserId`;