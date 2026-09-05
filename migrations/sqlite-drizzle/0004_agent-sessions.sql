CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`avatar` text,
	`model_id` text,
	`settings` text NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_created_at_idx` ON `agent` (`created_at`);--> statement-breakpoint
CREATE INDEX `agent_order_key_idx` ON `agent` (`order_key`);--> statement-breakpoint
CREATE TABLE `agent_session` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_is_manual` integer DEFAULT false NOT NULL,
	`execution_target` text DEFAULT '{"kind":"local"}' NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `agent_session_agent_id_idx` ON `agent_session` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_session_last_activity_at_idx` ON `agent_session` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `agent_session_message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text,
	`role` text NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`usage` text,
	`error` text,
	`model_id` text,
	`message_snapshot` text,
	`searchable_text` text DEFAULT '' NOT NULL,
	`fts_rowid` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_session_message_role_check" CHECK("agent_session_message"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "agent_session_message_status_check" CHECK("agent_session_message"."status" IN ('pending', 'streaming', 'success', 'error', 'cancelled', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX `agent_session_message_session_created_idx` ON `agent_session_message` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_session_message_turn_id_idx` ON `agent_session_message` (`turn_id`);--> statement-breakpoint
CREATE INDEX `agent_session_message_status_idx` ON `agent_session_message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_active_turn_uniq` ON `agent_session_message` (`session_id`) WHERE "agent_session_message"."role" = 'assistant' and "agent_session_message"."status" in ('pending', 'streaming');--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_fts_rowid_uniq` ON `agent_session_message` (`fts_rowid`);