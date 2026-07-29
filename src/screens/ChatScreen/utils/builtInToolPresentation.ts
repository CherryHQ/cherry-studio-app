import {
  BellRingIcon,
  CalendarIcon,
  HeartPulseIcon,
  MapPinIcon,
  type PngIconProps,
} from 'lucide-uniwind/png';
import type { ComponentType } from 'react';

export type BuiltInToolPresentation = {
  androidIcon: ComponentType<PngIconProps>;
  iosImageSource: number;
  titleKey: string;
};

const iosSystemImages = {
  calendar: require('../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../assets/permissions/ios/health.png'),
  location: require('../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../assets/permissions/ios/reminders.png'),
} as const;

const builtInToolPresentations: Record<string, BuiltInToolPresentation> = {
  builtin_create_calendar_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.createEvent',
  },
  builtin_create_reminder: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.create',
  },
  builtin_delete_calendar_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.deleteEvent',
  },
  builtin_delete_reminder: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.delete',
  },
  builtin_get_current_location: {
    androidIcon: MapPinIcon,
    iosImageSource: iosSystemImages.location,
    titleKey: 'chat.builtinTool.location.current',
  },
  builtin_get_health_summary: {
    androidIcon: HeartPulseIcon,
    iosImageSource: iosSystemImages.health,
    titleKey: 'chat.builtinTool.health.summary',
  },
  builtin_list_calendar_events: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.listEvents',
  },
  builtin_list_calendars: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.listCalendars',
  },
  builtin_list_reminder_lists: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.listLists',
  },
  builtin_list_reminders: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.list',
  },
  builtin_list_workouts: {
    androidIcon: HeartPulseIcon,
    iosImageSource: iosSystemImages.health,
    titleKey: 'chat.builtinTool.health.listWorkouts',
  },
  builtin_update_calendar_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.updateEvent',
  },
  builtin_update_reminder: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.update',
  },
};

export function getBuiltInToolPresentation(toolName: string): BuiltInToolPresentation | undefined {
  return builtInToolPresentations[toolName];
}
