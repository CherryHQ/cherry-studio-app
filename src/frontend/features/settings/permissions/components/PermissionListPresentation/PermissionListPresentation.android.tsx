import type { LucideIconProps } from '@cherrystudio/app-icons';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import type { ComponentType } from 'react';

import type { PermissionKind } from '../../permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'health',
  'camera',
  'photos',
] as const satisfies readonly PermissionKind[];

const permissionIcons: Record<PermissionKind, ComponentType<LucideIconProps> | undefined> = {
  calendar: CalendarIcon,
  camera: CameraIcon,
  photos: ImageIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: undefined,
};

export const healthPermissionProvider = 'connect' as const;
export const healthSettingsNeedInstructions = false;

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  const Icon = permissionIcons[kind];
  return Icon ? <Icon className="size-5 text-foreground" /> : null;
}
