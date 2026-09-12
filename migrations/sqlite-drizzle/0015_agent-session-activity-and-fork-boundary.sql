DROP TRIGGER IF EXISTS `agent_session_message_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_session_message_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_session_message_au`;--> statement-breakpoint
CREATE TABLE `__new_agent_session_message` (
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
	`context_checkpoint` text,
	`activity_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_session_message_role_check" CHECK("role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "agent_session_message_status_check" CHECK("status" IN ('pending', 'streaming', 'success', 'error', 'cancelled', 'interrupted'))
);--> statement-breakpoint
INSERT INTO `__new_agent_session_message` (
	`id`,
	`session_id`,
	`turn_id`,
	`role`,
	`data`,
	`status`,
	`usage`,
	`error`,
	`model_id`,
	`message_snapshot`,
	`searchable_text`,
	`fts_rowid`,
	`created_at`,
	`updated_at`,
	`context_checkpoint`,
	`activity_at`
)
SELECT
	message.`id`,
	message.`session_id`,
	message.`turn_id`,
	message.`role`,
	message.`data`,
	message.`status`,
	message.`usage`,
	message.`error`,
	message.`model_id`,
	message.`message_snapshot`,
	message.`searchable_text`,
	message.`fts_rowid`,
	message.`created_at`,
	message.`updated_at`,
	message.`context_checkpoint`,
	CASE
		WHEN message.`role` = 'assistant'
			AND message.`status` IN ('success', 'error', 'cancelled')
			AND message.`created_at` >= session.`created_at`
		THEN message.`updated_at`
		ELSE message.`created_at`
	END
FROM `agent_session_message` AS message
JOIN `agent_session` AS session ON session.`id` = message.`session_id`;--> statement-breakpoint
DROP TABLE `agent_session_message`;--> statement-breakpoint
ALTER TABLE `__new_agent_session_message` RENAME TO `agent_session_message`;--> statement-breakpoint
CREATE INDEX `agent_session_message_session_created_idx` ON `agent_session_message` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_session_message_turn_id_idx` ON `agent_session_message` (`turn_id`);--> statement-breakpoint
CREATE INDEX `agent_session_message_status_idx` ON `agent_session_message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_active_turn_uniq` ON `agent_session_message` (`session_id`) WHERE "agent_session_message"."role" = 'assistant' and "agent_session_message"."status" in ('pending', 'streaming');--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_fts_rowid_uniq` ON `agent_session_message` (`fts_rowid`);--> statement-breakpoint
-- The boundary names a copied message inside the same Session. The store writes
-- it in the fork transaction and clears it with lineage; no cross-table FK is
-- added because agent_session_message already depends on agent_session.
ALTER TABLE `agent_session` ADD `fork_boundary_message_id` text;
