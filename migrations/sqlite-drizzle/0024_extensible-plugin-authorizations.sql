-- Reconciled from Drizzle output: rebuild the referencing MCP table before replacing its parent.
-- PRAGMA foreign_keys cannot be disabled inside the runtime migration transaction.
-- Preserve all grants, server identities, settings and Agent bindings.
CREATE TABLE `__new_plugin_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`auth_method` text NOT NULL,
	`account_label` text NOT NULL,
	`credential` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "plugin_authorization_id_check" CHECK(length(trim("__new_plugin_authorization"."plugin_id")) > 0),
	CONSTRAINT "plugin_authorization_method_check" CHECK(length(trim("__new_plugin_authorization"."auth_method")) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_plugin_authorization`("id", "plugin_id", "auth_method", "account_label", "credential", "created_at", "updated_at") SELECT "id", "plugin_id", "auth_method", "account_label", "credential", "created_at", "updated_at" FROM `plugin_authorization`;--> statement-breakpoint
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
	FOREIGN KEY (`authorization_id`) REFERENCES `__new_plugin_authorization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "mcp_server_origin_check" CHECK(("__new_mcp_server"."origin" = 'remote' and "__new_mcp_server"."base_url" is not null and "__new_mcp_server"."builtin_id" is null and "__new_mcp_server"."authorization_id" is null) or ("__new_mcp_server"."origin" = 'builtin' and "__new_mcp_server"."base_url" is null and "__new_mcp_server"."headers" is null and "__new_mcp_server"."builtin_id" is not null and "__new_mcp_server"."authorization_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_mcp_server`("id", "name", "base_url", "origin", "builtin_id", "authorization_id", "headers", "is_active", "disabled_tools", "created_at", "updated_at") SELECT "id", "name", "base_url", "origin", "builtin_id", "authorization_id", "headers", "is_active", "disabled_tools", "created_at", "updated_at" FROM `mcp_server`;
--> statement-breakpoint
DROP TABLE `mcp_server`;
--> statement-breakpoint
DROP TABLE `plugin_authorization`;--> statement-breakpoint
ALTER TABLE `__new_plugin_authorization` RENAME TO `plugin_authorization`;--> statement-breakpoint
ALTER TABLE `__new_mcp_server` RENAME TO `mcp_server`;
--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_server_builtin_idx` ON `mcp_server` (`builtin_id`);
--> statement-breakpoint
-- Historical formats only. New authorization methods own their JSON object schema in code.
UPDATE `plugin_authorization`
SET `credential` = CASE
  WHEN `plugin_id` = 'github' AND `auth_method` = 'personal_token'
    THEN json_object('version', 1, 'token', `credential`)
  WHEN `plugin_id` = 'amap' AND `auth_method` = 'api_key'
    THEN json_object('version', 1, 'key', `credential`)
  WHEN `plugin_id` = 'feishu' AND `auth_method` = 'feishu_user'
    THEN json_object('legacyReference', `credential`)
  WHEN `plugin_id` = 'feishu' AND `auth_method` = 'app_credentials' AND json_valid(`credential`)
    THEN json_set(`credential`, '$.version', 1)
  WHEN json_valid(`credential`) THEN CASE
    WHEN json_type(`credential`) = 'object' THEN `credential`
    ELSE json_object('legacyValue', `credential`)
  END
  ELSE json_object('legacyValue', `credential`)
END;
