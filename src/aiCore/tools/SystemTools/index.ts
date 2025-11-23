import { calendarTools } from './CalendarTools'
import { fetchTools } from './FetchTools'
import { reminderTools } from './ReminderTools'
import { shortcutsTools } from './ShortcutsTools'
import { timeTools } from './TimeTools'

export const SystemTool = {
  ...calendarTools,
  ...timeTools,
  ...fetchTools,
  ...reminderTools,
  ...shortcutsTools
}

export type SystemToolKeys = keyof typeof SystemTool
