import type { PluginToolPolicy } from '../../pluginDefinition';

// Official DWS contracts at 8cacb01951d2567b2c0466d14cb6c5c9d0267a68.
// Each tool is bound to its documented service, not just a matching remote name.
export const DINGTALK_SERVICES = {
  doc: {
    path: '/server/91e17caf44f6ca1ed9c6ce614221a518ac93300ece63ca8d7e9b133f912e0607',
    tools: {
      search_documents: 'read',
      get_document_info: 'read',
      get_document_content: 'read',
      list_nodes: 'read',
      create_document: 'write',
      update_document: 'write',
    },
  },
  todo: {
    path: '/server/0f51140eddcd913106c5821a4d0cd577b2d1a0b6cb452dd0e51ab41facf3a83c',
    tools: {
      get_user_todos_in_current_org: 'read',
      get_todo_detail: 'read',
      list_sub_tasks: 'read',
      create_personal_todo: 'write',
      update_todo_task: 'write',
      update_todo_done_status: 'write',
    },
  },
  calendar: {
    path: '/server/3cb83d4ac411227c44c1abde4e4bfbae0ea2c172b83a78a33ffc3821d0d1be47',
    tools: {
      list_calendars: 'read',
      list_calendar_events: 'read',
      get_calendar_detail: 'read',
      list_suggested_event_times: 'read',
      get_calendar_participants: 'read',
      create_calendar_event: 'write',
      update_calendar_event: 'write',
    },
  },
} satisfies Record<string, { path: string; tools: PluginToolPolicy }>;
export const DINGTALK_TOOL_POLICY: PluginToolPolicy = Object.assign(
  {},
  ...Object.values(DINGTALK_SERVICES).map((service) => service.tools),
);
