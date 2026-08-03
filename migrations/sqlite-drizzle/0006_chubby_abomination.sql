INSERT INTO `app_state` (`key`, `value`, `description`, `created_at`, `updated_at`)
SELECT
	'migration.0006.opaque-retention',
	json_object(
		'topicGroupIds', json(COALESCE((
			SELECT json_group_object(`id`, `group_id`)
			FROM `topic`
			WHERE `group_id` IS NOT NULL
		), '{}')),
		'modelFields', json(COALESCE((
			SELECT json_group_object(
				`id`,
				json_object(
					'customEndpointUrl', `custom_endpoint_url`,
					'userOverrides', CASE
						WHEN `user_overrides` IS NULL THEN NULL
						WHEN json_valid(`user_overrides`) THEN json(`user_overrides`)
						ELSE `user_overrides`
					END,
					'storedConfig', json_object(
						'name', `name`,
						'description', `description`,
						'group', `group`,
						'capabilities', `capabilities`,
						'inputModalities', `input_modalities`,
						'outputModalities', `output_modalities`,
						'endpointTypes', `endpoint_types`,
						'contextWindow', `context_window`,
						'maxInputTokens', `max_input_tokens`,
						'maxOutputTokens', `max_output_tokens`,
						'supportsStreaming', `supports_streaming`,
						'reasoning', `reasoning`,
						'parameters', `parameters`,
						'pricing', `pricing`
					)
				))
			FROM `user_model`
			WHERE `preset_model_id` IS NOT NULL
				OR `custom_endpoint_url` IS NOT NULL
				OR `user_overrides` IS NOT NULL
		), '{}')),
		'messageModelSnapshots', json(COALESCE((
			SELECT json_group_object(`id`, json(`model_snapshot`))
			FROM `message`
			WHERE `model_snapshot` IS NOT NULL AND json_valid(`model_snapshot`)
		), '{}')),
		'invalidMessageModelSnapshots', json(COALESCE((
			SELECT json_group_object(`id`, `model_snapshot`)
			FROM `message`
			WHERE `model_snapshot` IS NOT NULL AND NOT json_valid(`model_snapshot`)
		), '{}'))
	),
	'Values removed from the desktop-aligned schema and retained losslessly for backup/export migration.',
	0,
	0
WHERE EXISTS (SELECT 1 FROM `topic` WHERE `group_id` IS NOT NULL)
	OR EXISTS (
		SELECT 1 FROM `user_model`
		WHERE `preset_model_id` IS NOT NULL
			OR `custom_endpoint_url` IS NOT NULL
			OR `user_overrides` IS NOT NULL
	)
	OR EXISTS (SELECT 1 FROM `message` WHERE `model_snapshot` IS NOT NULL);--> statement-breakpoint
