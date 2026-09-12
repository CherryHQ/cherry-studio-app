import { Children, isValidElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '../../../utils';
import { Image } from '../../image';
import type {
  AvatarBadgePlacement,
  AvatarBadgeProps,
  AvatarFallbackProps,
  AvatarImageProps,
  AvatarProps,
} from '../avatar.types';
import { AvatarContext, useAvatarContext } from '../hooks/use-avatar-context';

const DEFAULT_AVATAR_SIZE = 40;
const DEFAULT_ROUNDED_RADIUS = 6;

const badgePlacementClassNames: Record<AvatarBadgePlacement, string> = {
  'bottom-end': '-bottom-1 -right-1',
  'bottom-start': '-bottom-1 -left-1',
  'top-end': '-right-1 -top-1',
  'top-start': '-left-1 -top-1',
};

function AvatarRoot({
  accessibilityLabel,
  children,
  className,
  radius,
  ref,
  shape = 'circle',
  size = DEFAULT_AVATAR_SIZE,
  style,
  ...props
}: AvatarProps) {
  const borderRadius = radius ?? (shape === 'circle' ? size / 2 : DEFAULT_ROUNDED_RADIUS);
  const content: ReactNode[] = [];
  const badges: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === AvatarBadge) {
      badges.push(child);
    } else {
      content.push(child);
    }
  });

  return (
    <AvatarContext value={{ borderRadius, size }}>
      <View
        {...props}
        className={cn('relative shrink-0', className)}
        ref={ref}
        style={[{ height: size, width: size }, style]}
      >
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          className="items-center justify-center overflow-hidden border border-border border-continuous"
          style={{ borderRadius, height: size, width: size }}
        >
          {content}
        </View>
        {badges}
      </View>
    </AvatarContext>
  );
}

AvatarRoot.displayName = 'Avatar';

function AvatarImage({ scale = 1, style, ...props }: AvatarImageProps) {
  const { size } = useAvatarContext('Avatar.Image');
  const imageSize = size * scale;

  return <Image {...props} style={[{ height: imageSize, width: imageSize }, style]} />;
}

AvatarImage.displayName = 'Avatar.Image';

function AvatarFallback({
  children,
  className,
  ref,
  scale = 1,
  style,
  textProps,
  ...props
}: AvatarFallbackProps) {
  const { borderRadius, size } = useAvatarContext('Avatar.Fallback');
  const fallbackSize = size * scale;
  const fallback =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text {...textProps} className={cn('font-medium text-foreground', textProps?.className)}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <View
      {...props}
      className={cn('items-center justify-center bg-secondary', className)}
      ref={ref}
      style={[
        {
          borderRadius: Math.min(borderRadius, fallbackSize / 2),
          height: fallbackSize,
          width: fallbackSize,
        },
        style,
      ]}
    >
      {fallback}
    </View>
  );
}

AvatarFallback.displayName = 'Avatar.Fallback';

function AvatarBadge({
  children,
  className,
  placement = 'top-end',
  ref,
  ...props
}: AvatarBadgeProps) {
  useAvatarContext('Avatar.Badge');

  return (
    <View
      {...props}
      className={cn(
        'absolute items-center justify-center rounded-full border-2 border-background',
        badgePlacementClassNames[placement],
        className,
      )}
      ref={ref}
    >
      {children}
    </View>
  );
}

AvatarBadge.displayName = 'Avatar.Badge';

export const Avatar = Object.assign(AvatarRoot, {
  Badge: AvatarBadge,
  Fallback: AvatarFallback,
  Image: AvatarImage,
});
