ALTER TABLE `events` MODIFY COLUMN `source` enum('sync','manual','voice','import','shadow') DEFAULT 'sync';--> statement-breakpoint
ALTER TABLE `calendars` ADD `shadowBlocking` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `shadow_blocks` ADD CONSTRAINT `shadow_blocks_source_target_uniq` UNIQUE(`sourceEventId`,`targetCalendarId`);