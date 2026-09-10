import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { ScrollView } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { SurfaceFrame } from '../surface/surface-frame';
import { menuBlurRadius, menuRestingScale, menuSlideDistance } from './menu-motion';

export function useMenuPanelRadius() {
  const { borderRadius } = useResolveClassNames('rounded-4xl');
  return typeof borderRadius === 'number' ? borderRadius : 0;
}

/** Shared surface and content motion; the trigger owner positions and clips it. */
export function MenuPanel({
  children,
  contentStyle,
  isOpen,
  maxHeight,
  onLayout,
  progress,
  surfaceClassName = 'bg-popover',
  testID,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  isOpen: boolean;
  maxHeight?: number;
  onLayout: (event: LayoutChangeEvent) => void;
  progress: SharedValue<number>;
  surfaceClassName?: string;
  testID?: string;
}) {
  const surfaceFill = useResolveClassNames(surfaceClassName);
  const cornerRadius = useMenuPanelRadius();
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
      cornerRadius={cornerRadius}
      style={fillStyle}
      tintColor={
        typeof surfaceFill.backgroundColor === 'string' ? surfaceFill.backgroundColor : undefined
      }
    >
      <Animated.View
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
        onLayout={onLayout}
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[contentStyle, maxHeight === undefined ? undefined : { maxHeight }, panelStyle]}
        testID={testID}
      >
        <ScrollView
          className="shrink"
          contentContainerClassName="gap-0.5 p-2"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </SurfaceFrame>
  );
}

const fillStyle = { height: '100%', width: '100%' } as const;
