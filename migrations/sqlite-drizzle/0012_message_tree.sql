ALTER TABLE `agent_session` ADD `active_node_id` text;--> statement-breakpoint
ALTER TABLE `agent_session_message` ADD `parent_id` text REFERENCES agent_session_message(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `agent_session_message` ADD `siblings_group_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `agent_session_message_parent_id_idx` ON `agent_session_message` (`parent_id`,`session_id`);--> statement-breakpoint
UPDATE `agent_session_message` SET `parent_id` = `ordered`.`previous_id`
FROM (
	SELECT `id`, LAG(`id`) OVER (PARTITION BY `session_id` ORDER BY `created_at`, `id`) AS `previous_id`
	FROM `agent_session_message`
) AS `ordered`
WHERE `ordered`.`id` = `agent_session_message`.`id` AND `ordered`.`previous_id` IS NOT NULL;--> statement-breakpoint
UPDATE `agent_session` SET `active_node_id` = (
	SELECT `id` FROM `agent_session_message`
	WHERE `session_id` = `agent_session`.`id`
	ORDER BY `created_at` DESC, `id` DESC
	LIMIT 1
);
