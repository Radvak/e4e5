ALTER TABLE `repertoires` ADD `source_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `repertoires_source` ON `repertoires` (`user_id`,`source_key`);