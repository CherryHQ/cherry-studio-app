ALTER TABLE `agent_session_message` ADD `recovery_admissions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_session_message` ADD `recovery_state` text DEFAULT 'eligible' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_session_message` ADD `last_recovery_process_id` text;