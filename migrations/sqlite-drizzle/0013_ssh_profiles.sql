CREATE TABLE `ssh_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`auth_method` text NOT NULL,
	`credential_reference` text NOT NULL,
	`fingerprint` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
