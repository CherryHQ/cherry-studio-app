import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import { Image } from '@cherrystudio/ui/components';

import type { PermissionKind } from '../../permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'reminders',
  'health',
  'camera',
] as const satisfies readonly PermissionKind[];

const permissionImages: Partial<Record<PermissionKind, number>> = {
  calendar: require('@/assets/permissions/ios/calendar.png'),
  health: require('@/assets/permissions/ios/health.png'),
  location: require('@/assets/permissions/ios/location.png'),
  reminders: require('@/assets/permissions/ios/reminders.png'),
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  if (kind === 'camera') return <CameraIcon className="size-5 text-foreground" />;
  return (
    <Image
      cachePolicy="memory-disk"
      className="size-5"
      contentFit="contain"
      source={permissionImages[kind]}
    />
  );
}
