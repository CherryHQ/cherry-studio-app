import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { Image } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const ICONS = {
  amap: { source: require('@/assets/plugins/amap.webp'), tint: false },
  feishu: { source: require('@/assets/plugins/feishu.jpeg'), tint: false },
  github: { source: resolveProviderIcon('github')?.light, tint: true },
  notion: { source: require('@/assets/plugins/notion.webp'), tint: true },
} as const;

export function PluginIcon({
  icon,
  size = 'default',
}: {
  icon?: string;
  size?: 'small' | 'default' | 'large';
}) {
  const foreground = useThemeColor('foreground');
  const artwork =
    icon && Object.hasOwn(ICONS, icon) ? ICONS[icon as keyof typeof ICONS] : undefined;
  const iconSize = size === 'small' ? 'size-5' : size === 'large' ? 'size-9' : 'size-7';
  return (
    <View
      className={
        size === 'small'
          ? 'size-6 items-center justify-center'
          : size === 'large'
            ? 'size-12 items-center justify-center'
            : 'size-10 items-center justify-center'
      }
    >
      {artwork ? (
        <Image
          accessibilityIgnoresInvertColors
          className={iconSize}
          contentFit="contain"
          source={artwork.source}
          tintColor={artwork.tint ? foreground : undefined}
        />
      ) : (
        <FileTextIcon className={`${iconSize} text-foreground`} />
      )}
    </View>
  );
}
