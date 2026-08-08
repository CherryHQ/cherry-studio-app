import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  createAnimatedComponent,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { toastFadeMotion } from './dynamic-toast.motion';
import type { DynamicToastContentProps, DynamicToastContentVariant } from './inner.types';
import {
  COLLAPSED_HEIGHT,
  COLLAPSED_SPACE,
  COLLAPSED_WIDTH,
  EXPANDED_HEIGHT,
  EXPANDED_SPACE,
  useDynamicToast,
} from './provider';
import { useDynamicToastLayout } from './toast';

const AnimatedPressable = createAnimatedComponent(Pressable);

type DynamicToastContentBaseProps = DynamicToastContentProps & {
  backdrop?: ReactNode;
  variant: DynamicToastContentVariant;
};

export function DynamicToastContentBase({
  backdrop,
  children,
  variant,
}: DynamicToastContentBaseProps) {
  const {
    actions: { expand, setPressed },
    state: { isExpanded, isPresented },
  } = useDynamicToast();
  const { expandedWidth, placement } = useDynamicToastLayout();
  const isCollapsed = variant === 'collapsed';
  const edgeStyle = placement === 'top' ? styles.top : styles.bottom;
  const sizeStyle = isCollapsed
    ? { left: (expandedWidth - COLLAPSED_WIDTH) / 2, width: COLLAPSED_WIDTH }
    : { left: 0, width: expandedWidth };
  const animatedStyle = useAnimatedStyle(() => {
    const shouldShow = isCollapsed !== isExpanded.get();

    return {
      opacity: withTiming(shouldShow ? 1 : 0, toastFadeMotion),
      pointerEvents: isPresented.get() && shouldShow ? ('auto' as const) : ('none' as const),
    };
  });

  return (
    <AnimatedPressable
      delayLongPress={isCollapsed ? 200 : undefined}
      onLongPress={
        isCollapsed
          ? () => {
              setPressed(false);
              expand();
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          : undefined
      }
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.content,
        isCollapsed ? styles.collapsed : styles.expanded,
        edgeStyle,
        sizeStyle,
        animatedStyle,
      ]}
    >
      {backdrop}
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  bottom: {
    bottom: 0,
  },
  collapsed: {
    height: COLLAPSED_HEIGHT,
    paddingHorizontal: COLLAPSED_SPACE,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    zIndex: 1,
  },
  expanded: {
    height: EXPANDED_HEIGHT,
    paddingHorizontal: EXPANDED_SPACE,
  },
  top: {
    top: 0,
  },
});
