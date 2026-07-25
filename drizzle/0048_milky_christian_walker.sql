CREATE TABLE `invoice_extractions` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`vendorOrderId` varchar(21),
	`walmartOrderId` varchar(36),
	`vendorName` varchar(200),
	`orderDate_ie` varchar(30),
	`orderTotal_ie` decimal(12,2),
	`taxTotal_ie` decimal(12,2),
	`paymentMethodType` varchar(50),
	`paymentMethodLast4` varchar(4),
	`paymentAccountId_ie` int,
	`lineItems_ie` json,
	`s3Url_ie` text,
	`s3Key_ie` varchar(500),
	`extractionStatus_ie` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`extractionError_ie` text,
	`triggerSource_ie` enum('chrome_extension','manual_upload','email_attachment') NOT NULL DEFAULT 'chrome_extension',
	`createdAt_ie` bigint NOT NULL,
	`updatedAt_ie` bigint NOT NULL,
	CONSTRAINT `invoice_extractions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(21) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`recipientMemberId` varchar(36) NOT NULL,
	`recipientUserId` int,
	`type` enum('member_joined','member_left','member_removed','booking_new','booking_cancelled','booking_modified','booking_request_new','booking_request_approved','booking_request_declined','token_expired','sync_failed','expense_pending_review','expense_approved','expense_rejected','bug_report_update','account_deletion_warning','system_announcement') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`actionUrl` varchar(500),
	`actionLabel` varchar(50),
	`relatedEntityType` varchar(50),
	`relatedEntityId` varchar(36),
	`deliveredViaEmail` boolean NOT NULL DEFAULT false,
	`deliveredViaPush` boolean NOT NULL DEFAULT false,
	`deliveredInApp` boolean NOT NULL DEFAULT true,
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` bigint,
	`isDismissed` boolean NOT NULL DEFAULT false,
	`dismissedAt` bigint,
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`metadata` text,
	`createdAt_notif` bigint NOT NULL,
	`expiresAt_notif` bigint,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_log` MODIFY COLUMN `actorType` enum('user','system','geeves_ai','scheduled_job','system_extension') DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `vendor_orders` MODIFY COLUMN `legacyWalmartOrderId` varchar(36);--> statement-breakpoint
ALTER TABLE `expenses` ADD `splitGroupId` varchar(21);--> statement-breakpoint
ALTER TABLE `expenses` ADD `splitAmount` decimal(14,2);--> statement-breakpoint
ALTER TABLE `expenses` ADD `splitSequence` int;--> statement-breakpoint
CREATE INDEX `ie_household_idx` ON `invoice_extractions` (`householdId`);--> statement-breakpoint
CREATE INDEX `ie_vendor_order_idx` ON `invoice_extractions` (`vendorOrderId`);--> statement-breakpoint
CREATE INDEX `ie_walmart_order_idx` ON `invoice_extractions` (`walmartOrderId`);--> statement-breakpoint
CREATE INDEX `ie_status_idx` ON `invoice_extractions` (`extractionStatus_ie`);--> statement-breakpoint
CREATE INDEX `ie_payment_last4_idx` ON `invoice_extractions` (`paymentMethodLast4`);--> statement-breakpoint
CREATE INDEX `notif_recipient_idx` ON `notifications` (`recipientMemberId`);--> statement-breakpoint
CREATE INDEX `notif_recipient_user_idx` ON `notifications` (`recipientUserId`);--> statement-breakpoint
CREATE INDEX `notif_household_idx` ON `notifications` (`householdId`);--> statement-breakpoint
CREATE INDEX `notif_type_idx` ON `notifications` (`type`);--> statement-breakpoint
CREATE INDEX `notif_unread_idx` ON `notifications` (`recipientMemberId`,`isRead`);--> statement-breakpoint
CREATE INDEX `notif_created_idx` ON `notifications` (`createdAt_notif`);--> statement-breakpoint
CREATE INDEX `exp_split_group_idx` ON `expenses` (`splitGroupId`);