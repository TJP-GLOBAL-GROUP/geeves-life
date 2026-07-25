CREATE TABLE `booking_overrides` (
	`id` varchar(36) NOT NULL,
	`bookingId` varchar(36) NOT NULL,
	`guestName` varchar(255),
	`guestEmail` varchar(320),
	`notes` text,
	`createdBy` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `booking_overrides_id` PRIMARY KEY(`id`)
);
