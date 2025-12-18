DROP TABLE `knowledges`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`assistant_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`status` text NOT NULL,
	`model_id` text,
	`model` text,
	`type` text,
	`useful` integer,
	`ask_id` text,
	`mentions` text,
	`usage` text,
	`metrics` text,
	`multi_model_message_style` text,
	`fold_selected` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "role", "assistant_id", "topic_id", "status", "model_id", "model", "type", "useful", "ask_id", "mentions", "usage", "metrics", "multi_model_message_style", "fold_selected", "created_at", "updated_at") SELECT "id", "role", "assistant_id", "topic_id", "status", "model_id", "model", "type", "useful", "ask_id", "mentions", "usage", "metrics", "multi_model_message_style", "fold_selected", "created_at", "updated_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_id_unique` ON `messages` (`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_topic_id` ON `messages` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_assistant_id` ON `messages` (`assistant_id`);--> statement-breakpoint
CREATE TABLE `__new_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`assistant_id` text NOT NULL,
	`name` text NOT NULL,
	`isLoading` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_topics`("id", "assistant_id", "name", "isLoading", "created_at", "updated_at") SELECT "id", "assistant_id", "name", "isLoading", "created_at", "updated_at" FROM `topics`;--> statement-breakpoint
DROP TABLE `topics`;--> statement-breakpoint
ALTER TABLE `__new_topics` RENAME TO `topics`;--> statement-breakpoint
CREATE UNIQUE INDEX `topics_id_unique` ON `topics` (`id`);--> statement-breakpoint
CREATE INDEX `idx_topics_assistant_id` ON `topics` (`assistant_id`);--> statement-breakpoint
CREATE INDEX `idx_topics_created_at` ON `topics` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_topics_assistant_id_created_at` ON `topics` (`assistant_id`,`created_at`);