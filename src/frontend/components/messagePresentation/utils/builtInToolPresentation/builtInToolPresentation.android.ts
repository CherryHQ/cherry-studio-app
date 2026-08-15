import {
  BellRingIcon,
  CalendarIcon,
  HeartPulseIcon,
  MapPinIcon,
  type AppIconProps,
} from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

import { builtInToolDefinitions, type BuiltInToolVisual } from '../builtInToolDefinitions';
import type { BuiltInToolPresentation } from './builtInToolPresentation.types';

const visualIcons: Record<BuiltInToolVisual, ComponentType<AppIconProps>> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: BellRingIcon,
};

export function getBuiltInToolPresentation(toolName: string): BuiltInToolPresentation | undefined {
  const definition = builtInToolDefinitions[toolName];
  return definition
    ? { icon: visualIcons[definition.visual], titleKey: definition.titleKey }
    : undefined;
}
