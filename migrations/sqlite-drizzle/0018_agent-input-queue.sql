CREATE TABLE `agent_session_input` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parts` text NOT NULL,
	`mode` text NOT NULL,
	`model_id` text,
	`reasoning_effort` text,
	`target_turn_id` text,
	`position` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`reason` text,
	`turn_id` text,
	`user_message_id` text,
	`assistant_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_session_input_mode_check" CHECK("agent_session_input"."mode" IN ('follow-up', 'steer')),
	CONSTRAINT "agent_session_input_position_check" CHECK("agent_session_input"."position" >= 0),
	CONSTRAINT "agent_session_input_status_check" CHECK("agent_session_input"."status" IN ('queued', 'dispatching', 'steering', 'consumed', 'interrupted', 'removed'))
);
--> statement-breakpoint
CREATE INDEX `agent_session_input_queue_idx` ON `agent_session_input` (`session_id`,`status`,`position`);--> statement-breakpoint
ALTER TABLE `agent_session` ADD `input_queue_paused` integer DEFAULT false NOT NULL;