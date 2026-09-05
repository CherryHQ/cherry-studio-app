import type { LucideIconProps } from '@cherrystudio/app-icons';
import BellRingIcon from '@cherrystudio/app-icons/icons/bell-ring';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import FileEditIcon from '@cherrystudio/app-icons/icons/file-edit';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import type { ComponentType } from 'react';

import type { BuiltInToolIconName } from '../definitions';
import type { BuiltInToolIcon } from './builtInToolIcon.types';

const icons: Record<BuiltInToolIconName, ComponentType<LucideIconProps>> = {
  calendar: CalendarIcon,
  fileEdit: FileEditIcon,
  fileText: FileTextIcon,
  health: HeartPulseIcon,
  image: ImageIcon,
  location: MapPinIcon,
  reminders: BellRingIcon,
  web: GlobeIcon,
};

export function getBuiltInToolIcon(iconName: BuiltInToolIconName): BuiltInToolIcon {
  return { icon: icons[iconName] };
}
