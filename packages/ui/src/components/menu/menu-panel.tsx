import type { ComponentProps, ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { menuBlurRadius, menuRestingScale, menuSlideDistance } from './menu-motion';
import { MenuSurface } from './menu-surface';

export function useMenuPanelRadius() {
  const { borderRadius } = useResolveClassNames('rounded-4xl');
  return typeof borderRadius === 'number' ? borderRadius : 0;
}

/** Shared surface and content motion; the trigger owner positions and clips it. */
export function MenuPanel({
  children,
  contentStyle,
  elevated = true,
  isOpen,
  maxHeight,
  onLayout,
  progress,
  surfaceClassName = 'bg-popover',
  testID,
}: {
  children: ReactNode;
  contentStyle?: ComponentProps<typeof Animated.View>['style'];
  elevated?: boolean;
  isOpen: boolean;
  maxHeight?: number;
  onLayout: (event: LayoutChangeEvent) => void;
  progress: SharedValue<number>;
  surfaceClassName?: string;
  testID?: string;
}) {
  const panelStyle = useAnimatedStyle(() => ({
    filter: [{ blur: Math.max(0, 1 - progress.value) * menuBlurRadius }],
    opacity: progress.value,
    transform: [
      { translateX: menuSlideDistance * (1 - progress.value) },
      { scale: menuRestingScale + (1 - menuRestingScale) * progress.value },
    ],
  }));

  return (
    <MenuSurface
      className={surfaceClassName}
      contentStyle={fillStyle}
      elevated={elevated}
      style={fillStyle}
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
    </MenuSurface>
  );
}

const fillStyle = { height: '100%', width: '100%' } as const;