CREATE TABLE `knowledge_base` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` text,
	`dimensions` integer,
	`embedding_model_id` text,
	`status` text NOT NULL,
	`error` text,
	`rerank_model_id` text,
	`file_processor_id` text,
	`chunk_size` integer NOT NULL,
	`chunk_overlap` integer NOT NULL,
	`chunk_strategy` text DEFAULT 'structured' NOT NULL,
	`chunk_separator` text DEFAULT '\n\n' NOT NULL,
	`threshold` real,
	`document_count` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`embedding_model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rerank_model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_base_chunk_strategy_check" CHECK("knowledge_base"."chunk_strategy" IN ('structured', 'delimiter')),
	CONSTRAINT "knowledge_base_status_check" CHECK("knowledge_base"."status" IN ('completed', 'failed')),
	CONSTRAINT "knowledge_base_status_error_check" CHECK(
        (
          "knowledge_base"."status" = 'completed'
          AND "knowledge_base"."error" IS NULL
          AND (
            (
              "knowledge_base"."embedding_model_id" IS NOT NULL
              AND "knowledge_base"."dimensions" IS NOT NULL
              AND "knowledge_base"."dimensions" > 0
            )
            OR (
              "knowledge_base"."embedding_model_id" IS NULL
              AND "knowledge_base"."dimensions" IS NULL
            )
          )
        )
        OR (
          "knowledge_base"."status" = 'failed'
          AND "knowledge_base"."error" IS NOT NULL
          AND length(trim("knowledge_base"."error")) > 0
        )
      )
);
--> statement-breakpoint
CREATE TABLE `knowledge_item` (
	`id` text PRIMARY KEY NOT NULL,
	`base_id` text NOT NULL,
	`group_id` text,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`base_id`) REFERENCES `knowledge_base`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_id`,`group_id`) REFERENCES `knowledge_item`(`base_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "knowledge_item_type_check" CHECK("knowledge_item"."type" IN ('file', 'url', 'note', 'directory')),
	CONSTRAINT "knowledge_item_status_check" CHECK("knowledge_item"."status" IN ('idle', 'preparing', 'processing', 'reading', 'embedding', 'completed', 'failed', 'deleting')),
	CONSTRAINT "knowledge_item_type_status_check" CHECK(
        ("knowledge_item"."type" IN ('file', 'url', 'note') AND "knowledge_item"."status" IN ('idle', 'processing', 'reading', 'embedding', 'completed', 'failed', 'deleting'))
        OR ("knowledge_item"."type" = 'directory' AND "knowledge_item"."status" IN ('idle', 'preparing', 'processing', 'completed', 'failed', 'deleting'))
      ),
	CONSTRAINT "knowledge_item_status_error_check" CHECK(
        (
          "knowledge_item"."status" IN ('idle', 'preparing', 'processing', 'reading', 'embedding', 'completed', 'deleting')
          AND "knowledge_item"."error" IS NULL
        )
        OR (
          "knowledge_item"."status" = 'failed'
          AND "knowledge_item"."error" IS NOT NULL
          AND length(trim("knowledge_item"."error")) > 0
        )
      )
);
--> statement-breakpoint
CREATE INDEX `knowledge_item_base_type_created_idx` ON `knowledge_item` (`base_id`,`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `knowledge_item_base_group_created_idx` ON `knowledge_item` (`base_id`,`group_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_item_baseId_id_unique` ON `knowledge_item` (`base_id`,`id`);--> statement-breakpoint
CREATE TABLE `translate_history` (
	`id` text PRIMARY KEY NOT NULL,
	`source_text` text NOT NULL,
	`target_text` text NOT NULL,
	`source_language` text,
	`target_language` text,
	`star` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_language`) REFERENCES `translate_language`(`lang_code`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_language`) REFERENCES `translate_language`(`lang_code`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `translate_history_created_at_idx` ON `translate_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `translate_history_star_created_at_idx` ON `translate_history` (`star`,`created_at`);--> statement-breakpoint
CREATE TABLE `translate_language` (
	`lang_code` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text NOT NULL,
	`model` text,
	`plan_model` text,
	`small_model` text,
	`disabled_tools` text DEFAULT '[]' NOT NULL,
	`configuration` text DEFAULT '{}' NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`model`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_model`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`small_model`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_name_idx` ON `agent` (`name`);--> statement-breakpoint
CREATE INDEX `agent_type_idx` ON `agent` (`type`);--> statement-breakpoint
CREATE INDEX `agent_order_key_idx` ON `agent` (`order_key`);--> statement-breakpoint
CREATE TABLE `agent_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`agent_id` text,
	`session_id` text,
	`workspace` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`active_chat_ids` text DEFAULT '[]' NOT NULL,
	`permission_mode` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_channel_agent_id_idx` ON `agent_channel` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_channel_type_idx` ON `agent_channel` (`type`);--> statement-breakpoint
CREATE INDEX `agent_channel_session_id_idx` ON `agent_channel` (`session_id`);--> statement-breakpoint
CREATE TABLE `agent_channel_task` (
	`channel_id` text NOT NULL,
	`task_id` text NOT NULL,
	PRIMARY KEY(`channel_id`, `task_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `agent_channel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `job_schedule`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_channel_task_channel_id_idx` ON `agent_channel_task` (`channel_id`);--> statement-breakpoint
CREATE INDEX `agent_channel_task_task_id_idx` ON `agent_channel_task` (`task_id`);--> statement-breakpoint
CREATE TABLE `agent_global_skill` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`folder_name` text NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`namespace` text,
	`author` text,
	`version` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`content_hash` text NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_global_skill_folder_name_unique` ON `agent_global_skill` (`folder_name`);--> statement-breakpoint
CREATE INDEX `agent_global_skill_source_idx` ON `agent_global_skill` (`source`);--> statement-breakpoint
CREATE INDEX `agent_global_skill_is_enabled_idx` ON `agent_global_skill` (`is_enabled`);--> statement-breakpoint
CREATE TABLE `agent_session` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`name` text NOT NULL,
	`is_name_manually_edited` integer DEFAULT false NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`workspace_id` text NOT NULL,
	`trace_id` text,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `agent_workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_session_order_key_idx` ON `agent_session` (`order_key`);--> statement-breakpoint
CREATE INDEX `agent_session_updated_at_idx` ON `agent_session` (`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_session_message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`data` text NOT NULL,
	`searchable_text` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`model_id` text,
	`message_snapshot` text,
	`stats` text,
	`runtime_resume_token` text,
	`fts_rowid` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_session_message_role_check" CHECK("agent_session_message"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "agent_session_message_status_check" CHECK("agent_session_message"."status" IN ('pending', 'success', 'error', 'paused'))
);
--> statement-breakpoint
CREATE INDEX `agent_session_message_session_created_id_idx` ON `agent_session_message` (`session_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `agent_session_message_status_idx` ON `agent_session_message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_message_fts_rowid_uniq` ON `agent_session_message` (`fts_rowid`);--> statement-breakpoint
CREATE TABLE `agent_skill` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `skill_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `agent_global_skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_skill_agent_id_idx` ON `agent_skill` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_skill_skill_id_idx` ON `agent_skill` (`skill_id`);--> statement-breakpoint
CREATE TABLE `agent_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text DEFAULT 'user' NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "agent_workspace_type_check" CHECK("agent_workspace"."type" IN ('user', 'system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_workspace_path_unique_idx` ON `agent_workspace` (`path`);--> statement-breakpoint
CREATE INDEX `agent_workspace_order_key_idx` ON `agent_workspace` (`order_key`);--> statement-breakpoint
CREATE TABLE `agent_knowledge_base` (
	`agent_id` text NOT NULL,
	`knowledge_base_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `knowledge_base_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_mcp_server` (
	`agent_id` text NOT NULL,
	`mcp_server_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `mcp_server_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_server`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mini_app_logo_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `mini_app`(`app_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `malfr_entry_id_idx` ON `mini_app_logo_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `malfr_source_id_idx` ON `mini_app_logo_file_ref` (`source_id`);--> statement-breakpoint
CREATE TABLE `provider_logo_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `user_provider`(`provider_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plfr_entry_id_idx` ON `provider_logo_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plfr_source_id_idx` ON `provider_logo_file_ref` (`source_id`);--> statement-breakpoint
CREATE TABLE `job_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`trigger` text NOT NULL,
	`job_input_template` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run` integer,
	`last_run` integer,
	`catch_up_policy` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_schedule_type_name_uq` ON `job_schedule` (`type`,`name`);--> statement-breakpoint
CREATE INDEX `job_schedule_enabled_next_run_idx` ON `job_schedule` (`enabled`,`next_run`);--> statement-breakpoint
CREATE INDEX `job_schedule_type_idx` ON `job_schedule` (`type`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`queue` text NOT NULL,
	`idempotency_key` text,
	`schedule_id` text,
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
	FOREIGN KEY (`schedule_id`) REFERENCES `job_schedule`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_status_check" CHECK("job"."status" IN ('pending','delayed','running','completed','failed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `job_queue_status_scheduled_at_idx` ON `job` (`queue`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `job_status_idx` ON `job` (`status`);--> statement-breakpoint
CREATE INDEX `job_schedule_id_finished_at_idx` ON `job` (`schedule_id`,`finished_at`);--> statement-breakpoint
CREATE INDEX `job_parent_id_idx` ON `job` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_key_partial_uq` ON `job` (`idempotency_key`) WHERE "job"."idempotency_key" IS NOT NULL AND "job"."status" NOT IN ('completed','failed','cancelled');--> statement-breakpoint
CREATE TABLE `mini_app` (
	`app_id` text PRIMARY KEY NOT NULL,
	`preset_mini_app_id` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`logo_key` text,
	`status` text DEFAULT 'enabled' NOT NULL,
	`order_key` text NOT NULL,
	`bordered` integer DEFAULT true NOT NULL,
	`background` text,
	`supported_regions` text,
	`configuration` text,
	`name_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "mini_app_status_check" CHECK("mini_app"."status" IN ('enabled', 'disabled', 'pinned'))
);
--> statement-breakpoint
CREATE INDEX `mini_app_status_order_key_idx` ON `mini_app` (`status`,`order_key`);--> statement-breakpoint
CREATE INDEX `mini_app_preset_mini_app_id_idx` ON `mini_app` (`preset_mini_app_id`);--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`root_path` text NOT NULL,
	`path` text NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`is_expanded` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "note_has_state_check" CHECK("note"."is_starred" = 1 OR "note"."is_expanded" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_root_path_path_unique_idx` ON `note` (`root_path`,`path`);--> statement-breakpoint
CREATE TABLE `__new_topic` (
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
INSERT INTO `__new_topic`("id", "name", "is_name_manually_edited", "assistant_id", "active_node_id", "trace_id", "order_key", "created_at", "updated_at", "deleted_at") SELECT "id", "name", "is_name_manually_edited", "assistant_id", "active_node_id", "trace_id", "order_key", "created_at", "updated_at", "deleted_at" FROM `topic`;--> statement-breakpoint
CREATE TABLE `__new_message` (
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
	FOREIGN KEY (`topic_id`) REFERENCES `__new_topic`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `user_model`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `__new_message`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_role_check" CHECK("__new_message"."role" IN ('user', 'assistant', 'system', 'root')),
	CONSTRAINT "message_status_check" CHECK("__new_message"."status" IN ('pending', 'success', 'error', 'paused')),
	CONSTRAINT "message_root_parent_check" CHECK(("__new_message"."role" = 'root') = ("__new_message"."parent_id" is null))
);--> statement-breakpoint
INSERT INTO `__new_message`(
	"id", "parent_id", "topic_id", "role", "data", "searchable_text", "status",
	"siblings_group_id", "model_id", "message_snapshot", "stats", "fts_rowid",
	"created_at", "updated_at", "deleted_at"
)
SELECT
	`message`.`id`, `message`.`parent_id`, `message`.`topic_id`, `message`.`role`,
	`message`.`data`, `message`.`searchable_text`, `message`.`status`,
	`message`.`siblings_group_id`, `message`.`model_id`,
		CASE
			WHEN `message`.`role` = 'assistant'
				AND `message`.`model_snapshot` IS NOT NULL
				AND json_valid(`message`.`model_snapshot`)
				AND json_type(`message`.`model_snapshot`) = 'object'
				AND json_type(`message`.`model_snapshot`, '$.id') = 'text'
				AND trim(json_extract(`message`.`model_snapshot`, '$.id')) != ''
				AND json_type(`message`.`model_snapshot`, '$.provider') = 'text'
				AND trim(json_extract(`message`.`model_snapshot`, '$.provider')) != ''
				AND EXISTS (
					SELECT 1
					FROM `topic`
					JOIN `assistant` ON `assistant`.`id` = `topic`.`assistant_id`
					WHERE `topic`.`id` = `message`.`topic_id`
				)
			THEN json_object(
				'id', (
					(SELECT `assistant`.`id`
					 FROM `topic`
					 JOIN `assistant` ON `assistant`.`id` = `topic`.`assistant_id`
					 WHERE `topic`.`id` = `message`.`topic_id`)
				),
				'name', (
					(SELECT `assistant`.`name`
					 FROM `topic`
					 JOIN `assistant` ON `assistant`.`id` = `topic`.`assistant_id`
					 WHERE `topic`.`id` = `message`.`topic_id`)
				),
				'emoji', (
					(SELECT `assistant`.`emoji`
					 FROM `topic`
					 JOIN `assistant` ON `assistant`.`id` = `topic`.`assistant_id`
					 WHERE `topic`.`id` = `message`.`topic_id`)
				),
				'model', json_patch(
					json_object(
						'id', json_extract(`message`.`model_snapshot`, '$.id'),
						'name', COALESCE(
							NULLIF(
								CASE
									WHEN json_type(`message`.`model_snapshot`, '$.name') = 'text'
									THEN json_extract(`message`.`model_snapshot`, '$.name')
								END,
								''
							),
							json_extract(`message`.`model_snapshot`, '$.id')
						),
						'provider', json_extract(`message`.`model_snapshot`, '$.provider')
					),
					CASE
						WHEN json_type(`message`.`model_snapshot`, '$.group') = 'text'
						THEN json_object('group', json_extract(`message`.`model_snapshot`, '$.group'))
						ELSE '{}'
					END
				)
			)
		ELSE NULL
	END,
	`message`.`stats`, `message`.`fts_rowid`, `message`.`created_at`,
	`message`.`updated_at`, `message`.`deleted_at`
FROM `message`;--> statement-breakpoint
CREATE TABLE `__new_chat_message_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `__new_message`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cmfr_role_check" CHECK("__new_chat_message_file_ref"."role" IN ('attachment'))
);--> statement-breakpoint
INSERT INTO `__new_chat_message_file_ref`(
	"id", "file_entry_id", "source_id", "role", "created_at", "updated_at"
)
SELECT "id", "file_entry_id", "source_id", "role", "created_at", "updated_at"
FROM `chat_message_file_ref`;--> statement-breakpoint
DROP TABLE `chat_message_file_ref`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
DROP TABLE `topic`;--> statement-breakpoint
ALTER TABLE `__new_topic` RENAME TO `topic`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
ALTER TABLE `__new_chat_message_file_ref` RENAME TO `chat_message_file_ref`;--> statement-breakpoint
CREATE INDEX `topic_updated_at_idx` ON `topic` (`updated_at`);--> statement-breakpoint
CREATE INDEX `topic_order_key_idx` ON `topic` (`order_key`);--> statement-breakpoint
CREATE INDEX `topic_assistant_id_idx` ON `topic` (`assistant_id`);--> statement-breakpoint
CREATE INDEX `message_parent_id_idx` ON `message` (`parent_id`);--> statement-breakpoint
CREATE INDEX `message_topic_created_idx` ON `message` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_status_idx` ON `message` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_topic_root_uniq` ON `message` (`topic_id`) WHERE "message"."parent_id" is null and "message"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `message_fts_rowid_uniq` ON `message` (`fts_rowid`);--> statement-breakpoint
CREATE INDEX `cmfr_entry_id_idx` ON `chat_message_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE INDEX `cmfr_source_id_idx` ON `chat_message_file_ref` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cmfr_unique_idx` ON `chat_message_file_ref` (`file_entry_id`,`source_id`,`role`);--> statement-breakpoint
CREATE TABLE `__new_painting_file_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`file_entry_id` text NOT NULL,
	`source_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_entry_id`) REFERENCES `file_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `painting`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pfr_role_check" CHECK("__new_painting_file_ref"."role" IN ('output', 'input'))
);
--> statement-breakpoint
INSERT INTO `__new_painting_file_ref`("id", "file_entry_id", "source_id", "role", "created_at", "updated_at") SELECT "id", "file_entry_id", "source_id", "role", "created_at", "updated_at" FROM `painting_file_ref`;--> statement-breakpoint
DROP TABLE `painting_file_ref`;--> statement-breakpoint
ALTER TABLE `__new_painting_file_ref` RENAME TO `painting_file_ref`;--> statement-breakpoint
CREATE INDEX `pfr_entry_id_idx` ON `painting_file_ref` (`file_entry_id`);--> statement-breakpoint
CREATE INDEX `pfr_source_id_idx` ON `painting_file_ref` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pfr_unique_idx` ON `painting_file_ref` (`file_entry_id`,`source_id`,`role`);--> statement-breakpoint
CREATE TEMP TABLE `_0006_assistant_model_ref` AS
SELECT `id`, `model_id` FROM `assistant` WHERE `model_id` IS NOT NULL;--> statement-breakpoint
CREATE TEMP TABLE `_0006_message_model_ref` AS
SELECT `id`, `model_id` FROM `message` WHERE `model_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_user_model` (
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
	CONSTRAINT "user_model_custom_config_check" CHECK("__new_user_model"."preset_model_id" IS NOT NULL OR ("__new_user_model"."name" IS NOT NULL AND "__new_user_model"."capabilities" IS NOT NULL AND "__new_user_model"."supports_streaming" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_user_model`(
	"id", "provider_id", "model_id", "preset_model_id", "name", "description", "group",
	"capabilities", "input_modalities", "output_modalities", "endpoint_types",
	"context_window", "max_input_tokens", "max_output_tokens", "supports_streaming",
	"reasoning", "parameters", "pricing", "is_enabled", "is_hidden", "is_deprecated",
	"order_key", "notes", "created_at", "updated_at"
)
SELECT
	"id",
	"provider_id",
	"model_id",
	"preset_model_id",
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'name'
	) THEN "name" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'description'
	) THEN "description" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'group'
	) THEN "group" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'capabilities'
	) THEN "capabilities" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'inputModalities'
	) THEN "input_modalities" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'outputModalities'
	) THEN "output_modalities" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'endpointTypes'
	) THEN "endpoint_types" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'contextWindow'
	) THEN "context_window" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'maxInputTokens'
	) THEN "max_input_tokens" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'maxOutputTokens'
	) THEN "max_output_tokens" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'supportsStreaming'
	) THEN "supports_streaming" ELSE NULL END,
	CASE
		WHEN "preset_model_id" IS NOT NULL THEN NULL
		WHEN "reasoning" IS NULL OR NOT json_valid("reasoning") THEN "reasoning"
		ELSE json_remove(
			json_set(
				"reasoning",
				'$.selectableEfforts',
				json(COALESCE(
					json_extract("reasoning", '$.selectableEfforts'),
					json_extract("reasoning", '$.supportedEfforts'),
					'[]'
				))
			),
			'$.type'
		)
	END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'parameters'
	) THEN "parameters" ELSE NULL END,
	CASE WHEN "preset_model_id" IS NULL OR EXISTS (
		SELECT 1 FROM json_each(CASE WHEN json_valid("user_overrides") THEN "user_overrides" ELSE '[]' END)
		WHERE value = 'pricing'
	) THEN "pricing" ELSE NULL END,
	"is_enabled",
	"is_hidden",
	"is_deprecated",
	"order_key",
	"notes",
	"created_at",
	"updated_at"
