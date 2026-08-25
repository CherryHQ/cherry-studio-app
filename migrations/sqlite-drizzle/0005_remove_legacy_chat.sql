DROP TRIGGER IF EXISTS `message_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `message_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `message_au`;--> statement-breakpoint
DROP TABLE IF EXISTS `message_fts`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
DROP TABLE `assistant_mcp_server`;--> statement-breakpoint
DROP TABLE `topic`;--> statement-breakpoint
DROP TABLE `assistant`;--> statement-breakpoint
DELETE FROM `app_state` WHERE `key` = 'custom-sql:message-fts';--> statement-breakpoint
DELETE FROM `preference`
WHERE `key` IN (
  'chat.default_model_id',
  'topic.naming.enabled',
  'topic.naming.model_id',
  'topic.naming_prompt'
);
