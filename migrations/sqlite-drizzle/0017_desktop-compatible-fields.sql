ALTER TABLE `agent_session` RENAME COLUMN "title" TO "name";--> statement-breakpoint
ALTER TABLE `agent_session` RENAME COLUMN "title_is_manual" TO "is_name_manually_edited";--> statement-breakpoint
ALTER TABLE `mcp_server` RENAME COLUMN "endpoint_url" TO "base_url";--> statement-breakpoint
ALTER TABLE `mcp_server` RENAME COLUMN "is_enabled" TO "is_active";--> statement-breakpoint
ALTER TABLE `agent` RENAME COLUMN "model_id" TO "model";--> statement-breakpoint
DROP INDEX `mcp_server_is_enabled_idx`;--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);--> statement-breakpoint
CREATE TABLE `__new_ai_usage_record` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`record_kind` text NOT NULL,
	`request_count` integer NOT NULL,
	`message_kind` text,
	`message_id` text,
	`provider_id` text,
	`provider_name` text,
	`model_id` text,
	`model_name` text,
	`source_type` text,
	`source_id` text,
	`source_name` text,
	`source_icon` text,
	`modality` text NOT NULL,
	`api_key_id` text,
	`api_key_label` text,
	`api_key_masked` text,
	`api_key_attribution` text NOT NULL,
	`auth_method` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`reasoning_tokens` integer,
	`no_cache_tokens` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`image_count` integer,
	`cost` real,
	`cost_currency` text,
	`cost_source` text,
	`cost_breakdown` text,
	`pricing_snapshot` text,
	`time_first_token_ms` integer,
	`time_completion_ms` integer,
	`time_thinking_ms` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "ai_usage_record_record_kind_check" CHECK("__new_ai_usage_record"."record_kind" IN ('invocation', 'legacy-aggregate')),
	CONSTRAINT "ai_usage_record_message_kind_check" CHECK("__new_ai_usage_record"."message_kind" IN ('chat', 'agent-session')),
	CONSTRAINT "ai_usage_record_source_type_check" CHECK("__new_ai_usage_record"."source_type" IN ('assistant', 'agent', 'mini-app')),
	CONSTRAINT "ai_usage_record_modality_check" CHECK("__new_ai_usage_record"."modality" IN ('language', 'embedding', 'image', 'rerank')),
	CONSTRAINT "ai_usage_record_attribution_check" CHECK("__new_ai_usage_record"."api_key_attribution" IN ('explicit', 'matched', 'auth', 'unknown')),
	CONSTRAINT "ai_usage_record_auth_method_check" CHECK("__new_ai_usage_record"."auth_method" IN ('oauth', 'external-cli', 'iam-aws', 'api-key-aws', 'iam-gcp', 'iam-azure')),
	CONSTRAINT "ai_usage_record_cost_source_check" CHECK("__new_ai_usage_record"."cost_source" IN ('provider', 'computed')),
	CONSTRAINT "ai_usage_record_cost_currency_check" CHECK("__new_ai_usage_record"."cost_currency" IN ('USD', 'CNY')),
	CONSTRAINT "ai_usage_record_kind_identity_check" CHECK((
        "__new_ai_usage_record"."record_kind" = 'invocation'
        AND "__new_ai_usage_record"."request_count" = 1
        AND "__new_ai_usage_record"."provider_id" IS NOT NULL
        AND "__new_ai_usage_record"."model_id" IS NOT NULL
      ) OR (
        "__new_ai_usage_record"."record_kind" = 'legacy-aggregate'
        AND "__new_ai_usage_record"."request_count" >= 1
        AND "__new_ai_usage_record"."message_kind" IS NOT NULL
        AND "__new_ai_usage_record"."message_id" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_message_identity_check" CHECK(("__new_ai_usage_record"."message_kind" IS NULL AND "__new_ai_usage_record"."message_id" IS NULL)
        OR ("__new_ai_usage_record"."message_kind" IS NOT NULL AND "__new_ai_usage_record"."message_id" IS NOT NULL)),
	CONSTRAINT "ai_usage_record_source_identity_check" CHECK((
        "__new_ai_usage_record"."source_type" IS NULL
        AND "__new_ai_usage_record"."source_id" IS NULL
        AND "__new_ai_usage_record"."source_name" IS NULL
        AND "__new_ai_usage_record"."source_icon" IS NULL
      ) OR (
        "__new_ai_usage_record"."source_type" IS NOT NULL
        AND "__new_ai_usage_record"."source_id" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_api_key_identity_check" CHECK((
        "__new_ai_usage_record"."api_key_attribution" IN ('explicit', 'matched')
        AND "__new_ai_usage_record"."api_key_id" IS NOT NULL
        AND "__new_ai_usage_record"."auth_method" IS NULL
      ) OR (
        "__new_ai_usage_record"."api_key_attribution" = 'auth'
        AND "__new_ai_usage_record"."api_key_id" IS NULL
        AND "__new_ai_usage_record"."api_key_label" IS NULL
        AND "__new_ai_usage_record"."api_key_masked" IS NULL
        AND "__new_ai_usage_record"."auth_method" IS NOT NULL
      ) OR (
        "__new_ai_usage_record"."api_key_attribution" = 'unknown'
        AND "__new_ai_usage_record"."api_key_id" IS NULL
        AND "__new_ai_usage_record"."api_key_label" IS NULL
        AND "__new_ai_usage_record"."api_key_masked" IS NULL
        AND "__new_ai_usage_record"."auth_method" IS NULL
      )),
	CONSTRAINT "ai_usage_record_cost_tuple_check" CHECK((
        "__new_ai_usage_record"."cost" IS NULL
        AND "__new_ai_usage_record"."cost_currency" IS NULL
        AND "__new_ai_usage_record"."cost_source" IS NULL
        AND "__new_ai_usage_record"."cost_breakdown" IS NULL
      ) OR (
        "__new_ai_usage_record"."cost" IS NOT NULL
        AND "__new_ai_usage_record"."cost_currency" IS NOT NULL
        AND "__new_ai_usage_record"."cost_source" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_image_count_check" CHECK((
        "__new_ai_usage_record"."modality" = 'image'
        AND "__new_ai_usage_record"."image_count" IS NOT NULL
        AND "__new_ai_usage_record"."image_count" >= 0
      ) OR (
        "__new_ai_usage_record"."modality" <> 'image'
        AND "__new_ai_usage_record"."image_count" IS NULL
      )),
	CONSTRAINT "ai_usage_record_nonnegative_check" CHECK(
        ("__new_ai_usage_record"."input_tokens" IS NULL OR "__new_ai_usage_record"."input_tokens" >= 0)
        AND ("__new_ai_usage_record"."output_tokens" IS NULL OR "__new_ai_usage_record"."output_tokens" >= 0)
        AND ("__new_ai_usage_record"."total_tokens" IS NULL OR "__new_ai_usage_record"."total_tokens" >= 0)
        AND ("__new_ai_usage_record"."reasoning_tokens" IS NULL OR "__new_ai_usage_record"."reasoning_tokens" >= 0)
        AND ("__new_ai_usage_record"."no_cache_tokens" IS NULL OR "__new_ai_usage_record"."no_cache_tokens" >= 0)
        AND ("__new_ai_usage_record"."cache_read_tokens" IS NULL OR "__new_ai_usage_record"."cache_read_tokens" >= 0)
        AND ("__new_ai_usage_record"."cache_write_tokens" IS NULL OR "__new_ai_usage_record"."cache_write_tokens" >= 0)
        AND ("__new_ai_usage_record"."cost" IS NULL OR "__new_ai_usage_record"."cost" >= 0)
        AND ("__new_ai_usage_record"."time_first_token_ms" IS NULL OR "__new_ai_usage_record"."time_first_token_ms" >= 0)
        AND ("__new_ai_usage_record"."time_completion_ms" IS NULL OR "__new_ai_usage_record"."time_completion_ms" >= 0)
        AND ("__new_ai_usage_record"."time_thinking_ms" IS NULL OR "__new_ai_usage_record"."time_thinking_ms" >= 0)
      ),
	CONSTRAINT "ai_usage_record_integer_check" CHECK(
        typeof("__new_ai_usage_record"."request_count") = 'integer'
        AND ("__new_ai_usage_record"."input_tokens" IS NULL OR typeof("__new_ai_usage_record"."input_tokens") = 'integer')
        AND ("__new_ai_usage_record"."output_tokens" IS NULL OR typeof("__new_ai_usage_record"."output_tokens") = 'integer')
        AND ("__new_ai_usage_record"."total_tokens" IS NULL OR typeof("__new_ai_usage_record"."total_tokens") = 'integer')
        AND ("__new_ai_usage_record"."reasoning_tokens" IS NULL OR typeof("__new_ai_usage_record"."reasoning_tokens") = 'integer')
        AND ("__new_ai_usage_record"."no_cache_tokens" IS NULL OR typeof("__new_ai_usage_record"."no_cache_tokens") = 'integer')
        AND ("__new_ai_usage_record"."cache_read_tokens" IS NULL OR typeof("__new_ai_usage_record"."cache_read_tokens") = 'integer')
        AND ("__new_ai_usage_record"."cache_write_tokens" IS NULL OR typeof("__new_ai_usage_record"."cache_write_tokens") = 'integer')
        AND ("__new_ai_usage_record"."image_count" IS NULL OR typeof("__new_ai_usage_record"."image_count") = 'integer')
        AND ("__new_ai_usage_record"."time_first_token_ms" IS NULL OR typeof("__new_ai_usage_record"."time_first_token_ms") = 'integer')
        AND ("__new_ai_usage_record"."time_completion_ms" IS NULL OR typeof("__new_ai_usage_record"."time_completion_ms") = 'integer')
        AND ("__new_ai_usage_record"."time_thinking_ms" IS NULL OR typeof("__new_ai_usage_record"."time_thinking_ms") = 'integer')
        AND typeof("__new_ai_usage_record"."created_at") = 'integer'
      ),
	CONSTRAINT "ai_usage_record_finite_cost_check" CHECK("__new_ai_usage_record"."cost" IS NULL OR "__new_ai_usage_record"."cost" <= 1.7976931348623157e308)
);
--> statement-breakpoint
INSERT INTO `__new_ai_usage_record`("id", "request_id", "record_kind", "request_count", "message_kind", "message_id", "provider_id", "provider_name", "model_id", "model_name", "source_type", "source_id", "source_name", "source_icon", "modality", "api_key_id", "api_key_label", "api_key_masked", "api_key_attribution", "auth_method", "input_tokens", "output_tokens", "total_tokens", "reasoning_tokens", "no_cache_tokens", "cache_read_tokens", "cache_write_tokens", "image_count", "cost", "cost_currency", "cost_source", "cost_breakdown", "pricing_snapshot", "time_first_token_ms", "time_completion_ms", "time_thinking_ms", "created_at") SELECT "id", "request_id", "record_kind", "request_count", "message_kind", "message_id", "provider_id", "provider_name", "model_id", "model_name", "source_type", "source_id", "source_name", "source_icon", "modality", "api_key_id", "api_key_label", "api_key_masked", "api_key_attribution", "auth_method", "input_tokens", "output_tokens", "total_tokens", "reasoning_tokens", "no_cache_tokens", "cache_read_tokens", "cache_write_tokens", "image_count", "cost", "cost_currency", "cost_source", "cost_breakdown", "pricing_snapshot", "time_first_token_ms", "time_completion_ms", "time_thinking_ms", "created_at" FROM `ai_usage_record`;--> statement-breakpoint
DROP TABLE `ai_usage_record`;--> statement-breakpoint
ALTER TABLE `__new_ai_usage_record` RENAME TO `ai_usage_record`;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_record_request_id_idx` ON `ai_usage_record` (`request_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_created_at_idx` ON `ai_usage_record` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_message_created_idx` ON `ai_usage_record` (`message_kind`,`message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_provider_created_idx` ON `ai_usage_record` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_model_created_idx` ON `ai_usage_record` (`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_api_key_created_idx` ON `ai_usage_record` (`api_key_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_source_created_idx` ON `ai_usage_record` (`source_type`,`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_preference` (
	`scope` text DEFAULT 'default' NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
INSERT INTO `__new_preference`("scope", "key", "value", "created_at", "updated_at") SELECT 'default', "key", "value", "created_at", "updated_at" FROM `preference`;--> statement-breakpoint
DROP TABLE `preference`;--> statement-breakpoint
ALTER TABLE `__new_preference` RENAME TO `preference`;--> statement-breakpoint
ALTER TABLE `job` ADD `cancel_requested_at` integer;--> statement-breakpoint
ALTER TABLE `user_model` ADD `input_modalities_explicit` integer DEFAULT false NOT NULL;
