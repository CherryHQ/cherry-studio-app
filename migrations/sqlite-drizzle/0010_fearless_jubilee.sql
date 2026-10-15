ALTER TABLE `agent_session` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `agent_session_deleted_at_idx` ON `agent_session` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `fe_deleted_at_idx` ON `file_entry` (`deleted_at`);