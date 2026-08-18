export type BuiltInToolVisual = 'calendar' | 'health' | 'location' | 'reminders';

type BuiltInToolDefinition = {
  titleKey: string;
  visual: BuiltInToolVisual;
};

export const builtInToolDefinitions: Record<string, BuiltInToolDefinition> = {
  calendar_create_event: {
    titleKey: 'chat.builtinTool.calendar.createEvent',
    visual: 'calendar',
  },
  reminder_create_item: {
    titleKey: 'chat.builtinTool.reminders.create',
    visual: 'reminders',
  },
  calendar_delete_event: {
    titleKey: 'chat.builtinTool.calendar.deleteEvent',
    visual: 'calendar',
  },
  reminder_delete_item: {
    titleKey: 'chat.builtinTool.reminders.delete',
    visual: 'reminders',
  },
  location_get_current: {
    titleKey: 'chat.builtinTool.location.current',
    visual: 'location',
  },
  health_get_summary: {
    titleKey: 'chat.builtinTool.health.summary',
    visual: 'health',
  },
  calendar_list_events: {
    titleKey: 'chat.builtinTool.calendar.listEvents',
    visual: 'calendar',
  },
  calendar_list_collections: {
    titleKey: 'chat.builtinTool.calendar.listCalendars',
    visual: 'calendar',
  },
  reminder_list_collections: {
    titleKey: 'chat.builtinTool.reminders.listLists',
    visual: 'reminders',
  },
  reminder_list_items: {
    titleKey: 'chat.builtinTool.reminders.list',
    visual: 'reminders',
  },
  health_list_workouts: {
    titleKey: 'chat.builtinTool.health.listWorkouts',
    visual: 'health',
  },
  calendar_update_event: {
    titleKey: 'chat.builtinTool.calendar.updateEvent',
    visual: 'calendar',
  },
  reminder_update_item: {
    titleKey: 'chat.builtinTool.reminders.update',
    visual: 'reminders',
  },
};
