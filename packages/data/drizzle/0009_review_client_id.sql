ALTER TABLE `review_log` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `review_log_client_id` ON `review_log` (`client_id`);