CREATE TABLE `painting_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `painting`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pfr_role_check" CHECK("painting_file_ref"."role" IN ('input', 'output'))
);
--> statement-breakpoint
CREATE INDEX `pfr_entry_id_idx` ON `painting_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE INDEX `pfr_source_id_idx` ON `painting_file_ref` (`source_id`);--> statement-breakpoint
CREATE INDEX `pfr_source_role_idx` ON `painting_file_ref` (`source_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `pfr_unique_idx` ON `painting_file_ref` (`file_entry_id`,`source_id`,`role`);--> statement-breakpoint
CREATE TABLE `painting` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`prompt` text NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `painting_order_key_idx` ON `painting` (`order_key`);