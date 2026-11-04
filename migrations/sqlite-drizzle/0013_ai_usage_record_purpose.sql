CREATE TABLE `ai_usage_record_purpose` (
	`request_id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `ai_usage_record`(`request_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_usage_record_purpose_purpose_check" CHECK("ai_usage_record_purpose"."purpose" IN ('conversation-response', 'context-compaction', 'session-naming', 'translation', 'painting-generation', 'image-response', 'agent-image-tool', 'model-check'))
);
