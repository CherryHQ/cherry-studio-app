ALTER TABLE `agent_session_message` RENAME COLUMN "message_snapshot" TO "inference_snapshot";
--> statement-breakpoint
-- Align message fields and remove the per-message format version. Tool payloads,
-- runtime checkpoints and inference snapshots retain their own formats.
UPDATE `agent_session_message`
SET `data` = json_set(
  json_remove(`data`, '$.version'),
  '$.parts', json((
    SELECT json_group_array(json(part))
    FROM (
      SELECT CASE json_extract(value, '$.type')
        WHEN 'tool' THEN json_remove(
          json_set(value,
            '$.type', 'dynamic-tool',
            '$.toolName', json_extract(value, '$.providerName'),
            '$.title', json_extract(value, '$.displayName')
          ),
          '$.providerName', '$.displayName'
        )
        WHEN 'file' THEN CASE WHEN json_type(value, '$.name') IS NOT NULL
          THEN json_remove(json_set(value, '$.filename', json_extract(value, '$.name')), '$.name')
          ELSE value
        END
        WHEN 'error' THEN json_remove(
          json_set(value, '$.type', 'data-error', '$.data', json_extract(value, '$.error')),
          '$.error'
        )
        ELSE value
      END AS part
      FROM json_each(agent_session_message.data, '$.parts')
      ORDER BY key
    )
  ))
)
WHERE CASE WHEN json_valid(`data`) THEN
  json_type(`data`, '$.parts') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM json_each(agent_session_message.data, '$.parts') WHERE type != 'object'
  )
ELSE 0 END;
--> statement-breakpoint
-- Replace only the defaulted column: rebuilding the referenced agent table
-- would cascade or fail while Drizzle runs with foreign keys enabled.
ALTER TABLE `agent` ADD COLUMN `new_tool_approval_mode` text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
UPDATE `agent` SET `new_tool_approval_mode` = `tool_approval_mode`;
--> statement-breakpoint
ALTER TABLE `agent` DROP COLUMN `tool_approval_mode`;
--> statement-breakpoint
ALTER TABLE `agent` RENAME COLUMN `new_tool_approval_mode` TO `tool_approval_mode`;
--> statement-breakpoint
ALTER TABLE `agent_session` DROP COLUMN `execution_target`;
--> statement-breakpoint
-- Existing statistics win; usage-only history fills missing token counters.
UPDATE `agent_session_message`
SET `stats` = json_patch(`usage`, COALESCE(`stats`, '{}'))
WHERE CASE WHEN json_valid(`usage`) THEN json_type(`usage`) = 'object' ELSE 0 END
  AND CASE WHEN `stats` IS NULL THEN 1
    WHEN json_valid(`stats`) THEN json_type(`stats`) = 'object'
    ELSE 0 END;
--> statement-breakpoint
ALTER TABLE `agent_session_message` DROP COLUMN `usage`;
