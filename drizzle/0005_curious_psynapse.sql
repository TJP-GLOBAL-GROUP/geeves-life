CREATE TABLE `product_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`itemName` varchar(500) NOT NULL,
	`normalizedName` varchar(500) NOT NULL,
	`platform` varchar(100) NOT NULL,
	`productId` varchar(255) NOT NULL,
	`productName` varchar(500) NOT NULL,
	`productUrl` text,
	`lastPrice` decimal(10,2),
	`useCount` int DEFAULT 1,
	`confidence` int DEFAULT 80,
	`isVerified` boolean DEFAULT false,
	`lastAvailable` timestamp,
	`lastUsed` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_mappings_id` PRIMARY KEY(`id`)
);
