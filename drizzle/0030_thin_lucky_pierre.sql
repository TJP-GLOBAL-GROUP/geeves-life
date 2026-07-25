ALTER TABLE `property_bookings` ADD `bookingStatus` enum('confirmed','cancelled') DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `cancelledAt` bigint;--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `cancellationSource` varchar(64);