ALTER TABLE `agent_session_message` ADD `replay` text;
--> statement-breakpoint
ALTER TABLE `agent_session` ADD `runtime_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP INDEX `agent_session_message_active_turn_uniq`;
