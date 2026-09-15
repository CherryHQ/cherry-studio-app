import type { PluginToolPolicy } from '../../pluginDefinition';

// Read effects reviewed against WecomTeam/wecom-cli at 9eb7898b959861af879495e211e37431fa908f19.
// Everything else discovered from the official service remains available with write approval.
const READ_TOOLS = {
  contact: ['get_userlist'],
  doc: [
    'get_doc_content',
    'sheet_get_info',
    'smartsheet_get_sheet',
    'smartsheet_get_fields',
    'smartsheet_get_records',
    'smartpage_get_export_result',
  ],
  meeting: ['get_meeting_info', 'list_user_meetings'],
  msg: ['get_message', 'get_msg_chat_list', 'get_msg_media'],
  schedule: ['get_schedule_detail', 'get_schedule_list_by_range', 'check_availability'],
  todo: ['get_todo_detail', 'get_todo_list', 'search_todo_userid'],
} as const;

/** Category-qualified names prevent an identically named tool in another service gaining read access. */
export const WECOM_TOOL_POLICY: PluginToolPolicy = Object.fromEntries(
  Object.entries(READ_TOOLS).flatMap(([category, tools]) =>
    tools.map((name) => [`wecom_${category}__${name}`, 'read']),
  ),
);

export function acceptsWecomTool(name: string): boolean {
  return /^wecom_[a-z][a-z0-9]*(?:_[a-z0-9]+)*__[A-Za-z0-9_.-]{1,128}$/.test(name);
}

export function getWecomToolEffect(name: string): 'read' | 'write' | undefined {
  if (!acceptsWecomTool(name)) return undefined;
  return Object.hasOwn(WECOM_TOOL_POLICY, name) ? WECOM_TOOL_POLICY[name] : 'write';
}
