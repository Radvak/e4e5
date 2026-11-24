CREATE TABLE `review_cards` (
	`repertoire_id` text NOT NULL,
	`fen` text NOT NULL,
	`card` text NOT NULL,
	`due` integer NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_review` integer,
	PRIMARY KEY(`repertoire_id`, `fen`),
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_cards_due` ON `review_cards` (`repertoire_id`,`due`);