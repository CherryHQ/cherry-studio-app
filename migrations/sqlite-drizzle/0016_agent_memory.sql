ALTER TABLE `agent` ADD `bootstrap_completed` integer;--> statement-breakpoint
ALTER TABLE `agent` ADD `shared_memory_enabled` integer DEFAULT true NOT NULL;