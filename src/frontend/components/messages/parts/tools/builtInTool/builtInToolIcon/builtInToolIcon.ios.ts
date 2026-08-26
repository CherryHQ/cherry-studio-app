import FileIcon from '@cherrystudio/app-icons/icons/file';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import ImageIcon from '@cherrystudio/app-icons/icons/image';

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
  image: { icon: ImageIcon },
  location: { imageSource: require('../../../../../../../../assets/permissions/ios/location.png') },
  reminders: {
    imageSource: require('../../../../../../../../assets/permissions/ios/reminders.png'),
  },
  web: { icon: GlobeIcon },
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return icons[iconName];
}
