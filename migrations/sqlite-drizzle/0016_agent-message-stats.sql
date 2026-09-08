ALTER TABLE `agent_session_message` ADD `stats` text;--> statement-breakpoint
UPDATE `agent_session_message`
SET `stats` = json_object(
	'runtimeTiming', json_object(
		'startedAt', `created_at`,
		'completedAt', `activity_at`,
		'spans', json_array()
	)
)
WHERE `role` = 'assistant'
	AND `status` IN ('success', 'error', 'cancelled', 'interrupted');--> statement-breakpoint
ALTER TABLE `agent_session_message` DROP COLUMN `activity_at`;
