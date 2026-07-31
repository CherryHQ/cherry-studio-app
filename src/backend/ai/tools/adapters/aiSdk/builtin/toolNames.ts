export const DEVICE_TOOL_NAMES = {
  calendarCreateEvent: 'calendar_create_event',
  calendarDeleteEvent: 'calendar_delete_event',
  calendarListCollections: 'calendar_list_collections',
  calendarListEvents: 'calendar_list_events',
  calendarUpdateEvent: 'calendar_update_event',
  healthGetSummary: 'health_get_summary',
  healthListWorkouts: 'health_list_workouts',
  locationGetCurrent: 'location_get_current',
  reminderCreateItem: 'reminder_create_item',
  reminderDeleteItem: 'reminder_delete_item',
  reminderListCollections: 'reminder_list_collections',
  reminderListItems: 'reminder_list_items',
  reminderUpdateItem: 'reminder_update_item',
} as const;

export type DeviceToolName = (typeof DEVICE_TOOL_NAMES)[keyof typeof DEVICE_TOOL_NAMES];
