-- Older Mobile releases stored a whole Agent turn as one invocation. The
-- original provider boundaries cannot be recovered; keep its counts and cost
-- intact and expose the request count as an estimate, as on desktop.
UPDATE `ai_usage_record`
SET `record_kind` = 'legacy-aggregate'
WHERE `record_kind` = 'invocation'
  AND `request_id` GLOB 'agent-session-turn:*'
  AND `message_kind` = 'agent-session'
  AND `message_id` IS NOT NULL;
