import type { ImageSource } from 'expo-image';
import { useThemeColor } from 'heroui-native/hooks';
import { CameraIcon, PencilIcon } from 'lucide-uniwind/png';
import { View } from 'react-native';

import { Image } from '@/components/nativePrimitives';

const avatarSource = require('@/assets/icon.png');

export type SettingsAvatarEditIcon = 'camera' | 'pencil';

type SettingsEditableAvatarProps = {
  icon: SettingsAvatarEditIcon;
  imageSource?: ImageSource | number;
  size: number;
};

export function SettingsEditableAvatar({ icon, imageSource, size }: SettingsEditableAvatarProps) {
  return (
    <View style={{ height: size, width: size }}>
      <SettingsAvatarImage imageSource={imageSource} size={size} />
      <SettingsAvatarEditBadge icon={icon} size={size} />
    </View>
  );
}

type SettingsAvatarImageProps = {
  imageSource?: ImageSource | number;
  size: number;
};

export function SettingsAvatarImage({ imageSource, size }: SettingsAvatarImageProps) {
  const source = imageSource ?? avatarSource;

  return (
    <Image
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      className="rounded-full"
      source={source}
      style={{ borderRadius: size / 2, height: size, width: size }}
    />
  );
}

type SettingsAvatarEditBadgeProps = {
  icon: SettingsAvatarEditIcon;
  size: number;
};

export function SettingsAvatarEditBadge({ icon, size }: SettingsAvatarEditBadgeProps) {
  const iconColor = useThemeColor('foreground');
  const badgeSize = Math.round(size * 0.32);
  const Icon = icon === 'camera' ? CameraIcon : PencilIcon;

  return (
    <View
      className="absolute right-0 bottom-0 items-center justify-center border border-border bg-surface"
      style={{
        borderRadius: badgeSize / 2,
        height: badgeSize,
        width: badgeSize,
      }}
    >
      <Icon color={iconColor} size={Math.round(badgeSize * 0.5)} strokeWidth={2.4} />
    </View>
  );
}
