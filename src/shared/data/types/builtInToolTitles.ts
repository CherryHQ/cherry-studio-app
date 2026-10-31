import type { BuiltInToolCapabilityId } from './builtInTool';

/** Skill and Code Mode tools are named by the Host rather than the capability catalog. */
type HostToolName =
  | 'adapt_skill'
  | 'codemode'
  | 'create_skill'
  | 'find_skills'
  | 'install_skill'
  | 'list_local_skills'
  | 'list_skill_files'
  | 'load_skill'
  | 'read_skill_file';

export type BuiltInToolTitleName = BuiltInToolCapabilityId | HostToolName;

/** Title keys shared by the chat transcript and background activity surfaces. */
export const BUILT_IN_TOOL_TITLE_KEYS = {
  ssh_execute: 'ssh.command.run',
  inspect_office_file: 'chat.builtinTool.office.inspect',
  read_office_content: 'chat.builtinTool.office.read',
  edit_document: 'chat.builtinTool.office.editDocument',
  edit_workbook: 'chat.builtinTool.office.editWorkbook',
  edit_presentation: 'chat.builtinTool.office.editPresentation',
  create_document: 'chat.builtinTool.office.document',
  create_workbook: 'chat.builtinTool.office.workbook',
  create_presentation: 'chat.builtinTool.office.presentation',
  run_office_script: 'chat.builtinTool.office.script',
  list_workspace: 'workspace.list',
  find_workspace_files: 'workspace.find',
  create_workspace_folder: 'library.folders.create',
  library_search_files: 'library.search',
  library_read_file: 'library.read',
  library_list_folders: 'chat.builtinTool.library.findFolders',
  library_move_item: 'chat.builtinTool.library.move',
  library_rename_item: 'chat.builtinTool.library.rename',
  library_trash_item: 'chat.builtinTool.library.trash',
  library_list_trash: 'chat.builtinTool.library.listTrash',
  library_restore_item: 'chat.builtinTool.library.restore',
  create_skill: 'skills.create.name',
  adapt_skill: 'skills.adaptation.title',
  find_skills: 'skills.find.name',
  install_skill: 'skills.candidate.install',
  list_local_skills: 'skills.activity.list',
  load_skill: 'skills.activity.load',
  list_skill_files: 'skills.activity.listFiles',
  read_skill_file: 'chat.builtinTool.file.read',
  agent_create: 'chat.agentTool.create',
  agent_update: 'chat.agentTool.update',
  agent_get: 'chat.agentTool.get',
  agent_list: 'chat.agentTool.list',
  ask_user_question: 'chat.question.title',
  calendar_create_event: 'chat.builtinTool.calendar.createEvent',
  calendar_delete_event: 'chat.builtinTool.calendar.deleteEvent',
  calendar_list_collections: 'chat.builtinTool.calendar.listCalendars',
  calendar_list_events: 'chat.builtinTool.calendar.listEvents',
  calendar_update_event: 'chat.builtinTool.calendar.updateEvent',
  reminder_create_item: 'chat.builtinTool.reminders.create',
  reminder_delete_item: 'chat.builtinTool.reminders.delete',
  reminder_list_collections: 'chat.builtinTool.reminders.listLists',
  reminder_list_items: 'chat.builtinTool.reminders.list',
  reminder_update_item: 'chat.builtinTool.reminders.update',
  location_get_current: 'chat.builtinTool.location.current',
  health_list_data_types: 'chat.builtinTool.health.listDataTypes',
  health_query_data: 'chat.builtinTool.health.queryData',
  health_get_record: 'chat.builtinTool.health.getRecord',
  health_get_summary: 'chat.builtinTool.health.summary',
  health_list_workouts: 'chat.builtinTool.health.listWorkouts',
  edit_file: 'chat.builtinTool.file.edit',
  read_file: 'chat.builtinTool.file.read',
  write_file: 'chat.builtinTool.file.write',
  generate_image: 'chat.builtinTool.media.generateImage',
  web_search: 'chat.builtinTool.web.search',
  web_fetch: 'chat.builtinTool.web.fetch',
  run_js: 'chat.builtinTool.code.runJs',
  // Pi's Code Mode executes the JavaScript capability.
  codemode: 'chat.builtinTool.code.runJs',
} as const satisfies Record<BuiltInToolTitleName, string>;

export function isBuiltInToolTitleName(name: string): name is BuiltInToolTitleName {
  return Object.hasOwn(BUILT_IN_TOOL_TITLE_KEYS, name);
}

export function getBuiltInToolTitleKey(name: string): string | undefined {
  return isBuiltInToolTitleName(name) ? BUILT_IN_TOOL_TITLE_KEYS[name] : undefined;
}
