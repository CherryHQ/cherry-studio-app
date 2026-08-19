CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`origin` text NOT NULL,
	`name` text NOT NULL,
	`ext` text,
	`size` integer,
	`content_hash` text,
	`external_path` text,
	`cleanup_policy` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "fe_origin_check" CHECK("file_entry"."origin" IN ('internal', 'external')),
	CONSTRAINT "fe_cleanup_policy_check" CHECK("file_entry"."cleanup_policy" IN ('manual', 'delete_when_unreferenced')),
	CONSTRAINT "fe_origin_consistency" CHECK(("file_entry"."origin" = 'internal' AND "file_entry"."external_path" IS NULL) OR ("file_entry"."origin" = 'external' AND "file_entry"."external_path" IS NOT NULL)),
	CONSTRAINT "fe_external_no_delete" CHECK("file_entry"."origin" != 'external' OR "file_entry"."deleted_at" IS NULL),
	CONSTRAINT "fe_contenthash_external_null" CHECK("file_entry"."origin" != 'external' OR "file_entry"."content_hash" IS NULL),
	CONSTRAINT "fe_size_internal_only" CHECK(("file_entry"."origin" = 'internal' AND "file_entry"."size" IS NOT NULL AND "file_entry"."size" >= 0) OR ("file_entry"."origin" = 'external' AND "file_entry"."size" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `fe_deleted_at_idx` ON `file_entry` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `fe_created_at_idx` ON `file_entry` (`created_at`);--> statement-breakpoint
CREATE INDEX `fe_content_hash_idx` ON `file_entry` (`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `fe_external_path_lower_unique_idx` ON `file_entry` (lower("external_path"));--> statement-breakpoint
CREATE INDEX `fe_external_path_idx` ON `file_entry` (`external_path`);--> statement-breakpoint
CREATE TABLE `preference` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`is_name_manually_edited` integer DEFAULT false NOT NULL,
	`assistant_id` text,
	`active_node_id` text,
	`trace_id` text,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistant`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `topic_updated_at_idx` ON `topic` (`updated_at`);--> statement-breakpoint
CREATE INDEX `topic_order_key_idx` ON `topic` (`order_key`);--> statement-breakpoint
CREATE INDEX `topic_assistant_id_idx` ON `topic` (`assistant_id`);--> statement-breakpoint
CREATE TABLE `ai_usage_record` (
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
	CONSTRAINT "ai_usage_record_record_kind_check" CHECK("ai_usage_record"."record_kind" IN ('invocation', 'legacy-aggregate')),
	CONSTRAINT "ai_usage_record_message_kind_check" CHECK("ai_usage_record"."message_kind" IN ('chat', 'agent-session')),
	CONSTRAINT "ai_usage_record_source_type_check" CHECK("ai_usage_record"."source_type" IN ('assistant', 'agent')),
	CONSTRAINT "ai_usage_record_modality_check" CHECK("ai_usage_record"."modality" IN ('language', 'embedding', 'image', 'rerank')),
	CONSTRAINT "ai_usage_record_attribution_check" CHECK("ai_usage_record"."api_key_attribution" IN ('explicit', 'matched', 'auth', 'unknown')),
	CONSTRAINT "ai_usage_record_auth_method_check" CHECK("ai_usage_record"."auth_method" IN ('oauth', 'external-cli', 'iam-aws', 'api-key-aws', 'iam-gcp', 'iam-azure')),
	CONSTRAINT "ai_usage_record_cost_source_check" CHECK("ai_usage_record"."cost_source" IN ('provider', 'computed')),
	CONSTRAINT "ai_usage_record_cost_currency_check" CHECK("ai_usage_record"."cost_currency" IN ('USD', 'CNY')),
	CONSTRAINT "ai_usage_record_kind_identity_check" CHECK((
        "ai_usage_record"."record_kind" = 'invocation'
        AND "ai_usage_record"."request_count" = 1
        AND "ai_usage_record"."provider_id" IS NOT NULL
        AND "ai_usage_record"."model_id" IS NOT NULL
      ) OR (
        "ai_usage_record"."record_kind" = 'legacy-aggregate'
        AND "ai_usage_record"."request_count" >= 1
        AND "ai_usage_record"."message_kind" IS NOT NULL
        AND "ai_usage_record"."message_id" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_message_identity_check" CHECK(("ai_usage_record"."message_kind" IS NULL AND "ai_usage_record"."message_id" IS NULL)
        OR ("ai_usage_record"."message_kind" IS NOT NULL AND "ai_usage_record"."message_id" IS NOT NULL)),
	CONSTRAINT "ai_usage_record_source_identity_check" CHECK((
        "ai_usage_record"."source_type" IS NULL
        AND "ai_usage_record"."source_id" IS NULL
        AND "ai_usage_record"."source_name" IS NULL
        AND "ai_usage_record"."source_icon" IS NULL
      ) OR (
        "ai_usage_record"."source_type" IS NOT NULL
        AND "ai_usage_record"."source_id" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_api_key_identity_check" CHECK((
        "ai_usage_record"."api_key_attribution" IN ('explicit', 'matched')
        AND "ai_usage_record"."api_key_id" IS NOT NULL
        AND "ai_usage_record"."auth_method" IS NULL
      ) OR (
        "ai_usage_record"."api_key_attribution" = 'auth'
        AND "ai_usage_record"."api_key_id" IS NULL
        AND "ai_usage_record"."api_key_label" IS NULL
        AND "ai_usage_record"."api_key_masked" IS NULL
        AND "ai_usage_record"."auth_method" IS NOT NULL
      ) OR (
        "ai_usage_record"."api_key_attribution" = 'unknown'
        AND "ai_usage_record"."api_key_id" IS NULL
        AND "ai_usage_record"."api_key_label" IS NULL
        AND "ai_usage_record"."api_key_masked" IS NULL
        AND "ai_usage_record"."auth_method" IS NULL
      )),
	CONSTRAINT "ai_usage_record_cost_tuple_check" CHECK((
        "ai_usage_record"."cost" IS NULL
        AND "ai_usage_record"."cost_currency" IS NULL
        AND "ai_usage_record"."cost_source" IS NULL
        AND "ai_usage_record"."cost_breakdown" IS NULL
      ) OR (
        "ai_usage_record"."cost" IS NOT NULL
        AND "ai_usage_record"."cost_currency" IS NOT NULL
        AND "ai_usage_record"."cost_source" IS NOT NULL
      )),
	CONSTRAINT "ai_usage_record_image_count_check" CHECK((
        "ai_usage_record"."modality" = 'image'
        AND "ai_usage_record"."image_count" IS NOT NULL
        AND "ai_usage_record"."image_count" >= 0
      ) OR (
        "ai_usage_record"."modality" <> 'image'
        AND "ai_usage_record"."image_count" IS NULL
      )),
	CONSTRAINT "ai_usage_record_nonnegative_check" CHECK(
        ("ai_usage_record"."input_tokens" IS NULL OR "ai_usage_record"."input_tokens" >= 0)
        AND ("ai_usage_record"."output_tokens" IS NULL OR "ai_usage_record"."output_tokens" >= 0)
        AND ("ai_usage_record"."total_tokens" IS NULL OR "ai_usage_record"."total_tokens" >= 0)
        AND ("ai_usage_record"."reasoning_tokens" IS NULL OR "ai_usage_record"."reasoning_tokens" >= 0)
        AND ("ai_usage_record"."no_cache_tokens" IS NULL OR "ai_usage_record"."no_cache_tokens" >= 0)
        AND ("ai_usage_record"."cache_read_tokens" IS NULL OR "ai_usage_record"."cache_read_tokens" >= 0)
        AND ("ai_usage_record"."cache_write_tokens" IS NULL OR "ai_usage_record"."cache_write_tokens" >= 0)
        AND ("ai_usage_record"."cost" IS NULL OR "ai_usage_record"."cost" >= 0)
        AND ("ai_usage_record"."time_first_token_ms" IS NULL OR "ai_usage_record"."time_first_token_ms" >= 0)
        AND ("ai_usage_record"."time_completion_ms" IS NULL OR "ai_usage_record"."time_completion_ms" >= 0)
        AND ("ai_usage_record"."time_thinking_ms" IS NULL OR "ai_usage_record"."time_thinking_ms" >= 0)
      ),
	CONSTRAINT "ai_usage_record_integer_check" CHECK(
        typeof("ai_usage_record"."request_count") = 'integer'
        AND ("ai_usage_record"."input_tokens" IS NULL OR typeof("ai_usage_record"."input_tokens") = 'integer')
        AND ("ai_usage_record"."output_tokens" IS NULL OR typeof("ai_usage_record"."output_tokens") = 'integer')
        AND ("ai_usage_record"."total_tokens" IS NULL OR typeof("ai_usage_record"."total_tokens") = 'integer')
        AND ("ai_usage_record"."reasoning_tokens" IS NULL OR typeof("ai_usage_record"."reasoning_tokens") = 'integer')
        AND ("ai_usage_record"."no_cache_tokens" IS NULL OR typeof("ai_usage_record"."no_cache_tokens") = 'integer')
        AND ("ai_usage_record"."cache_read_tokens" IS NULL OR typeof("ai_usage_record"."cache_read_tokens") = 'integer')
        AND ("ai_usage_record"."cache_write_tokens" IS NULL OR typeof("ai_usage_record"."cache_write_tokens") = 'integer')
        AND ("ai_usage_record"."image_count" IS NULL OR typeof("ai_usage_record"."image_count") = 'integer')
        AND ("ai_usage_record"."time_first_token_ms" IS NULL OR typeof("ai_usage_record"."time_first_token_ms") = 'integer')
        AND ("ai_usage_record"."time_completion_ms" IS NULL OR typeof("ai_usage_record"."time_completion_ms") = 'integer')
        AND ("ai_usage_record"."time_thinking_ms" IS NULL OR typeof("ai_usage_record"."time_thinking_ms") = 'integer')
        AND typeof("ai_usage_record"."created_at") = 'integer'
      ),
	CONSTRAINT "ai_usage_record_finite_cost_check" CHECK("ai_usage_record"."cost" IS NULL OR "ai_usage_record"."cost" <= 1.7976931348623157e308)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_record_request_id_idx` ON `ai_usage_record` (`request_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_created_at_idx` ON `ai_usage_record` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_message_created_idx` ON `ai_usage_record` (`message_kind`,`message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_provider_created_idx` ON `ai_usage_record` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_model_created_idx` ON `ai_usage_record` (`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_api_key_created_idx` ON `ai_usage_record` (`api_key_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_record_source_created_idx` ON `ai_usage_record` (`source_type`,`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `assistant` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`emoji` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`model_id` text,
	`settings` text NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assistant_created_at_idx` ON `assistant` (`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_order_key_idx` ON `assistant` (`order_key`);--> statement-breakpoint
CREATE TABLE `assistant_mcp_server` (
	`assistant_id` text NOT NULL,
	`mcp_server_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`assistant_id`, `mcp_server_id`),
	FOREIGN KEY (`assistant_id`) REFERENCES `assistant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_server`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_message_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cmfr_role_check" CHECK("chat_message_file_ref"."role" IN ('attachment'))
);
--> statement-breakpoint
CREATE INDEX `cmfr_entry_id_idx` ON `chat_message_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE INDEX `cmfr_source_id_idx` ON `chat_message_file_ref` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cmfr_unique_idx` ON `chat_message_file_ref` (`file_entry_id`,`source_id`,`role`);--> statement-breakpoint
CREATE TABLE `painting_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `painting`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pfr_role_check" CHECK("painting_file_ref"."role" IN ('output', 'input'))
);
--> statement-breakpoint
CREATE INDEX `pfr_entry_id_idx` ON `painting_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE INDEX `pfr_source_id_idx` ON `painting_file_ref` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pfr_unique_idx` ON `painting_file_ref` (`file_entry_id`,`source_id`,`role`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`queue` text NOT NULL,
	`idempotency_key` text,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`attempt` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`parent_id` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`timeout_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_status_check" CHECK("job"."status" IN ('pending','delayed','running','completed','failed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `job_queue_status_scheduled_at_idx` ON `job` (`queue`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `job_status_idx` ON `job` (`status`);--> statement-breakpoint
CREATE INDEX `job_parent_id_idx` ON `job` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_key_partial_uq` ON `job` (`idempotency_key`) WHERE "job"."idempotency_key" IS NOT NULL AND "job"."status" NOT IN ('completed','failed','cancelled');--> statement-breakpoint
CREATE TABLE `mcp_server` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint_url` text NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_server_is_enabled_idx` ON `mcp_server` (`is_enabled`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`topic_id` text NOT NULL,
	`role` text NOT NULL,
	`data` text NOT NULL,
	`searchable_text` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`siblings_group_id` integer DEFAULT 0 NOT NULL,
	`model_id` text,
	`message_snapshot` text,
	`stats` text,
	`fts_rowid` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_role_check" CHECK("message"."role" IN ('user', 'assistant', 'system', 'root')),
	CONSTRAINT "message_status_check" CHECK("message"."status" IN ('pending', 'success', 'error', 'paused')),
	CONSTRAINT "message_root_parent_check" CHECK(("message"."role" = 'root') = ("message"."parent_id" is null))
);
--> statement-breakpoint
CREATE INDEX `message_parent_id_idx` ON `message` (`parent_id`);--> statement-breakpoint
CREATE INDEX `message_topic_created_idx` ON `message` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_status_idx` ON `message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_topic_root_uniq` ON `message` (`topic_id`) WHERE "message"."parent_id" is null and "message"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `message_fts_rowid_uniq` ON `message` (`fts_rowid`);--> statement-breakpoint
CREATE TABLE `painting` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`prompt` text NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `painting_order_key_idx` ON `painting` (`order_key`);--> statement-breakpoint
CREATE TABLE `user_model` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`preset_model_id` text,
	`name` text,
	`description` text,
	`group` text,
	`capabilities` text,
	`input_modalities` text,
	`output_modalities` text,
	`endpoint_types` text,
	`context_window` integer,
	`max_input_tokens` integer,
	`max_output_tokens` integer,
	`supports_streaming` integer,
	`reasoning` text,
	`parameters` text,
	`pricing` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_deprecated` integer DEFAULT false NOT NULL,
	`order_key` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `user_provider`(`provider_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_model_custom_config_check" CHECK("user_model"."preset_model_id" IS NOT NULL OR ("user_model"."name" IS NOT NULL AND "user_model"."capabilities" IS NOT NULL AND "user_model"."supports_streaming" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `user_model_preset_idx` ON `user_model` (`preset_model_id`);--> statement-breakpoint
CREATE INDEX `user_model_provider_enabled_idx` ON `user_model` (`provider_id`,`is_enabled`);--> statement-breakpoint
CREATE INDEX `user_model_provider_id_order_key_idx` ON `user_model` (`provider_id`,`order_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_model_provider_model_unique` ON `user_model` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `user_provider` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`preset_provider_id` text,
	`name` text NOT NULL,
	`logo_key` text,
	`endpoint_configs` text,
	`default_chat_endpoint` text,
	`api_keys` text DEFAULT '[]',
	`auth_config` text,
	`api_features` text,
	`provider_settings` text,
	`is_enabled` integer DEFAULT false NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_provider_preset_idx` ON `user_provider` (`preset_provider_id`);--> statement-breakpoint
CREATE INDEX `user_provider_enabled_idx` ON `user_provider` (`is_enabled`);--> statement-breakpoint
CREATE INDEX `user_provider_order_key_idx` ON `user_provider` (`order_key`);