import {
  CalendarIcon,
  HeartPulseIcon,
  MapPinIcon,
  type AppIconProps,
} from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

import type { PermissionKind } from './permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'health',
] as const satisfies readonly PermissionKind[];

const permissionIcons: Record<PermissionKind, ComponentType<AppIconProps> | undefined> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: undefined,
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  const Icon = permissionIcons[kind];
  return Icon ? <Icon className="size-5 text-foreground" /> : null;
}
