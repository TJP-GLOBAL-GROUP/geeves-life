CREATE TABLE `project_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phase` varchar(32) NOT NULL DEFAULT '1',
	`area` varchar(64) NOT NULL,
	`bucket` varchar(128),
	`title` varchar(512) NOT NULL,
	`titleHash` varchar(64) NOT NULL,
	`status` enum('todo','in_progress','done','deferred','blocked') NOT NULL DEFAULT 'todo',
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`notes` text,
	`deferredReason` varchar(512),
	`sourceDoc` varchar(256),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_tasks_title_hash_idx` UNIQUE(`titleHash`)
);
--> statement-breakpoint
CREATE INDEX `project_tasks_status_idx` ON `project_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `project_tasks_area_idx` ON `project_tasks` (`area`);--> statement-breakpoint
CREATE INDEX `project_tasks_phase_idx` ON `project_tasks` (`phase`);