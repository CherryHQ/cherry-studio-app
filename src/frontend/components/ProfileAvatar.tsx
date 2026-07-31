import { useThemeColor } from 'heroui-native/hooks';
import { CameraIcon, PencilIcon } from 'lucide-uniwind/png';
import { View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';
import { useAvatar } from '@/frontend/hooks/useAvatar';

export type ProfileAvatarEditIcon = 'camera' | 'pencil';

type ProfileEditableAvatarProps = {
  icon: ProfileAvatarEditIcon;
  size: number;
};

export function ProfileEditableAvatar({ icon, size }: ProfileEditableAvatarProps) {
  return (
    <View style={{ height: size, width: size }}>
      <ProfileAvatarImage size={size} />
      <ProfileAvatarEditBadge icon={icon} size={size} />
    </View>
  );
}

type ProfileAvatarImageProps = {
  size: number;
};

export function ProfileAvatarImage({ size }: ProfileAvatarImageProps) {
  const avatarSource = useAvatar();

  return (
    <Image
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      className="rounded-full"
      source={avatarSource}
      style={{ borderRadius: size / 2, height: size, width: size }}
    />
  );
}

type ProfileAvatarEditBadgeProps = {
  icon: ProfileAvatarEditIcon;
  size: number;
};

export function ProfileAvatarEditBadge({ icon, size }: ProfileAvatarEditBadgeProps) {
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
