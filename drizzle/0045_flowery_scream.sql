CREATE TABLE `ltr_deposit_ledger` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`leaseId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`type` enum('received','applied_to_damages','returned','forfeited') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`balanceAfter` decimal(12,2) NOT NULL,
	`description` text,
	`entryDate` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltr_deposit_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ltr_lease_tenants` (
	`id` varchar(36) NOT NULL,
	`leaseId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`isPrimary` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltr_lease_tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ltr_leases` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`startDate` bigint NOT NULL,
	`endDate` bigint NOT NULL,
	`monthlyRent` decimal(12,2) NOT NULL,
	`utilityFee` decimal(12,2) DEFAULT '0.00',
	`totalMonthly` decimal(12,2) NOT NULL,
	`securityDeposit` decimal(12,2) DEFAULT '0.00',
	`petDeposit` decimal(12,2) DEFAULT '0.00',
	`securityDepositPaid` boolean DEFAULT false,
	`securityDepositReturned` boolean DEFAULT false,
	`securityDepositForfeited` decimal(12,2) DEFAULT '0.00',
	`lateFee` decimal(12,2) DEFAULT '0.00',
	`rentDueDay` int DEFAULT 1,
	`gracePeriodDays` int DEFAULT 3,
	`leaseDocUrl` text,
	`leaseDocKey` text,
	`status` enum('active','expired','terminated','evicted') NOT NULL DEFAULT 'active',
	`terminationReason` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ltr_leases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ltr_payments` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`leaseId` varchar(36) NOT NULL,
	`tenantId` varchar(36) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`type` enum('rent','partial_rent','utility_fee','security_deposit','pet_deposit','late_fee','damage_repair','other') NOT NULL,
	`method` enum('cash_app','venmo','zelle','check','bank_transfer','cash','other'),
	`status` enum('completed','pending','failed','expired','refunded') NOT NULL DEFAULT 'completed',
	`periodStart` bigint,
	`paidAt` bigint NOT NULL,
	`externalRef` varchar(255),
	`memo` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ltr_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ltr_tenants` (
	`id` varchar(36) NOT NULL,
	`householdId` varchar(36) NOT NULL,
	`propertyId` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`paymentHandle` varchar(100),
	`paymentMethod` enum('cash_app','venmo','zelle','check','bank_transfer','cash','other'),
	`status` enum('active','past','evicted','applicant') NOT NULL DEFAULT 'active',
	`moveInDate` bigint,
	`moveOutDate` bigint,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ltr_tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ltr_dep_lease_idx` ON `ltr_deposit_ledger` (`leaseId`);--> statement-breakpoint
CREATE INDEX `ltr_dep_tenant_idx` ON `ltr_deposit_ledger` (`tenantId`);--> statement-breakpoint
CREATE INDEX `ltr_lt_lease_idx` ON `ltr_lease_tenants` (`leaseId`);--> statement-breakpoint
CREATE INDEX `ltr_lt_tenant_idx` ON `ltr_lease_tenants` (`tenantId`);--> statement-breakpoint
CREATE INDEX `ltr_lease_property_idx` ON `ltr_leases` (`propertyId`);--> statement-breakpoint
CREATE INDEX `ltr_lease_status_idx` ON `ltr_leases` (`status`);--> statement-breakpoint
CREATE INDEX `ltr_lease_date_idx` ON `ltr_leases` (`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `ltr_pay_property_idx` ON `ltr_payments` (`propertyId`);--> statement-breakpoint
CREATE INDEX `ltr_pay_lease_idx` ON `ltr_payments` (`leaseId`);--> statement-breakpoint
CREATE INDEX `ltr_pay_tenant_idx` ON `ltr_payments` (`tenantId`);--> statement-breakpoint
CREATE INDEX `ltr_pay_period_idx` ON `ltr_payments` (`periodStart`);--> statement-breakpoint
CREATE INDEX `ltr_pay_type_idx` ON `ltr_payments` (`type`);--> statement-breakpoint
CREATE INDEX `ltr_tenant_property_idx` ON `ltr_tenants` (`propertyId`);--> statement-breakpoint
CREATE INDEX `ltr_tenant_status_idx` ON `ltr_tenants` (`status`);