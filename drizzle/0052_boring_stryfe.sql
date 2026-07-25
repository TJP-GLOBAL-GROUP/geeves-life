CREATE TABLE `ics_regeneration_queue` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`processedAt` bigint,
	CONSTRAINT `ics_regeneration_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ics_rq_property_idx` ON `ics_regeneration_queue` (`propertyId`);--> statement-breakpoint
CREATE INDEX `ics_rq_processed_idx` ON `ics_regeneration_queue` (`processedAt`);