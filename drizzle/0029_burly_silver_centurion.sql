CREATE TABLE `beta_signups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`householdType` varchar(100),
	`householdSize` varchar(50),
	`primaryUseCase` varchar(255),
	`referralSource` varchar(255),
	`additionalNotes` text,
	`icpScore` int,
	`status` enum('pending','approved','waitlisted','rejected') NOT NULL DEFAULT 'pending',
	`adminNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `beta_signups_id` PRIMARY KEY(`id`),
	CONSTRAINT `beta_signups_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `bs_email_idx` ON `beta_signups` (`email`);--> statement-breakpoint
CREATE INDEX `bs_status_idx` ON `beta_signups` (`status`);--> statement-breakpoint
CREATE INDEX `bs_created_at_idx` ON `beta_signups` (`createdAt`);--> statement-breakpoint
CREATE INDEX `cm_email_idx` ON `contact_messages` (`email`);--> statement-breakpoint
CREATE INDEX `cm_is_read_idx` ON `contact_messages` (`isRead`);--> statement-breakpoint
CREATE INDEX `cm_created_at_idx` ON `contact_messages` (`createdAt`);