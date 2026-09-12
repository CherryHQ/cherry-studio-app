import type { PluginToolPolicy } from '../../pluginDefinition';

// Reviewed MCP names from TencentCloud-Lighthouse/openclaw-wecom at
// 5edda565415e29e30f6388c2160f750bb026ec32. CLI command names are not MCP aliases.
export const WECOM_TOOL_POLICY = {
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
