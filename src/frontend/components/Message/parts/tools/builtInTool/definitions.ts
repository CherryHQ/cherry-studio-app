export type BuiltInToolIconName =
  | 'calendar'
  | 'file'
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
    iconName: 'file',
    titleKey: 'chat.builtinTool.file.edit',
  },
  write_file: {
    iconName: 'file',
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
  web_fetch: {
    iconName: 'web',
    titleKey: 'chat.builtinTool.web.fetch',
  },
};
