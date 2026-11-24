CREATE TABLE `game_syncs` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`account` text NOT NULL,
	`last_game_at` integer,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`played_at` integer NOT NULL,
	`color` text NOT NULL,
	`result` text NOT NULL,
	`speed` text NOT NULL,
	`rated` integer NOT NULL,
	`opponent` text NOT NULL,
	`opponent_rating` integer,
	`my_rating` integer,
	`moves` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `games_user_time` ON `games` (`user_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `inbox_dismissed` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
