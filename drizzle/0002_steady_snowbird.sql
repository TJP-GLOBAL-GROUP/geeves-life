CREATE TABLE `platform_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(100) NOT NULL,
	`credentialData` json,
	`isActive` boolean DEFAULT true,
	`lastUsed` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_session_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`listItemId` int,
	`name` varchar(500) NOT NULL,
	`quantity` int DEFAULT 1,
	`unit` varchar(50),
	`assignedPlatform` varchar(100) NOT NULL,
	`originalPlatform` varchar(100),
	`status` enum('queued','searching','found','added_to_cart','substituted','unavailable','transferred','rejected') NOT NULL DEFAULT 'queued',
	`matchedProductName` varchar(500),
	`matchedProductUrl` text,
	`matchedPrice` decimal(10,2),
	`matchConfidence` int,
	`substitutionReason` text,
	`originalProductName` varchar(500),
	`transferReason` text,
	`estimatedDelivery` varchar(255),
	`fulfillmentMethod` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_session_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`listId` int NOT NULL,
	`listName` varchar(255) NOT NULL,
	`status` enum('preparing','shopping','awaiting_review','approved','completed','cancelled') NOT NULL DEFAULT 'preparing',
	`walmartTotal` decimal(12,2) DEFAULT '0',
	`amazonTotal` decimal(12,2) DEFAULT '0',
	`overallTotal` decimal(12,2) DEFAULT '0',
	`deliveryInfo` json,
	`totalItems` int DEFAULT 0,
	`itemsFound` int DEFAULT 0,
	`itemsSubstituted` int DEFAULT 0,
	`itemsUnavailable` int DEFAULT 0,
	`itemsCrossTransferred` int DEFAULT 0,
	`notifications` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_sessions_id` PRIMARY KEY(`id`)
);
