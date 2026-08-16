import { DatabaseIcon } from '@cherrystudio/app-icons';

import { builtInToolDefinitions, type BuiltInToolVisual } from '../builtInToolDefinitions';
import type { BuiltInToolPresentation } from './builtInToolPresentation.types';

const visualImages: Record<Exclude<BuiltInToolVisual, 'provider'>, number> = {
  calendar: require('../../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../../assets/permissions/ios/reminders.png'),
};

export function getBuiltInToolPresentation(toolName: string): BuiltInToolPresentation | undefined {
  const definition = builtInToolDefinitions[toolName];
  if (!definition) return undefined;

  return definition.visual === 'provider'
    ? { icon: DatabaseIcon, titleKey: definition.titleKey }
    : { imageSource: visualImages[definition.visual], titleKey: definition.titleKey };
}
