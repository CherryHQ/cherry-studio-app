ALTER TABLE `desktop_connection` ADD `configured_endpoints` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `desktop_connection` DROP COLUMN `addresses`;--> statement-breakpoint
ALTER TABLE `desktop_connection` DROP COLUMN `port`;