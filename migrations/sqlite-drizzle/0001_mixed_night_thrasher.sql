DROP INDEX `message_trace_id_idx`;--> statement-breakpoint
ALTER TABLE `message` DROP COLUMN `trace_id`;--> statement-breakpoint
ALTER TABLE `topic` ADD `trace_id` text;