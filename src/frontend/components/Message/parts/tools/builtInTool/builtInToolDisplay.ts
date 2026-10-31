import {
  BUILT_IN_TOOL_TITLE_KEYS,
  isBuiltInToolTitleName,
} from '@/shared/data/types/builtInToolTitles';

import type { BuiltInToolDisplay } from './builtInToolDisplay.types';
import { getBuiltInToolIcon } from './builtInToolIcon/builtInToolIcon';
import { builtInToolIconNames } from './definitions';

export function getBuiltInToolDisplay(toolName: string): BuiltInToolDisplay | undefined {
  if (!isBuiltInToolTitleName(toolName)) return undefined;
  return {
    ...getBuiltInToolIcon(builtInToolIconNames[toolName]),
    titleKey: BUILT_IN_TOOL_TITLE_KEYS[toolName],
  };
}
