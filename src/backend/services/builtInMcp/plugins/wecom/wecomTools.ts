import type { PluginToolPolicy } from '../../pluginDefinition';

// Reviewed MCP names from TencentCloud-Lighthouse/openclaw-wecom at
// 5edda565415e29e30f6388c2160f750bb026ec32. CLI command names are not MCP aliases.
export const WECOM_MCP_TOOL_POLICY = {
  create_doc: 'write',
  edit_doc_content: 'write',
  get_todo_list: 'read',
  get_todo_detail: 'read',
  create_todo: 'write',
  update_todo: 'write',
  change_todo_user_status: 'write',
  get_schedule_list_by_range: 'read',
  get_schedule_detail: 'read',
  check_availablity: 'read',
  create_schedule: 'write',
  update_schedule: 'write',
} satisfies PluginToolPolicy;

// Reviewed command paths from WecomTeam/wecom-cli at
// 1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08, skills/wecomcli-{doc,todo,calendar}.
// Separate tool names preserve the different request and response contracts of MCP and CLI.
export const WECOM_BOT_METHODS = {
  bot_doc_get: { path: ['doc', 'contents', 'get'], effect: 'read' },
  bot_todo_list: { path: ['todo', 'list'], effect: 'read' },
  bot_todo_get: { path: ['todo', 'get'], effect: 'read' },
  bot_todo_create: { path: ['todo', 'create'], effect: 'write' },
  bot_todo_update: { path: ['todo', 'update'], effect: 'write' },
  bot_todo_finish: { path: ['todo', 'finish'], effect: 'write' },
  bot_schedule_list: { path: ['calendar', 'schedules', 'list'], effect: 'read' },
  bot_schedule_get: { path: ['calendar', 'schedules', 'get'], effect: 'read' },
  bot_schedule_create: { path: ['calendar', 'schedules', 'create'], effect: 'write' },
  bot_schedule_update: { path: ['calendar', 'schedules', 'update'], effect: 'write' },
  bot_schedule_freebusy: { path: ['calendar', 'schedules', 'free', 'list'], effect: 'read' },
} as const;

export const WECOM_TOOL_POLICY: PluginToolPolicy = {
  ...WECOM_MCP_TOOL_POLICY,
  ...Object.fromEntries(
    Object.entries(WECOM_BOT_METHODS).map(([name, method]) => [name, method.effect]),
  ),
};
