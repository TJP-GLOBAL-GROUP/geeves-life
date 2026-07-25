CREATE TABLE `audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`actorOpenId` varchar(64),
	`actorEmail` varchar(320),
	`actorName` varchar(255),
	`householdId` varchar(36),
	`action` varchar(128) NOT NULL,
	`category` varchar(64) NOT NULL,
	`resourceType` varchar(64),
	`resourceId` varchar(128),
	`outcome` enum('success','failure','denied') NOT NULL DEFAULT 'success',
	`metadata` json,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `audit_log_household_idx` ON `audit_log` (`householdId`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`createdAt`);