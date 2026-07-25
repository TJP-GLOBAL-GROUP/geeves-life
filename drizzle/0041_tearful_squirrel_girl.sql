CREATE TABLE `custom_roles` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(500),
	`baseRole` varchar(50) NOT NULL DEFAULT 'member',
	`permissions` json DEFAULT ('[]'),
	`deniedPermissions` json DEFAULT ('[]'),
	`allowedWidgets` json DEFAULT ('null'),
	`allowedVerticalIds` json DEFAULT ('null'),
	`color` varchar(20) DEFAULT '#6B7280',
	`icon` varchar(50) DEFAULT 'User',
	`createdByMemberId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `widget_layouts` (
	`memberId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`layout` json NOT NULL DEFAULT ('[]'),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `widget_layouts_memberId` PRIMARY KEY(`memberId`)
);
--> statement-breakpoint
ALTER TABLE `household_members` ADD `photoUrl` text;--> statement-breakpoint
ALTER TABLE `household_members` ADD `customRoleId` varchar(36);--> statement-breakpoint
ALTER TABLE `verticals` ADD `ownerMemberId` varchar(36);--> statement-breakpoint
CREATE INDEX `cr_household_idx` ON `custom_roles` (`householdId`);--> statement-breakpoint
CREATE INDEX `wl_household_idx` ON `widget_layouts` (`householdId`);