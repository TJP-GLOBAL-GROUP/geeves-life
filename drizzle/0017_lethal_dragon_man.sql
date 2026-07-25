CREATE INDEX `pb_propertyId_checkIn_idx` ON `property_bookings` (`propertyId`,`checkIn`);--> statement-breakpoint
CREATE INDEX `pb_platformId_idx` ON `property_bookings` (`platformId`);--> statement-breakpoint
CREATE INDEX `pb_icalUid_idx` ON `property_bookings` (`icalUid`);