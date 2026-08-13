import {
  BellRingIcon,
  CalendarIcon,
  HeartPulseIcon,
  MapPinIcon,
  type AppIconProps,
} from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

export type BuiltInToolPresentation = {
  androidIcon: ComponentType<AppIconProps>;
  iosImageSource: number;
  titleKey: string;
};

const iosSystemImages = {
  calendar: require('../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../assets/permissions/ios/reminders.png'),
} as const;

const builtInToolPresentations: Record<string, BuiltInToolPresentation> = {
  calendar_create_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.createEvent',
  },
  reminder_create_item: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.create',
  },
  calendar_delete_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.deleteEvent',
  },
  reminder_delete_item: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.delete',
  },
  location_get_current: {
    androidIcon: MapPinIcon,
    iosImageSource: iosSystemImages.location,
    titleKey: 'chat.builtinTool.location.current',
  },
  health_get_summary: {
    androidIcon: HeartPulseIcon,
    iosImageSource: iosSystemImages.health,
    titleKey: 'chat.builtinTool.health.summary',
  },
  calendar_list_events: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.listEvents',
  },
  calendar_list_collections: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.listCalendars',
  },
  reminder_list_collections: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.listLists',
  },
  reminder_list_items: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.list',
  },
  health_list_workouts: {
    androidIcon: HeartPulseIcon,
    iosImageSource: iosSystemImages.health,
    titleKey: 'chat.builtinTool.health.listWorkouts',
  },
  calendar_update_event: {
    androidIcon: CalendarIcon,
    iosImageSource: iosSystemImages.calendar,
    titleKey: 'chat.builtinTool.calendar.updateEvent',
  },
  reminder_update_item: {
    androidIcon: BellRingIcon,
    iosImageSource: iosSystemImages.reminders,
    titleKey: 'chat.builtinTool.reminders.update',
  },
};

export function getBuiltInToolPresentation(toolName: string): BuiltInToolPresentation | undefined {
  return builtInToolPresentations[toolName];
}
