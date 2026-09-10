import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import GitHubIcon from '@cherrystudio/app-icons/icons/github';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import { Image } from '@cherrystudio/ui/components';
import { View } from 'react-native';

// Reuse the desktop channel artwork without recoloring the brand.
const FEISHU_ICON = require('@/assets/plugins/feishu.jpeg');
const ICONS = { github: GitHubIcon, 'map-pin': MapPinIcon, 'file-text': FileTextIcon };

export function PluginIcon({
  icon,
  size = 'default',
}: {
  icon?: string;
  size?: 'default' | 'large';
}) {
  const Icon =
    icon && Object.hasOwn(ICONS, icon) ? ICONS[icon as keyof typeof ICONS] : FileTextIcon;
  return (
    <View
      className={
        size === 'large'
          ? 'size-12 items-center justify-center'
          : 'size-10 items-center justify-center'
      }
    >
      {icon === 'feishu' ? (
        <Image
          accessibilityIgnoresInvertColors
          className={size === 'large' ? 'size-9' : 'size-7'}
          contentFit="contain"
          source={FEISHU_ICON}
        />
      ) : (
        <Icon className={size === 'large' ? 'size-9 text-foreground' : 'size-7 text-foreground'} />
      )}
    </View>
  );
}
