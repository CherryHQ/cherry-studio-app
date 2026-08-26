CREATE TABLE `agent_tool_binding` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`source` text NOT NULL,
	`capability_id` text,
	`mcp_server_id` text,
	`raw_tool_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`approval` text DEFAULT 'ask' NOT NULL,
	`display_name_snapshot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_tool_binding_identity_check" CHECK((
        ("agent_tool_binding"."source" = 'builtin' AND "agent_tool_binding"."capability_id" IS NOT NULL AND length("agent_tool_binding"."capability_id") > 0 AND "agent_tool_binding"."mcp_server_id" IS NULL AND "agent_tool_binding"."raw_tool_name" IS NULL)
        OR
        ("agent_tool_binding"."source" = 'mcp' AND "agent_tool_binding"."capability_id" IS NULL AND "agent_tool_binding"."mcp_server_id" IS NOT NULL AND length("agent_tool_binding"."mcp_server_id") > 0 AND ("agent_tool_binding"."raw_tool_name" IS NULL OR length("agent_tool_binding"."raw_tool_name") > 0))
      )),
	CONSTRAINT "agent_tool_binding_approval_check" CHECK("agent_tool_binding"."approval" IN ('auto', 'ask', 'deny'))
);
--> statement-breakpoint
CREATE INDEX `agent_tool_binding_agent_id_idx` ON `agent_tool_binding` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_binding_mcp_server_id_idx` ON `agent_tool_binding` (`mcp_server_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_binding_builtin_uniq` ON `agent_tool_binding` (`agent_id`,`capability_id`) WHERE "agent_tool_binding"."source" = 'builtin';--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_binding_mcp_server_default_uniq` ON `agent_tool_binding` (`agent_id`,`mcp_server_id`) WHERE "agent_tool_binding"."source" = 'mcp' AND "agent_tool_binding"."raw_tool_name" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_binding_mcp_tool_uniq` ON `agent_tool_binding` (`agent_id`,`mcp_server_id`,`raw_tool_name`) WHERE "agent_tool_binding"."source" = 'mcp' AND "agent_tool_binding"."raw_tool_name" IS NOT NULL;