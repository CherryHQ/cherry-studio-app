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
	`filename` text NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`provenance` text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fe_created_at_idx` ON `file_entry` (`created_at`);--> statement-breakpoint
CREATE TABLE `preference` (
	`scope` text DEFAULT 'default' NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`avatar` text,
	`model` text,
	`tool_approval_mode` text DEFAULT 'default' NOT NULL,
	`disabled_capabilities` text DEFAULT '[]' NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`model`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_created_at_idx` ON `agent` (`created_at`);--> statement-breakpoint
CREATE INDEX `agent_order_key_idx` ON `agent` (`order_key`);--> statement-breakpoint
CREATE TABLE `agent_tool_binding` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`source` text NOT NULL,
	`mcp_server_id` text NOT NULL,
	`raw_tool_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`approval` text DEFAULT 'ask' NOT NULL,
	`display_name_snapshot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_tool_binding_identity_check" CHECK("agent_tool_binding"."source" = 'mcp' AND length("agent_tool_binding"."mcp_server_id") > 0 AND ("agent_tool_binding"."raw_tool_name" IS NULL OR length("agent_tool_binding"."raw_tool_name") > 0)),
	CONSTRAINT "agent_tool_binding_approval_check" CHECK("agent_tool_binding"."approval" IN ('auto', 'ask', 'deny'))
);
--> statement-breakpoint
CREATE INDEX `agent_tool_binding_agent_id_idx` ON `agent_tool_binding` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_binding_mcp_server_id_idx` ON `agent_tool_binding` (`mcp_server_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_binding_mcp_server_default_uniq` ON `agent_tool_binding` (`agent_id`,`mcp_server_id`) WHERE "agent_tool_binding"."raw_tool_name" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_binding_mcp_tool_uniq` ON `agent_tool_binding` (`agent_id`,`mcp_server_id`,`raw_tool_name`) WHERE "agent_tool_binding"."raw_tool_name" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `agent_session` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`is_name_manually_edited` integer DEFAULT false NOT NULL,
	`execution_target` text DEFAULT '{"kind":"local"}' NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`forked_from_session_id` text,
	`fork_boundary_message_id` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`forked_from_session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_session_agent_id_idx` ON `agent_session` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_session_last_activity_at_idx` ON `agent_session` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `agent_session_message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text,
	`role` text NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`usage` text,
	`stats` text,
	`error` text,
	`context_checkpoint` text,
	`model_id` text,
	`message_snapshot` text,
	`searchable_text` text DEFAULT '' NOT NULL,
	`fts_rowid` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_session_message_role_check" CHECK("agent_session_message"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "agent_session_message_status_check" CHECK("agent_session_message"."status" IN ('pending', 'streaming', 'success', 'error', 'cancelled', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX `agent_session_message_session_created_idx` ON `agent_session_message` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_session_message_created_id_idx` ON `agent_session_message` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `agent_session_message_turn_id_idx` ON `agent_session_message` (`turn_id`);--> statement-breakpoint
CREATE INDEX `agent_session_message_status_idx` ON `agent_session_message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_active_turn_uniq` ON `agent_session_message` (`session_id`) WHERE "agent_session_message"."role" = 'assistant' and "agent_session_message"."status" in ('pending', 'streaming');--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_fts_rowid_uniq` ON `agent_session_message` (`fts_rowid`);--> statement-breakpoint
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
	CONSTRAINT "ai_usage_record_source_type_check" CHECK("ai_usage_record"."source_type" IN ('assistant', 'agent', 'mini-app')),
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
CREATE TABLE `desktop_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_urls` text NOT NULL,
	`active_base_url` text NOT NULL,
	`desktop_version` text NOT NULL,
	`status` text DEFAULT 'paired' NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
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
	`cancel_requested_at` integer,
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
	`base_url` text,
	`origin` text DEFAULT 'remote' NOT NULL,
	`builtin_id` text,
	`authorization_id` text,
	`headers` text,
	`is_active` integer DEFAULT false NOT NULL,
	`disabled_tools` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`authorization_id`) REFERENCES `plugin_authorization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "mcp_server_origin_check" CHECK(("mcp_server"."origin" = 'remote' and "mcp_server"."base_url" is not null and "mcp_server"."builtin_id" is null and "mcp_server"."authorization_id" is null) or ("mcp_server"."origin" = 'builtin' and "mcp_server"."base_url" is null and "mcp_server"."headers" is null and "mcp_server"."builtin_id" is not null and "mcp_server"."authorization_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `mcp_server_is_active_idx` ON `mcp_server` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_server_builtin_idx` ON `mcp_server` (`builtin_id`);--> statement-breakpoint
CREATE TABLE `painting` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`prompt` text NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`files` text DEFAULT '{"input":[],"output":[]}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `painting_order_key_idx` ON `painting` (`order_key`);--> statement-breakpoint
CREATE TABLE `plugin_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`auth_method` text NOT NULL,
	`account_label` text NOT NULL,
	`credential` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "plugin_authorization_id_check" CHECK(length(trim("plugin_authorization"."plugin_id")) > 0),
	CONSTRAINT "plugin_authorization_method_check" CHECK(length(trim("plugin_authorization"."auth_method")) > 0)
);
--> statement-breakpoint
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
	`input_modalities_explicit` integer DEFAULT false NOT NULL,
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