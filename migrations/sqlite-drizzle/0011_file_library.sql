CREATE TABLE `file_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`trashed_with` text,
	FOREIGN KEY (`parent_id`) REFERENCES `file_folder`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `file_folder_parent_idx` ON `file_folder` (`parent_id`);--> statement-breakpoint
CREATE INDEX `file_folder_trash_idx` ON `file_folder` (`trashed_with`);--> statement-breakpoint
CREATE TABLE `library_file` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`current_entry_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`trashed_with` text,
	FOREIGN KEY (`folder_id`) REFERENCES `file_folder`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `library_file_folder_idx` ON `library_file` (`folder_id`);--> statement-breakpoint
CREATE INDEX `library_file_trash_idx` ON `library_file` (`trashed_with`);--> statement-breakpoint
ALTER TABLE `file_entry` ADD `library_file_id` text REFERENCES library_file(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `file_entry` ADD `trashed_with` text;--> statement-breakpoint
CREATE INDEX `fe_library_file_idx` ON `file_entry` (`library_file_id`);--> statement-breakpoint
ALTER TABLE `agent_session` ADD `workspace_folder_id` text REFERENCES file_folder(id) ON DELETE SET NULL;
--> statement-breakpoint
INSERT INTO library_file (id, folder_id, name, name_key, current_entry_id, created_at, updated_at, deleted_at)
SELECT id, NULL, filename, lower(filename), id, created_at, updated_at, deleted_at FROM file_entry;
--> statement-breakpoint
UPDATE file_entry SET library_file_id = id, trashed_with = CASE WHEN deleted_at IS NOT NULL THEN id ELSE NULL END;
