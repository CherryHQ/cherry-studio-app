import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { TextProps, View } from 'react-native';

import type { Image } from '../image';

export type AvatarShape = 'circle' | 'rounded';

export type AvatarProps = Omit<ComponentPropsWithRef<typeof View>, 'children'> & {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  /**
   * Corner radius of the frame, overriding the one `shape` derives. A caller
   * whose avatar renders at more than one size needs this: `rounded`'s radius is
   * a constant, so it reads as a square once the frame grows.
   */
  radius?: number;
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
