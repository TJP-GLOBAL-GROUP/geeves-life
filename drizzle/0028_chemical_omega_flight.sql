CREATE TABLE `member_permission_overrides` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`permission` varchar(100) NOT NULL,
	`granted` boolean NOT NULL,
	`configuredByMemberId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_permission_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `mpo_member_perm_uniq` UNIQUE(`memberId`,`permission`)
);
--> statement-breakpoint
ALTER TABLE `households` ADD `eaCanManageAccess` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `mpo_household_idx` ON `member_permission_overrides` (`householdId`);--> statement-breakpoint
CREATE INDEX `mpo_member_idx` ON `member_permission_overrides` (`memberId`);