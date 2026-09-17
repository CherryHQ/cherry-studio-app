import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import { Image } from '@cherrystudio/ui/components';
import { useUniwind } from 'uniwind';

import type { PermissionKind } from '../../permissionConfig';

export const visiblePermissionKinds = [
  'location',
  'calendar',
  'reminders',
  'health',
  'camera',
  'photos',
] as const satisfies readonly PermissionKind[];

const permissionImages: Partial<Record<PermissionKind, Record<'dark' | 'light', number>>> = {
  calendar: {
    light: require('@/assets/permissions/ios/calendar.png'),
    dark: require('@/assets/permissions/ios/calendar-dark.png'),
  },
  health: {
    light: require('@/assets/permissions/ios/health.png'),
    dark: require('@/assets/permissions/ios/health-dark.png'),
  },
  location: {
    light: require('@/assets/permissions/ios/location.png'),
    dark: require('@/assets/permissions/ios/location-dark.png'),
  },
  reminders: {
    light: require('@/assets/permissions/ios/reminders.png'),
    dark: require('@/assets/permissions/ios/reminders-dark.png'),
  },
};

export function PermissionListLeading({ kind }: { kind: PermissionKind }) {
  const { theme } = useUniwind();

  if (kind === 'camera') return <CameraIcon className="size-5 text-foreground" />;
  if (kind === 'photos') return <ImageIcon className="size-5 text-foreground" />;
  return (
    <Image
      cachePolicy="memory-disk"
      className="size-5 rounded-sm"
      contentFit="contain"
      source={permissionImages[kind]?.[theme === 'dark' ? 'dark' : 'light']}
    />
  );
}

export const healthPermissionProvider = 'apple' as const;
export const healthSettingsNeedInstructions = true;
