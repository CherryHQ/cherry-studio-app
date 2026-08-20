DROP TABLE `chat_message_file_ref`;--> statement-breakpoint
DROP TABLE `painting_file_ref`;--> statement-breakpoint
DROP TABLE `file_entry`;--> statement-breakpoint
CREATE TABLE `file_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `fe_created_at_idx` ON `file_entry` (`created_at`);--> statement-breakpoint
ALTER TABLE `painting` ADD `files` text DEFAULT '{"input":[],"output":[]}' NOT NULL;
