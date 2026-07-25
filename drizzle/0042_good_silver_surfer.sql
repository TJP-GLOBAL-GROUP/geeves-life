ALTER TABLE `household_members` ADD `dob` varchar(10);--> statement-breakpoint
ALTER TABLE `household_members` ADD `phoneNumbers` json;--> statement-breakpoint
ALTER TABLE `household_members` ADD `clothingSizes` json;--> statement-breakpoint
ALTER TABLE `household_members` ADD `dietaryRestrictions` text;--> statement-breakpoint
ALTER TABLE `household_members` ADD `memberPreferences` json;