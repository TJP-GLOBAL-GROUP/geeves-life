ALTER TABLE `property_bookings` ADD `confirmationNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `totalPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `commissionAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `netAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `property_bookings` ADD `currency` varchar(3) DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `property_platforms` ADD `emailNotificationEmailPrev` varchar(320);