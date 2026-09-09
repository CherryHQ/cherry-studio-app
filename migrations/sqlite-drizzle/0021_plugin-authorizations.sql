CREATE TABLE `plugin_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`auth_method` text NOT NULL,
	`account_label` text NOT NULL,
	`credential` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "plugin_authorization_provider_check" CHECK("plugin_authorization"."plugin_id" in ('github', 'amap')),
	CONSTRAINT "plugin_authorization_method_check" CHECK(("plugin_authorization"."plugin_id" = 'github' and "plugin_authorization"."auth_method" = 'personal_token') or ("plugin_authorization"."plugin_id" = 'amap' and "plugin_authorization"."auth_method" = 'api_key'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mcp_server` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text,
	`origin` text DEFAULT 'remote' NOT NULL,
	`builtin_id` text,
	`authorization_id` text,
	`headers` text,
	`is_active` integer DEFAULT false NOT NULL,
	`disabled_tools` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`authorization_id`) REFERENCES `plugin_authorization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "mcp_server_origin_check" CHECK(("__new_mcp_server"."origin" = 'remote' and "__new_mcp_server"."base_url" is not null and "__new_mcp_server"."builtin_id" is null and "__new_mcp_server"."authorization_id" is null) or ("__new_mcp_server"."origin" = 'builtin' and "__new_mcp_server"."base_url" is null and "__new_mcp_server"."headers" is null and "__new_mcp_server"."builtin_id" is not null and "__new_mcp_server"."authorization_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_mcp_server`("id", "name", "base_url", "origin", "builtin_id", "authorization_id", "headers", "is_active", "disabled_tools", "created_at", "updated_at") SELECT "id", "name", "base_url", 'remote', NULL, NULL, "headers", "is_active", "disabled_tools", "created_at", "updated_at" FROM `mcp_server`;--> statement-breakpoint
DROP TABLE `mcp_server`;--> statement-breakpoint
ALTER TABLE `__new_mcp_server` RENAME TO `mcp_server`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_server_builtin_idx` ON `mcp_server` (`builtin_id`);
