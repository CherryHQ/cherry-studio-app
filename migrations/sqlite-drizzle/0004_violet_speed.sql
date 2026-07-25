CREATE TABLE `mcp_server` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`base_url` text NOT NULL,
	`headers` text,
	`timeout` integer,
	`disabled_tools` text,
	`disabled_auto_approve_tools` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);--> statement-breakpoint
CREATE INDEX `mcp_server_name_idx` ON `mcp_server` (`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_assistant_mcp_server` (
	`assistant_id` text NOT NULL,
	`mcp_server_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`assistant_id`, `mcp_server_id`),
	FOREIGN KEY (`assistant_id`) REFERENCES `assistant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_server`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_assistant_mcp_server`("assistant_id", "mcp_server_id", "created_at", "updated_at") SELECT "assistant_id", "mcp_server_id", "created_at", "updated_at" FROM `assistant_mcp_server` WHERE "mcp_server_id" IN (SELECT "id" FROM `mcp_server`);--> statement-breakpoint
DROP TABLE `assistant_mcp_server`;--> statement-breakpoint
ALTER TABLE `__new_assistant_mcp_server` RENAME TO `assistant_mcp_server`;--> statement-breakpoint
PRAGMA foreign_keys=ON;