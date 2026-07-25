ALTER TABLE `events` ADD `isShadowBlock` boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX `events_household_time_idx` ON `events` (`householdId`,`startTime`,`endTime`);--> statement-breakpoint
CREATE INDEX `events_calendar_start_idx` ON `events` (`calendarId`,`startTime`);--> statement-breakpoint
CREATE INDEX `sb_household_time_idx` ON `shadow_blocks` (`householdId`,`startTime`,`endTime`);