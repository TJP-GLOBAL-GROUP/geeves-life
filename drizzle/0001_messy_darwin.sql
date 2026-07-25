CREATE TABLE `bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`institution` varchar(255) NOT NULL,
	`accountName` varchar(255) NOT NULL,
	`accountType` enum('checking','savings','credit_card','business_checking','business_savings','business_credit') NOT NULL,
	`category` enum('personal','business') NOT NULL DEFAULT 'personal',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`lastFourDigits` varchar(4),
	`currentBalance` decimal(12,2) DEFAULT '0',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` decimal(10,4) NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`relationship` varchar(100) NOT NULL,
	`avatarUrl` text,
	`clothingSizes` json,
	`dietaryRestrictions` json,
	`preferences` json,
	`birthDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(100) NOT NULL,
	`orderNumber` varchar(255),
	`vendor` varchar(255),
	`totalAmount` decimal(12,2),
	`currency` varchar(3) DEFAULT 'USD',
	`status` enum('pending','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'pending',
	`trackingNumber` varchar(255),
	`items` json,
	`importSource` enum('email','manual','whatsapp') NOT NULL DEFAULT 'manual',
	`orderDate` timestamp NOT NULL,
	`deliveryDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`quantity` int DEFAULT 1,
	`unit` varchar(50),
	`category` varchar(100),
	`notes` text,
	`estimatedPrice` decimal(10,2),
	`currency` varchar(3) DEFAULT 'USD',
	`preferredStore` varchar(100),
	`productUrl` text,
	`status` enum('pending','purchased','skipped') NOT NULL DEFAULT 'pending',
	`forFamilyMemberId` int,
	`purchasedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	`isRecurring` boolean DEFAULT false,
	`recurringSchedule` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bankAccountId` int,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`exchangeRate` decimal(10,4),
	`type` enum('expense','income','transfer') NOT NULL DEFAULT 'expense',
	`expenseCategory` varchar(100),
	`classification` enum('personal','business') NOT NULL DEFAULT 'personal',
	`aiConfidence` int,
	`isManualOverride` boolean DEFAULT false,
	`vendor` varchar(255),
	`platform` varchar(100),
	`receiptUrl` text,
	`notes` text,
	`isTaxDeductible` boolean DEFAULT false,
	`taxCategory` varchar(100),
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactName` varchar(255),
	`rawMessage` text NOT NULL,
	`parsedItems` json,
	`shoppingListId` int,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_imports_id` PRIMARY KEY(`id`)
);
