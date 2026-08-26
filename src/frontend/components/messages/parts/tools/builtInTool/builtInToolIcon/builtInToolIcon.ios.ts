import FileIcon from '@cherrystudio/app-icons/icons/file';

import type { BuiltInToolIconName } from '../definitions';
import type { BuiltInToolIcon } from './builtInToolIcon.types';

/**
 * Tools that front an iOS permission borrow that permission's system artwork,
 * which users already recognize from the settings screen. A tool with no
 * system counterpart draws the shared vector icon instead.
 */
const icons: Record<BuiltInToolIconName, BuiltInToolIcon> = {
  calendar: { imageSource: require('../../../../../../../../assets/permissions/ios/calendar.png') },
  file: { icon: FileIcon },
  health: { imageSource: require('../../../../../../../../assets/permissions/ios/health.png') },
  location: { imageSource: require('../../../../../../../../assets/permissions/ios/location.png') },
  reminders: {
    imageSource: require('../../../../../../../../assets/permissions/ios/reminders.png'),
  },
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return icons[iconName];
}
