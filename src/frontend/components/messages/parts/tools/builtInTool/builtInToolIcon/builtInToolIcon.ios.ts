import type { BuiltInToolIconName } from '../definitions';
import type { BuiltInToolIcon } from './builtInToolIcon.types';

const images: Record<BuiltInToolIconName, number> = {
  calendar: require('../../../../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../../../../assets/permissions/ios/reminders.png'),
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return { imageSource: images[iconName] };
}
