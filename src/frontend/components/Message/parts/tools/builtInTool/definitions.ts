export type BuiltInToolIconName =
  | 'calendar'
  | 'code'
  | 'fileEdit'
  | 'fileText'
  | 'health'
  | 'image'
  | 'location'
  | 'reminders'
  | 'web';

type BuiltInToolDefinition = {
  iconName: BuiltInToolIconName;
  titleKey: string;
};

export const builtInToolDefinitions: Record<string, BuiltInToolDefinition> = {
  list_workspace: { iconName: 'fileText', titleKey: 'workspace.list' },
  find_workspace_files: { iconName: 'fileText', titleKey: 'workspace.find' },
  create_workspace_folder: { iconName: 'fileEdit', titleKey: 'library.folders.create' },
  library_search_files: { iconName: 'fileText', titleKey: 'library.search' },
  library_read_file: { iconName: 'fileText', titleKey: 'library.read' },
  library_list_folders: { iconName: 'fileText', titleKey: 'chat.builtinTool.library.findFolders' },
  library_move_item: { iconName: 'fileEdit', titleKey: 'chat.builtinTool.library.move' },
  library_rename_item: { iconName: 'fileEdit', titleKey: 'chat.builtinTool.library.rename' },
  library_trash_item: { iconName: 'fileEdit', titleKey: 'chat.builtinTool.library.trash' },
  library_list_trash: { iconName: 'fileText', titleKey: 'chat.builtinTool.library.listTrash' },
  library_restore_item: { iconName: 'fileEdit', titleKey: 'chat.builtinTool.library.restore' },
  create_skill: { iconName: 'fileText', titleKey: 'skills.create.name' },
  adapt_skill: { iconName: 'fileEdit', titleKey: 'skills.adaptation.title' },
  find_skills: { iconName: 'fileText', titleKey: 'skills.find.name' },
  install_skill: { iconName: 'fileText', titleKey: 'skills.candidate.install' },
  list_local_skills: { iconName: 'fileText', titleKey: 'skills.activity.list' },
  load_skill: { iconName: 'fileText', titleKey: 'skills.activity.load' },
  list_skill_files: { iconName: 'fileText', titleKey: 'skills.activity.listFiles' },
  read_skill_file: { iconName: 'fileText', titleKey: 'chat.builtinTool.file.read' },
  agent_create: { iconName: 'fileEdit', titleKey: 'chat.agentTool.create' },
  agent_update: { iconName: 'fileEdit', titleKey: 'chat.agentTool.update' },
  agent_get: { iconName: 'fileText', titleKey: 'chat.agentTool.get' },
  agent_list: { iconName: 'fileText', titleKey: 'chat.agentTool.list' },
  ask_user_question: { iconName: 'reminders', titleKey: 'chat.question.title' },
  calendar_create_event: {
    iconName: 'calendar',
    titleKey: 'chat.builtinTool.calendar.createEvent',
  },
  reminder_create_item: {
    iconName: 'reminders',
    titleKey: 'chat.builtinTool.reminders.create',
  },
  calendar_delete_event: {
    iconName: 'calendar',
    titleKey: 'chat.builtinTool.calendar.deleteEvent',
  },
  reminder_delete_item: {
    iconName: 'reminders',
    titleKey: 'chat.builtinTool.reminders.delete',
  },
  location_get_current: {
    iconName: 'location',
    titleKey: 'chat.builtinTool.location.current',
  },
  health_list_data_types: { iconName: 'health', titleKey: 'chat.builtinTool.health.listDataTypes' },
  health_query_data: { iconName: 'health', titleKey: 'chat.builtinTool.health.queryData' },
  health_get_record: { iconName: 'health', titleKey: 'chat.builtinTool.health.getRecord' },
  health_share_verifiable_records: {
    iconName: 'health',
    titleKey: 'chat.builtinTool.health.shareVerifiableRecords',
  },
  health_get_summary: {
    iconName: 'health',
    titleKey: 'chat.builtinTool.health.summary',
  },
  calendar_list_events: {
    iconName: 'calendar',
    titleKey: 'chat.builtinTool.calendar.listEvents',
  },
  calendar_list_collections: {
    iconName: 'calendar',
    titleKey: 'chat.builtinTool.calendar.listCalendars',
  },
  reminder_list_collections: {
    iconName: 'reminders',
    titleKey: 'chat.builtinTool.reminders.listLists',
  },
  reminder_list_items: {
    iconName: 'reminders',
    titleKey: 'chat.builtinTool.reminders.list',
  },
  health_list_workouts: {
    iconName: 'health',
    titleKey: 'chat.builtinTool.health.listWorkouts',
  },
  calendar_update_event: {
    iconName: 'calendar',
    titleKey: 'chat.builtinTool.calendar.updateEvent',
  },
  reminder_update_item: {
    iconName: 'reminders',
    titleKey: 'chat.builtinTool.reminders.update',
  },
  edit_file: {
    iconName: 'fileEdit',
    titleKey: 'chat.builtinTool.file.edit',
  },
  read_file: {
    iconName: 'fileText',
    titleKey: 'chat.builtinTool.file.read',
  },
  write_file: {
    iconName: 'fileText',
    titleKey: 'chat.builtinTool.file.write',
  },
  generate_image: {
    iconName: 'image',
    titleKey: 'chat.builtinTool.media.generateImage',
  },
  web_search: {
    iconName: 'web',
    titleKey: 'chat.builtinTool.web.search',
  },
  run_js: {
    iconName: 'code',
    titleKey: 'chat.builtinTool.code.runJs',
  },
  // Pi's Code Mode executes the JavaScript capability.
  codemode: {
    iconName: 'code',
    titleKey: 'chat.builtinTool.code.runJs',
  },
  web_fetch: {
    iconName: 'web',
    titleKey: 'chat.builtinTool.web.fetch',
  },
};
