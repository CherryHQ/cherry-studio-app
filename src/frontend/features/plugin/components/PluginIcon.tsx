import GitHubIcon from '@cherrystudio/app-icons/icons/github';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import { View } from 'react-native';

import type { PluginId } from '@/shared/contracts/plugins';

export function PluginIcon({
  pluginId,
  size = 'default',
}: {
  pluginId: PluginId;
  size?: 'default' | 'large';
}) {
  const Icon = pluginId === 'github' ? GitHubIcon : MapPinIcon;
  return (
    <View
      className={
        size === 'large'
          ? 'size-18 items-center justify-center rounded-2xl bg-secondary'
          : 'size-14 items-center justify-center rounded-2xl bg-secondary'
      }
    >
      <Icon className={size === 'large' ? 'size-10 text-foreground' : 'size-7 text-foreground'} />
    </View>
  );
}
