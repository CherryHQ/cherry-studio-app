CREATE TABLE `painting_board` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`focus_painting_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Every painting from before boards existed becomes the only node of its own
-- board. Reusing the painting id keeps the mapping deterministic.
INSERT INTO `painting_board` (`id`, `title`, `focus_painting_id`, `created_at`, `updated_at`)
SELECT `id`, trim(substr(trim(`prompt`), 1, 40)), `id`, `created_at`, `updated_at` FROM `painting`;
--> statement-breakpoint
CREATE TABLE `__new_painting` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`prompt` text NOT NULL,
	`brief` text,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`files` text DEFAULT '{"input":[],"output":[]}' NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `painting_board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_painting` (`id`, `board_id`, `provider_id`, `model_id`, `prompt`, `brief`, `order_key`, `created_at`, `updated_at`, `files`)
SELECT `id`, `id`, `provider_id`, `model_id`, `prompt`, NULL, `order_key`, `created_at`, `updated_at`, `files` FROM `painting`;
--> statement-breakpoint
DROP TABLE `painting`;
--> statement-breakpoint
ALTER TABLE `__new_painting` RENAME TO `painting`;
--> statement-breakpoint
CREATE INDEX `painting_order_key_idx` ON `painting` (`order_key`);
--> statement-breakpoint
CREATE INDEX `painting_board_id_idx` ON `painting` (`board_id`);
