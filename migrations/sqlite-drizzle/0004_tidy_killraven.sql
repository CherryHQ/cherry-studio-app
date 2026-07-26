CREATE TABLE `mcp_server` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`description` text,
	`base_url` text,
	`command` text,
	`registry_url` text,
	`args` text,
	`env` text,
	`headers` text,
	`provider` text,
	`provider_url` text,
	`logo_url` text,
	`tags` text,
	`long_running` integer,
	`timeout` integer,
	`dxt_version` text,
	`dxt_path` text,
	`reference` text,
	`search_key` text,
	`config_sample` text,
	`disabled_tools` text,
	`disabled_auto_approve_tools` text,
	`should_config` integer,
	`sort_order` integer DEFAULT 0,
	`is_active` integer DEFAULT false NOT NULL,
	`install_source` text,
	`is_trusted` integer,
	`trusted_at` integer,
	`installed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "mcp_server_type_check" CHECK("mcp_server"."type" IS NULL OR "mcp_server"."type" IN ('stdio', 'sse', 'streamableHttp', 'inMemory')),
	CONSTRAINT "mcp_server_install_source_check" CHECK("mcp_server"."install_source" IS NULL OR "mcp_server"."install_source" IN ('builtin', 'manual', 'protocol', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `mcp_server_name_idx` ON `mcp_server` (`name`);--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);--> statement-breakpoint
CREATE INDEX `mcp_server_sort_order_idx` ON `mcp_server` (`sort_order`);--> statement-breakpoint
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
ALTER TABLE `__new_assistant_mcp_server` RENAME TO `assistant_mcp_server`;
