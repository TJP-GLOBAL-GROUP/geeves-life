ALTER TABLE `property_bookings` ADD `dataSource` enum('ical_only','email_only','both') DEFAULT 'ical_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `emailCheckIn` bigint;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `emailCheckOut` bigint;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `pendingCancellationSource` varchar(10);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `pendingCancellationAt` bigint;