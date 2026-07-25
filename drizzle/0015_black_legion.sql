CREATE TABLE `project_knowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`sourceDoc` varchar(256),
	`notes` text,
	`lastReviewedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_knowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `properties` ADD `country` varchar(2);