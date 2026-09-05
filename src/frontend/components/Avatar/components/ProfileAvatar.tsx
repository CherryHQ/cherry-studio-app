import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import { Avatar } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';

import { useAvatar } from '@/frontend/hooks/useAvatar';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export type ProfileAvatarEditIcon = 'camera' | 'pencil';

type ProfileEditableAvatarProps = {
  accessibilityLabel: string;
  icon: ProfileAvatarEditIcon;
  size: number;
};

type ProfileAvatarImageProps = {
  accessibilityLabel: string;
  size: number;
};

type ProfileAvatarProps = ProfileAvatarImageProps & {
  children?: ReactNode;
};

function ProfileAvatar({ accessibilityLabel, children, size }: ProfileAvatarProps) {
  const avatarSource = useAvatar();

  return (
    <Avatar accessibilityLabel={accessibilityLabel} size={size}>
      <Avatar.Image
        accessibilityIgnoresInvertColors
        cachePolicy="memory-disk"
        contentFit="cover"
        source={avatarSource}
      />
      {children}
    </Avatar>
  );
}

export function ProfileAvatarImage(props: ProfileAvatarImageProps) {
  return <ProfileAvatar {...props} />;
}

export function ProfileEditableAvatar({
  accessibilityLabel,
  icon,
  size,
}: ProfileEditableAvatarProps) {
  const iconColor = useThemeColor('foreground');
  const badgeSize = Math.round(size * 0.32);
  const Icon = icon === 'camera' ? CameraIcon : PencilIcon;

  return (
    <ProfileAvatar accessibilityLabel={accessibilityLabel} size={size}>
      <Avatar.Badge
        className="right-0 bottom-0 border border-border bg-card"
        placement="bottom-end"
        style={{
          borderRadius: badgeSize / 2,
          height: badgeSize,
          width: badgeSize,
        }}
      >
        <Icon color={iconColor} size={Math.round(badgeSize * 0.5)} />
      </Avatar.Badge>
    </ProfileAvatar>
  );
}
