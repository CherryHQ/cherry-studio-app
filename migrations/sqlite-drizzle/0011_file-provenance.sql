ALTER TABLE `file_entry` ADD `provenance` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
UPDATE `file_entry`
SET `provenance` = 'generated'
WHERE `id` IN (
	-- Current shape: the Runtime projects each tool artifact as its own file part.
	SELECT json_extract(`part`.`value`, '$.fileEntryId')
	FROM `agent_session_message`, json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`
	WHERE json_extract(`part`.`value`, '$.type') = 'file'
		AND json_extract(`part`.`value`, '$.purpose') = 'artifact'
	UNION
	-- Same files seen from the sibling tool part, which keeps the artifact envelope.
	SELECT json_extract(`artifact`.`value`, '$.ref.fileEntryId')
	FROM `agent_session_message`,
		json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`,
		json_each(json_extract(`part`.`value`, '$.output.artifacts')) AS `artifact`
	UNION
	-- Pre-artifact-envelope writes, whose only record is the tool result value.
	SELECT json_extract(`part`.`value`, '$.output.value.fileEntryId')
	FROM `agent_session_message`, json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`
	WHERE json_extract(`part`.`value`, '$.type') = 'tool'
		AND json_extract(`part`.`value`, '$.toolRef.source') = 'builtin'
		AND json_extract(`part`.`value`, '$.toolRef.capabilityId') = 'write_file'
	UNION
	SELECT `output`.`value`
	FROM `painting`, json_each(json_extract(`painting`.`files`, '$.output')) AS `output`
);--> statement-breakpoint
UPDATE `file_entry`
SET `provenance` = 'imported'
-- Generated wins: reattaching an artifact as an input does not change its origin.
WHERE `provenance` = 'unknown'
	AND `id` IN (
		SELECT json_extract(`part`.`value`, '$.fileEntryId')
		FROM `agent_session_message`, json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`
		WHERE json_extract(`part`.`value`, '$.type') = 'file'
			AND json_extract(`part`.`value`, '$.purpose') = 'input-attachment'
		UNION
		SELECT `input`.`value`
		FROM `painting`, json_each(json_extract(`painting`.`files`, '$.input')) AS `input`
	);
