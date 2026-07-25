CREATE TABLE `scope_consent_preferences` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`scopeKey` varchar(128) NOT NULL,
	`dismissedAt` bigint NOT NULL,
	CONSTRAINT `scope_consent_preferences_id` PRIMARY KEY(`id`)
);
