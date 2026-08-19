import { Image } from '@cherrystudio/ui/components';

import type { PermissionKind } from '../permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'reminders',
  'health',
] as const satisfies readonly PermissionKind[];

const permissionImages: Record<PermissionKind, number> = {
  calendar: require('../../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../../assets/permissions/ios/reminders.png'),
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  return (
    <Image
      cachePolicy="memory-disk"
      className="size-5"
      contentFit="contain"
      source={permissionImages[kind]}
    />
  );
}
