CREATE TABLE `review_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repertoire_id` text NOT NULL,
	`fen` text NOT NULL,
	`grade` text NOT NULL,
	`is_new` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_log_repertoire_time` ON `review_log` (`repertoire_id`,`reviewed_at`);