ALTER TABLE `shadow_blocks` ADD `startTime` bigint;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `endTime` bigint;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD `isAllDay` boolean DEFAULT false;