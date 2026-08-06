import { LinearGradient } from 'expo-linear-gradient';
import { ScrollShadow as HeroScrollShadow } from 'heroui-native/scroll-shadow';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import type { View } from 'react-native';

export type ScrollShadowProps = Omit<
  ComponentPropsWithoutRef<typeof HeroScrollShadow>,
  'LinearGradientComponent'
>;

export const ScrollShadow = forwardRef<View, ScrollShadowProps>(function ScrollShadow(props, ref) {
  return <HeroScrollShadow {...props} ref={ref} LinearGradientComponent={LinearGradient} />;
});

ScrollShadow.displayName = 'ScrollShadow';
