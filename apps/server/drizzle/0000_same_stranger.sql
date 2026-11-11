CREATE TABLE `explorer_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rep_moves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repertoire_id` text NOT NULL,
	`from_fen` text NOT NULL,
	`to_fen` text NOT NULL,
	`uci` text NOT NULL,
	`san` text NOT NULL,
	`comment` text,
	`nags` text,
	`is_main` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rep_moves_unique` ON `rep_moves` (`repertoire_id`,`from_fen`,`uci`);--> statement-breakpoint
CREATE INDEX `rep_moves_repertoire` ON `rep_moves` (`repertoire_id`);--> statement-breakpoint
CREATE TABLE `repertoires` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repertoires_user` ON `repertoires` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`login` text,
	`password_hash` text,
	`lichess_id` text,
	`lichess_username` text,
	`lichess_token` text,
	`lichess_perfs` text,
	`chesscom_username` text,
	`chesscom_ratings` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_lichess_id_unique` ON `users` (`lichess_id`);