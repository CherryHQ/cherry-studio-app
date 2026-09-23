CREATE TABLE IF NOT EXISTS `remote_session_projection` (
	`connection_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`session_id` text NOT NULL,
	`stream_epoch` text NOT NULL,
	`seq` text NOT NULL,
	`projection` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `scope_id`, `session_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `desktop_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
