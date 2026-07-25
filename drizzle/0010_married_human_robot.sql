CREATE TABLE `booking_requests` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`requestorMemberId` varchar(36) NOT NULL,
	`targetVerticalId` varchar(36) NOT NULL,
	`targetCalendarId` varchar(36),
	`title` varchar(500) NOT NULL,
	`description` text,
	`location` varchar(500),
	`startTime` bigint NOT NULL,
	`endTime` bigint NOT NULL,
	`status` enum('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending',
	`createdEventId` varchar(36),
	`responseNote` text,
	`respondedByMemberId` varchar(36),
	`respondedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `booking_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_bookings` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`platformId` varchar(36) NOT NULL,
	`icalUid` varchar(500),
	`bookingType` enum('booking','block','unavailable') NOT NULL DEFAULT 'booking',
	`blockReason` varchar(50),
	`summary` varchar(500),
	`description` text,
	`checkIn` bigint NOT NULL,
	`checkOut` bigint NOT NULL,
	`guestName` varchar(255),
	`guestEmail` varchar(320),
	`guestPhone` varchar(50),
	`revenueAmount` decimal(12,2),
	`revenueCurrency` varchar(3) DEFAULT 'USD',
	`hasConflict` boolean DEFAULT false,
	`conflictWith` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_platforms` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`platform` enum('airbnb','vrbo','booking_com','direct','zillow','apartments_com','other') NOT NULL,
	`displayName` varchar(255),
	`icalUrl` text NOT NULL,
	`lastPolledAt` bigint,
	`lastError` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_platforms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_prep_rules` (
	`id` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`blockDaysBefore` int NOT NULL DEFAULT 0,
	`blockDaysAfter` int NOT NULL DEFAULT 1,
	`blockNationalHolidays` boolean DEFAULT false,
	`blockSundays` boolean DEFAULT false,
	`customBlockDates` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_prep_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `type` enum('primary_residence','rental_str','rental_ltr','vacation','commercial','investment','other') DEFAULT 'rental_str';--> statement-breakpoint
ALTER TABLE `vertical_visibility` MODIFY COLUMN `visibilityLevel` enum('none','busy_only','full') NOT NULL DEFAULT 'busy_only';--> statement-breakpoint
ALTER TABLE `properties` ADD `verticalId` varchar(36);--> statement-breakpoint
ALTER TABLE `properties` ADD `propertyEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `properties` ADD `outboundIcsKey` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `outboundIcsUrl` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `leaseDocUrl` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `leaseDocKey` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `monthlyRent` decimal(12,2);--> statement-breakpoint
ALTER TABLE `properties` ADD `rentCurrency` varchar(3) DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `vertical_visibility` ADD `busyLabel` varchar(50) DEFAULT 'Busy';--> statement-breakpoint
ALTER TABLE `verticals` ADD `privacyLevel` enum('household','admin_only','private') DEFAULT 'household' NOT NULL;