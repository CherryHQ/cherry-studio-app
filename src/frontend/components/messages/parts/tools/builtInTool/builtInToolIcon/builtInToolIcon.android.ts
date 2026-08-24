import type { LucideIconProps } from '@cherrystudio/app-icons';
import BellRingIcon from '@cherrystudio/app-icons/icons/bell-ring';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import type { ComponentType } from 'react';

import type { BuiltInToolIconName } from '../definitions';
import type { BuiltInToolIcon } from './builtInToolIcon.types';

const icons: Record<BuiltInToolIconName, ComponentType<LucideIconProps>> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: BellRingIcon,
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return { icon: icons[iconName] };
}
