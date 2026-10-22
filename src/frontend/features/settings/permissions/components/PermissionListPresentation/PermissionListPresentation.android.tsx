import type { LucideIconProps } from '@cherrystudio/app-icons';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import type { ComponentType } from 'react';

import type { PermissionKind } from '../../permissionConfig';

// Android picks photos with the system picker and asks for legacy save access
// only when saving, so there is no photo library permission to manage here.
export const visiblePermissionKinds = [
  'location',
  'calendar',
  'camera',
] as const satisfies readonly PermissionKind[];

const permissionIcons: Record<PermissionKind, ComponentType<LucideIconProps> | undefined> = {
  calendar: CalendarIcon,
  camera: CameraIcon,
  photos: undefined,
  health: undefined,
  location: MapPinIcon,
  reminders: undefined,
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  const Icon = permissionIcons[kind];
  return Icon ? <Icon className="size-5 text-foreground" /> : null;
}
