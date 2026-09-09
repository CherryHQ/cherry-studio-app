import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import GitHubIcon from '@cherrystudio/app-icons/icons/github';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import { View } from 'react-native';

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
      <Icon className={size === 'large' ? 'size-9 text-foreground' : 'size-7 text-foreground'} />
    </View>
  );
}
