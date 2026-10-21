ALTER TABLE `agent` ADD `managed_remote_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_managed_remote_id_idx` ON `agent` (`managed_remote_id`);--> statement-breakpoint
ALTER TABLE `agent_global_skill` ADD `managed_remote_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_global_skill_managed_remote_id_idx` ON `agent_global_skill` (`managed_remote_id`);--> statement-breakpoint
ALTER TABLE `mcp_server` ADD `managed_remote_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_server_managed_remote_id_idx` ON `mcp_server` (`managed_remote_id`);