FROM `user_model`;--> statement-breakpoint
DROP TABLE `user_model`;--> statement-breakpoint
ALTER TABLE `__new_user_model` RENAME TO `user_model`;--> statement-breakpoint
CREATE INDEX `user_model_preset_idx` ON `user_model` (`preset_model_id`);--> statement-breakpoint
CREATE INDEX `user_model_provider_enabled_idx` ON `user_model` (`provider_id`,`is_enabled`);--> statement-breakpoint
CREATE INDEX `user_model_provider_id_order_key_idx` ON `user_model` (`provider_id`,`order_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_model_provider_model_unique` ON `user_model` (`provider_id`,`model_id`);--> statement-breakpoint
UPDATE `assistant`
SET `model_id` = (
	SELECT `_0006_assistant_model_ref`.`model_id`
	FROM `_0006_assistant_model_ref`
	WHERE `_0006_assistant_model_ref`.`id` = `assistant`.`id`
)
WHERE `id` IN (SELECT `id` FROM `_0006_assistant_model_ref`);--> statement-breakpoint
UPDATE `message`
SET `model_id` = (
	SELECT `_0006_message_model_ref`.`model_id`
	FROM `_0006_message_model_ref`
	WHERE `_0006_message_model_ref`.`id` = `message`.`id`
)
WHERE `id` IN (SELECT `id` FROM `_0006_message_model_ref`);--> statement-breakpoint
DROP TABLE `_0006_assistant_model_ref`;--> statement-breakpoint
DROP TABLE `_0006_message_model_ref`;--> statement-breakpoint
ALTER TABLE `assistant` ADD `group_id` text REFERENCES `group`(`id`);--> statement-breakpoint
ALTER TABLE `user_provider` ADD `logo_key` text;--> statement-breakpoint
INSERT INTO `knowledge_base` (
	`id`,
	`name`,
	`status`,
	`error`,
	`chunk_size`,
	`chunk_overlap`,
	`chunk_strategy`,
	`chunk_separator`,
	`created_at`,
	`updated_at`
)
SELECT
	`assistant_knowledge_base`.`knowledge_base_id`,
	'Recovered knowledge base ' || `assistant_knowledge_base`.`knowledge_base_id`,
	'failed',
	'missing_vector_store',
	1024,
	200,
	'structured',
	'\n\n',
	MIN(`assistant_knowledge_base`.`created_at`),
	MAX(`assistant_knowledge_base`.`updated_at`)
FROM `assistant_knowledge_base`
LEFT JOIN `knowledge_base`
	ON `knowledge_base`.`id` = `assistant_knowledge_base`.`knowledge_base_id`
WHERE `knowledge_base`.`id` IS NULL
GROUP BY `assistant_knowledge_base`.`knowledge_base_id`;--> statement-breakpoint
CREATE TABLE `__new_assistant_knowledge_base` (
	`assistant_id` text NOT NULL,
	`knowledge_base_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`assistant_id`, `knowledge_base_id`),
	FOREIGN KEY (`assistant_id`) REFERENCES `assistant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_base`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_assistant_knowledge_base`("assistant_id", "knowledge_base_id", "created_at", "updated_at") SELECT "assistant_id", "knowledge_base_id", "created_at", "updated_at" FROM `assistant_knowledge_base`;--> statement-breakpoint
DROP TABLE `assistant_knowledge_base`;--> statement-breakpoint
ALTER TABLE `__new_assistant_knowledge_base` RENAME TO `assistant_knowledge_base`;
