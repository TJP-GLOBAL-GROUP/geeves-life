CREATE TABLE `propagation_queue` (
	`id` varchar(36) NOT NULL,
	`eventId` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`reason` enum('rate_limit','circuit_breaker','lock_conflict','google_error','network_error') NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`nextRetryAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	`resolvedAt` bigint,
	`status` enum('pending','resolved','failed') NOT NULL DEFAULT 'pending',
	CONSTRAINT `propagation_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `webhook_channels` ADD `notificationUrl` varchar(512);--> statement-breakpoint
CREATE INDEX `pq_next_retry_idx` ON `propagation_queue` (`status`,`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `pq_event_idx` ON `propagation_queue` (`eventId`);