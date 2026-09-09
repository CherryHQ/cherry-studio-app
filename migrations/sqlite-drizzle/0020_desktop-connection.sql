-- Development installs may already have this table from the former 0016 or 0019 migration.
CREATE TABLE IF NOT EXISTS `desktop_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_urls` text NOT NULL,
	`active_base_url` text NOT NULL,
	`desktop_version` text NOT NULL,
	`status` text DEFAULT 'paired' NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
