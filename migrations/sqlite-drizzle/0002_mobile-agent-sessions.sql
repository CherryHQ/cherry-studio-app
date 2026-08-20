CREATE TABLE `mobile_agent_approval` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `mobile_agent_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mobile_agent_approval_turn_id_idx` ON `mobile_agent_approval` (`turn_id`);--> statement-breakpoint
CREATE TABLE `mobile_agent_message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`parts` text DEFAULT '[]' NOT NULL,
	`usage` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `mobile_agent_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mobile_agent_message_session_id_created_at_idx` ON `mobile_agent_message` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mobile_agent_session` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`execution_target_kind` text DEFAULT 'local' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_is_manual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mobile_agent_turn` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `mobile_agent_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mobile_agent_turn_session_id_idx` ON `mobile_agent_turn` (`session_id`);--> statement-breakpoint
CREATE INDEX `mobile_agent_turn_status_idx` ON `mobile_agent_turn` (`status`);