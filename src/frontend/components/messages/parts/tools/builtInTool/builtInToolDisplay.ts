import type { BuiltInToolDisplay } from './builtInToolDisplay.types';
import { getBuiltInToolIcon } from './builtInToolIcon/builtInToolIcon';
import { builtInToolDefinitions } from './definitions';

export function getBuiltInToolDisplay(toolName: string): BuiltInToolDisplay | undefined {
  const definition = builtInToolDefinitions[toolName];
  return definition
    ? { ...getBuiltInToolIcon(definition.iconName), titleKey: definition.titleKey }
    : undefined;
}
