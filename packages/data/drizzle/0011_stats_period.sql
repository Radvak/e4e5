PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_position_stats` (
	`fen` text NOT NULL,
	`speeds` text NOT NULL,
	`ratings` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`source` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`fen`, `speeds`, `ratings`, `period`)
);
--> statement-breakpoint
INSERT INTO `__new_position_stats`("fen", "speeds", "ratings", "data", "fetched_at", "source", "period") SELECT "fen", "speeds", "ratings", "data", "fetched_at", "source", '' FROM `position_stats`;--> statement-breakpoint
DROP TABLE `position_stats`;--> statement-breakpoint
ALTER TABLE `__new_position_stats` RENAME TO `position_stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;