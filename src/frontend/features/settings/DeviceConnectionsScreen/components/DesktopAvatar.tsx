import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import { Avatar } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { memo } from 'react';

export type DesktopAvatarProps = {
  avatar?: string | null;
  className?: string;
  name?: string | null;
  size?: number;
};

function isImageDataUri(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:image/');
}

export const DesktopAvatar = memo(function DesktopAvatar({
  avatar,
  className,
  name,
  size = 36,
}: DesktopAvatarProps) {
  const isImage = isImageDataUri(avatar);
  const isEmoji = typeof avatar === 'string' && avatar.trim().length > 0 && !isImage;

  return (
    <Avatar
      accessibilityLabel={name || 'Desktop'}
      className={cn('shrink-0', className)}
      shape="circle"
      size={size}
    >
      {isImage ? (
        <>
          <Avatar.Image contentFit="cover" source={{ uri: avatar as string }} />
          <Avatar.Fallback>
            <MonitorIcon
              className="text-muted-foreground"
              style={{ height: size * 0.5, width: size * 0.5 }}
            />
          </Avatar.Fallback>
        </>
      ) : isEmoji ? (
        <Avatar.Fallback textProps={{ style: { fontSize: Math.round(size * 0.52) } }}>
          {avatar}
        </Avatar.Fallback>
      ) : (
        <Avatar.Fallback>
          <MonitorIcon
            className="text-muted-foreground"
            style={{ height: size * 0.5, width: size * 0.5 }}
          />
        </Avatar.Fallback>
      )}
    </Avatar>
  );
});
