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
  contact: {
    path: '/server/db4b26cb38ea6a8739ad55d1997fa1da608cd36b33a6cf0f77884f70c49382fe',
    tools: {
      get_current_user_profile: 'read',
      search_contact_by_key_word: 'read',
      get_user_info_by_user_ids: 'read',
      search_dept_by_keyword: 'read',
      get_sub_depts_by_dept_id: 'read',
      get_dept_members_by_deptId: 'read',
    },
  },
  wiki: {
    path: '/server/wiki',
    tools: {
      get_wikiSpace: 'read',
      search_wikiSpaces: 'read',
      list_workspace_feeds: 'read',
      create_wikiSpace: 'write',
    },
  },
  drive: {
    path: '/server/536f3b329ee774322b14361c666d6e9471e5bbb281b91ded8ca033b3ce7189af',
    tools: {
      list_spaces: 'read',
      search_files: 'read',
      get_file_info: 'read',
      download_file: 'read',
      create_folder: 'write',
    },
  },
  aitable: {
    path: '/server/5f0d121611f14e878f7d42c3e32bf6c4a790d433066adae38c062a657c397047',
    tools: {
      list_bases: 'read',
      search_bases: 'read',
      get_base: 'read',
      get_tables: 'read',
      get_fields: 'read',
      query_records: 'read',
      create_base: 'write',
      create_records: 'write',
      update_records: 'write',
    },
  },
  sheet: {
    path: '/server/f7340bef5170f3baf97815989fc2bff68f4c293be82b2106c5d3e9cbbb14a17f',
    tools: {
      get_sheet: 'read',
      get_range_as_csv: 'read',
      find_cells: 'read',
      create_sheet: 'write',
      update_range: 'write',
      append_rows: 'write',
    },
  },
  chat: {
    path: '/server/0a1609437385696b77fc4771c3ddaf5656b487f809966c0cc8d4755e7b1d3b74',
    tools: {
      list_top_conversations: 'read',
      get_conversation_info: 'read',
      search_common_groups: 'read',
      search_messages_by_keyword: 'read',
      search_messages_by_time_range: 'read',
      list_conversation_message_v2: 'read',
      list_individual_chat_message: 'read',
      send_personal_message: 'write',
    },
  },
  mail: {
    path: '/server/81395b96cfd92fd40858094064c1ed2f7f36eca3d7229d22aae426f74261a286',
    tools: {
      list_user_mailboxes: 'read',
      search_emails: 'read',
      get_email_by_message_id: 'read',
      get_thread: 'read',
      list_mail_attachments: 'read',
      create_draft: 'write',
      update_draft: 'write',
      create_reply_draft: 'write',
      send_draft: 'write',
      send_email: 'write',
    },
  },
  oa: {
    path: '/server/8faff71bdfc3cb5437894ada5305b48214eb56408ca31e378f4be2773ba4500c',
    tools: {
      get_todo_tasks: 'read',
      get_done_tasks: 'read',
      get_processInstance_detail: 'read',
      list_user_visible_process: 'read',
      get_process_schema: 'read',
      start_process_instance: 'write',
      approve_processInstance: 'write',
      reject_processInstance: 'write',
    },
  },
  report: {
    path: '/server/01d5a7b815babb03626bf3e505bad4c1e36ecf66876eaf6a7a466d9d5ccc9900',
    tools: {
      get_available_report_templates: 'read',
      get_report_entry_details: 'read',
      get_received_report_list: 'read',
      get_send_report_list: 'read',
      create_report: 'write',
    },
  },
  minutes: {
    path: '/server/1e798e16a79e82eb7933050fbd58ed3ba8934170efb7c92565e39a1fb1c888e1',
    tools: {
      list_by_keyword_and_time_range: 'read',
      get_minutes_basic_info: 'read',
      get_minutes_ai_summary: 'read',
      get_minutes_transcription: 'read',
      list_minutes_todos: 'read',
    },
  },
  attendance: {
    path: '/server/72c8e63fa17cae0ea5bf507e2594d56c7b286122a747a9a28d4c30ac430cc774',
    tools: { get_user_attendance_record: 'read' },
  },
} satisfies Record<string, { path: string; tools: PluginToolPolicy }>;
export const DINGTALK_TOOL_POLICY: PluginToolPolicy = Object.assign(
  {},
  ...Object.values(DINGTALK_SERVICES).map((service) => service.tools),
);
