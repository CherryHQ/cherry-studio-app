import { builtInToolDefinitions, type BuiltInToolVisual } from './builtInToolDefinitions';
import type { BuiltInToolPresentation } from './builtInToolPresentation.types';

const visualImages: Record<BuiltInToolVisual, number> = {
  calendar: require('../../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../../assets/permissions/ios/reminders.png'),
};

export function getBuiltInToolPresentation(toolName: string): BuiltInToolPresentation | undefined {
  const definition = builtInToolDefinitions[toolName];
  return definition
    ? { imageSource: visualImages[definition.visual], titleKey: definition.titleKey }
    : undefined;
}
