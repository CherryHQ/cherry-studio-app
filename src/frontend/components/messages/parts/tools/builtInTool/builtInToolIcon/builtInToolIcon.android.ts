import {
  BellRingIcon,
  CalendarIcon,
  HeartPulseIcon,
  MapPinIcon,
  type AppIconProps,
} from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

import type { BuiltInToolIconName } from '../definitions';
import type { BuiltInToolIcon } from './builtInToolIcon.types';

const icons: Record<BuiltInToolIconName, ComponentType<AppIconProps>> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: BellRingIcon,
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return { icon: icons[iconName] };
}
