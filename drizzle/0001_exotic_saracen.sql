CREATE TABLE `economic_data_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshotId` int NOT NULL,
	`countryCode` varchar(2) NOT NULL,
	`countryIso3` varchar(3) NOT NULL,
	`countryName` varchar(120) NOT NULL,
	`indicatorKey` varchar(64) NOT NULL,
	`indicatorLabel` varchar(160) NOT NULL,
	`indicatorSourceName` varchar(255) NOT NULL,
	`unit` varchar(80) NOT NULL,
	`valueFormat` varchar(32) NOT NULL,
	`worldBankCode` varchar(64) NOT NULL,
	`year` int NOT NULL,
	`value` double,
	`source` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `economic_data_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `economic_points_unique_idx` UNIQUE(`snapshotId`,`countryCode`,`indicatorKey`,`year`)
);
--> statement-breakpoint
CREATE TABLE `economic_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(255) NOT NULL,
	`sourceHash` varchar(80) NOT NULL,
	`recordCount` int NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `economic_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `economic_snapshots_source_hash_idx` UNIQUE(`sourceHash`)
);
--> statement-breakpoint
CREATE TABLE `insight_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorKey` varchar(64) NOT NULL,
	`countryCodes` varchar(120) NOT NULL,
	`yearStart` int NOT NULL,
	`yearEnd` int NOT NULL,
	`prompt` text NOT NULL,
	`response` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `insight_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `world_bank_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(255) NOT NULL,
	`countryCode` varchar(8) NOT NULL,
	`indicatorKey` varchar(64) NOT NULL,
	`yearStart` int NOT NULL,
	`yearEnd` int NOT NULL,
	`payload` text NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `world_bank_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `world_bank_cache_key_idx` UNIQUE(`cacheKey`)
);
--> statement-breakpoint
CREATE INDEX `economic_points_lookup_idx` ON `economic_data_points` (`countryCode`,`indicatorKey`,`year`);--> statement-breakpoint
CREATE INDEX `insight_lookup_idx` ON `insight_requests` (`indicatorKey`,`yearStart`,`yearEnd`);