CREATE TABLE `calendars` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`verticalId` varchar(36),
	`provider` enum('google_workspace','google_personal','ical','manual') NOT NULL,
	`externalId` varchar(500),
	`name` varchar(255) NOT NULL,
	`color` varchar(20),
	`syncType` enum('push','poll','manual') NOT NULL DEFAULT 'push',
	`pollIntervalMinutes` int DEFAULT 15,
	`syncToken` text,
	`lastSyncAt` timestamp,
	`syncStatus` enum('active','error','paused') DEFAULT 'active',
	`syncError` text,
	`accessLevel` enum('read_write','read_only','free_busy') NOT NULL DEFAULT 'read_write',
	`isPrimary` boolean DEFAULT false,
	`isVisible` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyId` varchar(36),
	`name` varchar(255) NOT NULL,
	`type` enum('lock','camera','thermostat','hvac_puck','light','sensor','other') NOT NULL,
	`provider` enum('seam','flair','manual') DEFAULT 'seam',
	`externalId` varchar(255),
	`location` varchar(255),
	`currentState` json,
	`status` enum('online','offline','error','setup') DEFAULT 'setup',
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`calendarId` varchar(36) NOT NULL,
	`externalId` varchar(500),
	`title` varchar(500) NOT NULL,
	`description` text,
	`location` varchar(500),
	`startTime` bigint NOT NULL,
	`endTime` bigint NOT NULL,
	`isAllDay` boolean DEFAULT false,
	`recurrenceRule` text,
	`recurringEventId` varchar(36),
	`status` enum('confirmed','tentative','cancelled') NOT NULL DEFAULT 'confirmed',
	`visibility` enum('default','public','private','confidential') DEFAULT 'default',
	`attendees` json,
	`reminders` json,
	`createdBy` varchar(36),
	`lastModifiedBy` varchar(36),
	`source` enum('sync','manual','voice','import') DEFAULT 'sync',
	`version` int DEFAULT 1,
	`etag` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`userId` int,
	`displayName` varchar(255) NOT NULL,
	`email` varchar(320),
	`avatarUrl` text,
	`role` enum('owner','admin','ea','member','caregiver','child','elder') NOT NULL DEFAULT 'member',
	`accessibilityMode` enum('standard','picture_board','large_text','voice_only') DEFAULT 'standard',
	`status` enum('invited','active','inactive','removed') NOT NULL DEFAULT 'invited',
	`invitedAt` timestamp,
	`joinedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `household_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerUserId` int NOT NULL,
	`wakeWord` varchar(100) DEFAULT 'Geeves',
	`timezone` varchar(100) NOT NULL DEFAULT 'America/New_York',
	`settings` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `households_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`verticalId` varchar(36),
	`eventId` varchar(36),
	`content` text NOT NULL,
	`source` enum('voice','text','tablet','phone') NOT NULL DEFAULT 'text',
	`reminderAt` bigint,
	`isCompleted` boolean DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`memberId` varchar(36) NOT NULL,
	`provider` varchar(50) NOT NULL,
	`accountEmail` varchar(320) NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`expiresAt` bigint,
	`scopes` text,
	`status` enum('active','expired','revoked') DEFAULT 'active',
	`lastRefreshedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`type` enum('primary_residence','rental_airbnb','rental_vrbo','rental_booking','rental_multi','commercial','other') DEFAULT 'rental_airbnb',
	`icalUrl` text,
	`calendarId` varchar(36),
	`settings` json,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadow_blocks` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`sourceEventId` varchar(36) NOT NULL,
	`sourceCalendarId` varchar(36) NOT NULL,
	`targetCalendarId` varchar(36) NOT NULL,
	`maskedTitle` varchar(500) DEFAULT 'Busy',
	`isDismissed` boolean DEFAULT false,
	`dismissedAt` timestamp,
	`externalEventId` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shadow_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`plan` enum('free','premium') NOT NULL DEFAULT 'free',
	`seatsIncluded` int DEFAULT 5,
	`seatsUsed` int DEFAULT 1,
	`additionalSeats` int DEFAULT 0,
	`addOns` json,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`status` enum('active','past_due','cancelled','trialing') NOT NULL DEFAULT 'trialing',
	`currentPeriodStart` bigint,
	`currentPeriodEnd` bigint,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`calendarId` varchar(36) NOT NULL,
	`action` enum('full_sync','incremental_sync','webhook_received','event_created','event_updated','event_deleted','shadow_created','shadow_dismissed','conflict_resolved','error') NOT NULL,
	`details` json,
	`eventsAffected` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verticals` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`icon` varchar(100),
	`color` varchar(20),
	`description` text,
	`isActive` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verticals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_channels` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`calendarId` varchar(36) NOT NULL,
	`resourceId` varchar(255),
	`resourceUri` text,
	`expiresAt` bigint NOT NULL,
	`token` varchar(255),
	`status` enum('active','expired','stopped') DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `householdId` varchar(36);--> statement-breakpoint
ALTER TABLE `users` ADD `memberId` varchar(36);