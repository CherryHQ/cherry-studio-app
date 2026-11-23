import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getNavTitleKey, resolveDockDragPreview } from './dockTabs';
import { NavIcon } from './NavIcon';
import { useNavigationShell } from './state';

const PILL_WIDTH = 156;

/** Floating glass pill that tracks above the finger and hands off smoothly when entering the dock. */
export function FloatingDragOverlay() {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const { dragState, pinnedTabs } = useNavigationShell();
  const foregroundColor = useThemeColor('foreground');

  const preview = useMemo(
    () => (dragState ? resolveDockDragPreview(pinnedTabs, dragState) : null),
    [dragState, pinnedTabs],
  );

  const shouldHideForDockPreview = Boolean(
    dragState?.overDock && preview?.canDrop && !dragState.draggingOut,
  );

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(shouldHideForDockPreview ? 0 : 1, {
      duration: duration.fast,
      easing: easing.settle,
    }),
    transform: [
      {
        scale: withTiming(shouldHideForDockPreview ? 0.7 : 1.03, {
          duration: duration.fast,
          easing: easing.settle,
        }),
      },
    ],
  }));

  if (!dragState) {
    return null;
  }

  const label = t(getNavTitleKey(dragState.id));
  const left = Math.max(12, Math.min(windowWidth - PILL_WIDTH - 12, dragState.x - 78));
  const top = Math.max(56, dragState.y - 76);

  return (
    <View className="absolute inset-0 z-50" pointerEvents="none" testID="floating-drag-overlay">
      <Animated.View style={[{ left, position: 'absolute', top }, pillAnimatedStyle]}>
        <Surface interactive shape="pill">
          <View className="flex-row items-center gap-2 py-1.5 pr-3.5 pl-1.5">
            <View className="bg-secondary-active h-8 w-8 items-center justify-center rounded-full">
              <NavIcon color={foregroundColor} filled id={dragState.id} size={17} />
            </View>
            <Text className="text-foreground text-sm font-semibold">{label}</Text>
          </View>
        </Surface>
      </Animated.View>
    </View>
  );
}
