ALTER TABLE `oauth_tokens` ADD `purposes` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `displayName` varchar(100);