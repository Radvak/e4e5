-- Repertoires get chapters. Each repertoire becomes a chapter (same id, same moves, same
-- training history) of a new repertoire with the same id, name and colour. Written by hand: only
-- renames and added columns, never a table dropped (the app runs its migrations with the foreign
-- keys on, and dropping a table would delete the moves referring to it).
--
-- RENAME TABLE also rewrites the foreign keys of rep_moves and review_log to `chapters`.
ALTER TABLE `repertoires` RENAME TO `chapters`;--> statement-breakpoint
DROP INDEX `repertoires_user`;--> statement-breakpoint
DROP INDEX `repertoires_source`;--> statement-breakpoint
CREATE TABLE `repertoires` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`lichess_study_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `repertoires_user` ON `repertoires` (`user_id`);--> statement-breakpoint
INSERT INTO `repertoires` (`id`, `user_id`, `name`, `color`, `created_at`)
SELECT `id`, `user_id`, `name`, `color`, `created_at` FROM `chapters`;--> statement-breakpoint
-- Nullable for SQLite (a column with a foreign key added to a table must default to null); the
-- app always sets it.
ALTER TABLE `chapters` ADD `repertoire_id` text REFERENCES `repertoires`(`id`) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `chapters` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `start_fen` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `lichess_chapter_id` text;--> statement-breakpoint
UPDATE `chapters` SET `repertoire_id` = `id`;--> statement-breakpoint
ALTER TABLE `chapters` DROP COLUMN `color`;--> statement-breakpoint
CREATE INDEX `chapters_repertoire` ON `chapters` (`repertoire_id`);--> statement-breakpoint
CREATE INDEX `chapters_user` ON `chapters` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_source` ON `chapters` (`user_id`,`source_key`);--> statement-breakpoint
ALTER TABLE `rep_moves` RENAME COLUMN `repertoire_id` TO `chapter_id`;--> statement-breakpoint
DROP INDEX `rep_moves_repertoire`;--> statement-breakpoint
CREATE INDEX `rep_moves_chapter` ON `rep_moves` (`chapter_id`);--> statement-breakpoint
ALTER TABLE `review_log` RENAME COLUMN `repertoire_id` TO `chapter_id`;--> statement-breakpoint
DROP INDEX `review_log_repertoire_time`;--> statement-breakpoint
CREATE INDEX `review_log_chapter_time` ON `review_log` (`chapter_id`,`reviewed_at`);
