CREATE TABLE `move_cards` (
	`user_id` text NOT NULL,
	`fen` text NOT NULL,
	`uci` text NOT NULL,
	`card` text NOT NULL,
	`due` integer NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_review` integer,
	PRIMARY KEY(`user_id`, `fen`, `uci`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `review_log` ADD `uci` text;--> statement-breakpoint
-- Review cards were per repertoire and position; they become per user, position and move.
-- Each card goes to the main move of its position in its repertoire (the alternatives start
-- as new). The same position learnt in several repertoires: the most recently reviewed card.
INSERT INTO `move_cards` (`user_id`, `fen`, `uci`, `card`, `due`, `reps`, `lapses`, `created_at`, `last_review`)
SELECT r.`user_id`, c.`fen`, m.`uci`, c.`card`, c.`due`, c.`reps`, c.`lapses`, c.`created_at`, c.`last_review`
FROM `review_cards` c
JOIN `repertoires` r ON r.`id` = c.`repertoire_id`
JOIN `rep_moves` m ON m.`id` = (
  SELECT m2.`id` FROM `rep_moves` m2
  WHERE m2.`repertoire_id` = c.`repertoire_id` AND m2.`from_fen` = c.`fen`
  ORDER BY m2.`is_main` DESC, m2.`id` LIMIT 1
)
WHERE true
ORDER BY COALESCE(c.`last_review`, 0)
ON CONFLICT (`user_id`, `fen`, `uci`) DO UPDATE SET
  `card` = excluded.`card`,
  `due` = excluded.`due`,
  `reps` = excluded.`reps`,
  `lapses` = excluded.`lapses`,
  `created_at` = MIN(`move_cards`.`created_at`, excluded.`created_at`),
  `last_review` = excluded.`last_review`;
