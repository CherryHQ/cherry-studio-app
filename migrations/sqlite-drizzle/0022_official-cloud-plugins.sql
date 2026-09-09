-- The bundled plugins now use official cloud tools with different names and operation scopes.
-- Preserve credentials, server identities and old selections, but require explicit Agent enablement.
-- Old tool-specific names remain unavailable until the user selects their official replacements.
UPDATE `agent_tool_binding`
SET `enabled` = 0, `updated_at` = max(`updated_at` + 1, cast(unixepoch('subsec') * 1000 AS integer))
WHERE `source` = 'mcp' AND `mcp_server_id` IN (
  SELECT `id` FROM `mcp_server` WHERE `origin` = 'builtin' AND `builtin_id` IN ('github', 'amap')
);
