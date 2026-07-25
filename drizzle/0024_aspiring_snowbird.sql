CREATE TABLE `member_resources` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`verticalId` varchar(36),
	`title` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`resourceType` enum('link','form','doc','invoice','template') NOT NULL DEFAULT 'link',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`addedByMemberId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vertical_data_policies` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`dataCategory` enum('financial','private','guest_pii','operational') NOT NULL,
	`hiddenFromRoles` json DEFAULT ('[]'),
	`hiddenFromMemberIds` json DEFAULT ('[]'),
	`configuredByMemberId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vertical_data_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `vdp_vertical_category_uniq` UNIQUE(`verticalId`,`dataCategory`)
);
--> statement-breakpoint
CREATE TABLE `vertical_member_access` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`verticalId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`accessLevel` enum('full','read_only','blind','none') NOT NULL DEFAULT 'read_only',
	`calendarAccess` enum('availability_only','default_vertical','blind','read_write') NOT NULL DEFAULT 'default_vertical',
	`allowedCalendarIds` json DEFAULT ('[]'),
	`canRequestMeetings` boolean NOT NULL DEFAULT true,
	`configuredByMemberId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vertical_member_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `vma_member_vertical_uniq` UNIQUE(`memberId`,`verticalId`)
);
--> statement-breakpoint
ALTER TABLE `household_members` ADD `geevesAccess` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `mr_member_idx` ON `member_resources` (`memberId`);--> statement-breakpoint
CREATE INDEX `mr_household_idx` ON `member_resources` (`householdId`);--> statement-breakpoint
CREATE INDEX `mr_vertical_idx` ON `member_resources` (`verticalId`);--> statement-breakpoint
CREATE INDEX `mr_sort_idx` ON `member_resources` (`memberId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `vdp_household_idx` ON `vertical_data_policies` (`householdId`);--> statement-breakpoint
CREATE INDEX `vdp_vertical_idx` ON `vertical_data_policies` (`verticalId`);--> statement-breakpoint
CREATE INDEX `vma_household_idx` ON `vertical_member_access` (`householdId`);--> statement-breakpoint
CREATE INDEX `vma_vertical_idx` ON `vertical_member_access` (`verticalId`);--> statement-breakpoint
CREATE INDEX `vma_member_idx` ON `vertical_member_access` (`memberId`);