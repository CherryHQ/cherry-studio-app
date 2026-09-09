import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { SurfaceFrame } from '../surface/surface-frame';
import { menuBlurRadius, menuRestingScale, menuSlideDistance } from './menu-motion';

export const menuPanelRadius = 20;
export const menuRowClassName =
  'flex-row items-center gap-3 rounded-xl px-3 active:bg-secondary-active';

/** Shared surface and content motion; the trigger owner positions and clips it. */
export function MenuPanel({
  children,
  contentStyle,
  isOpen,
  onLayout,
  progress,
  surfaceClassName = 'bg-popover',
  testID,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  isOpen: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  progress: SharedValue<number>;
  surfaceClassName?: string;
  testID?: string;
}) {
  const surfaceFill = useResolveClassNames(surfaceClassName);
  const panelStyle = useAnimatedStyle(() => ({
    filter: [{ blur: Math.max(0, 1 - progress.value) * menuBlurRadius }],
    opacity: progress.value,
    transform: [
      { translateX: menuSlideDistance * (1 - progress.value) },
      { scale: menuRestingScale + (1 - menuRestingScale) * progress.value },
    ],
  }));

  return (
    <SurfaceFrame
      className={surfaceClassName}
      cornerRadius={menuPanelRadius}
      style={fillStyle}
      tintColor={
        typeof surfaceFill.backgroundColor === 'string' ? surfaceFill.backgroundColor : undefined
      }
    >
      <Animated.View
        className="gap-0.5 p-2"
        onLayout={onLayout}
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[contentStyle, panelStyle]}
        testID={testID}
      >
        {children}
      </Animated.View>
    </SurfaceFrame>
  );
}

const fillStyle = { height: '100%', width: '100%' } as const;
