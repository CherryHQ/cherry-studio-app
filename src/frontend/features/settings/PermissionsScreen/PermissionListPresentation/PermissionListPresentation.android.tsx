import type { LucideIconProps } from '@cherrystudio/app-icons';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import type { ComponentType } from 'react';

import type { PermissionKind } from '../permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'health',
] as const satisfies readonly PermissionKind[];

const permissionIcons: Record<PermissionKind, ComponentType<LucideIconProps> | undefined> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: undefined,
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  const Icon = permissionIcons[kind];
  return Icon ? <Icon className="size-5 text-foreground" /> : null;
}
