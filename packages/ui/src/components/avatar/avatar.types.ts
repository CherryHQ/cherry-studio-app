import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { TextProps, View } from 'react-native';

import type { Image } from '../image';

export type AvatarShape = 'circle' | 'rounded';

export type AvatarProps = Omit<ComponentPropsWithRef<typeof View>, 'children'> & {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  shape?: AvatarShape;
  size?: number;
};

export type AvatarImageProps = Omit<ComponentPropsWithRef<typeof Image>, 'style'> & {
  scale?: number;
  style?: ComponentPropsWithRef<typeof Image>['style'];
};

export type AvatarFallbackProps = Omit<ComponentPropsWithRef<typeof View>, 'children'> & {
  children: ReactNode;
  className?: string;
  scale?: number;
  textProps?: TextProps & { className?: string };
};

export type AvatarBadgePlacement = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start';

export type AvatarBadgeProps = ComponentPropsWithRef<typeof View> & {
  className?: string;
  placement?: AvatarBadgePlacement;
};
