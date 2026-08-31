ALTER TABLE `file_entry` ADD `provenance` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
UPDATE `file_entry`
SET `provenance` = 'artifact'
WHERE `id` IN (
	SELECT json_extract(`part`.`value`, '$.fileEntryId')
	FROM `agent_session_message`, json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`
	WHERE json_extract(`part`.`value`, '$.type') = 'file'
		AND json_extract(`part`.`value`, '$.purpose') = 'artifact'
	UNION
	SELECT json_extract(`artifact`.`value`, '$.ref.fileEntryId')
	FROM `agent_session_message`,
		json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`,
		json_each(json_extract(`part`.`value`, '$.output.artifacts')) AS `artifact`
	UNION
	SELECT json_extract(`part`.`value`, '$.output.value.fileEntryId')
	FROM `agent_session_message`, json_each(json_extract(`agent_session_message`.`data`, '$.parts')) AS `part`
	WHERE json_extract(`part`.`value`, '$.type') = 'tool'
		AND json_extract(`part`.`value`, '$.toolRef.source') = 'builtin'
		AND json_extract(`part`.`value`, '$.toolRef.capabilityId') = 'write_file'
)
OR `id` IN (
	SELECT `output`.`value`
	FROM `painting`, json_each(json_extract(`painting`.`files`, '$.output')) AS `output`
);
