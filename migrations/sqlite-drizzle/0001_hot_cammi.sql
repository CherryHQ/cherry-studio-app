PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_desktop_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`device_id` text NOT NULL,
	`desktop_identity` text NOT NULL,
	`configured_endpoints` text DEFAULT '[]' NOT NULL,
	`grants` text NOT NULL,
	`status` text DEFAULT 'paired' NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `desktop_connection`;--> statement-breakpoint
ALTER TABLE `__new_desktop_connection` RENAME TO `desktop_connection`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
