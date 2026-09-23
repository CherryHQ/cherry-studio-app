CREATE TABLE `agent_global_skill` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`folder_name` text NOT NULL,
	`source_registry` text NOT NULL,
	`source_locator` text NOT NULL,
	`source_url` text,
	`source_revision` text NOT NULL,
	`author` text,
	`version` text,
	`license` text,
	`compatibility` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`entry_digest` text NOT NULL,
	`package_digest` text NOT NULL,
	`manifest` text NOT NULL,
	`profile` text NOT NULL,
	`invocation` text DEFAULT '{"modelInvocable":true,"userInvocable":true}' NOT NULL,
	`is_global_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "agent_global_skill_name_check" CHECK(length("agent_global_skill"."name") > 0),
	CONSTRAINT "agent_global_skill_folder_check" CHECK(length("agent_global_skill"."folder_name") > 0),
	CONSTRAINT "agent_global_skill_locator_check" CHECK(length("agent_global_skill"."source_locator") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_global_skill_folder_name_uniq` ON `agent_global_skill` (`folder_name`) WHERE "agent_global_skill"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_global_skill_source_locator_uniq` ON `agent_global_skill` (`source_locator`) WHERE "agent_global_skill"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `agent_global_skill_name_idx` ON `agent_global_skill` (`name`);--> statement-breakpoint
CREATE INDEX `agent_global_skill_enabled_idx` ON `agent_global_skill` (`is_global_enabled`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `agent_skill` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `skill_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `agent_global_skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_skill_skill_id_idx` ON `agent_skill` (`skill_id`);