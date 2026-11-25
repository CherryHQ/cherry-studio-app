import { Surface } from '@cherrystudio/ui/components';
import { useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { resolveDockDragPreview } from './dockTabs';
import {
  navChromeTimingConfig,
  NavDragStatusPill,
  NavTabStrip,
  useMeasureNavBounds,
} from './NavTabStrip';
import { VERTICAL_RAIL_WIDTH } from './shellMode';
import { useNavigationShell, useNavigationShellInteraction } from './state';

/**
 * Transparent trailing vertical rail overlay for foldable screens whose OS system bar runs down
 * the trailing edge, leaving top native toolbar actions visible above the bottom glass capsule.
 */
export function VerticalNavRail() {
  const outerInsets = useSafeAreaInsets();
  const {
    activeDockTab,
    isAtRoot,
    isOnboardingBlocking,
    isVerticalRailVisible,
    navigateToDestination,
    pinnedTabs,
    registerDockRect,
    shellMode,
  } = useNavigationShell();
  const { dragState } = useNavigationShellInteraction();
  const [foregroundColor, mutedForegroundColor] = useThemeColor(['foreground', 'muted-foreground']);
  const capsuleRef = useRef<ViewInstance>(null);

  const preview = useMemo(
    () => resolveDockDragPreview(pinnedTabs, dragState),
    [dragState, pinnedTabs],
  );

  const animatedCapsuleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isVerticalRailVisible ? 1 : 0, navChromeTimingConfig),
    transform: [{ translateX: withTiming(isVerticalRailVisible ? 0 : 20, navChromeTimingConfig) }],
  }));

  const measureCapsuleBounds = useMeasureNavBounds(
    capsuleRef,
    isVerticalRailVisible && shellMode === 'vertical-rail' && isAtRoot,
    preview.tabs.length,
    Boolean(dragState),
    registerDockRect,
  );

  if (isOnboardingBlocking || shellMode !== 'vertical-rail') {
    return null;
  }

  const railWidth = outerInsets.right > 0 ? outerInsets.right : VERTICAL_RAIL_WIDTH;
  const bottomPadding = Math.max(outerInsets.bottom, 18);

  return (
    <View
      accessibilityElementsHidden={!isVerticalRailVisible}
      accessibilityRole="tablist"
      className="absolute top-0 right-0 bottom-0 z-20"
      importantForAccessibility={isVerticalRailVisible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isVerticalRailVisible ? 'box-none' : 'none'}
      style={{ width: railWidth }}
      testID="vertical-nav-rail"
    >
      <View
        className="bg-sidebar-border absolute top-0 bottom-0 left-0"
        pointerEvents="none"
        style={
          isVerticalRailVisible
            ? { width: StyleSheet.hairlineWidth }
            : { opacity: 0, width: StyleSheet.hairlineWidth }
        }
        testID="vertical-nav-rail-divider"
      />
      <NavDragStatusPill
        dragState={dragState}
        pillTestID="vertical-rail-status-pill"
        preview={preview}
        style={{ bottom: bottomPadding + 8, position: 'absolute', right: railWidth + 10 }}
      />
      <Animated.View
        className="items-center"
        pointerEvents={isVerticalRailVisible ? 'box-none' : 'none'}
        style={[
          { bottom: bottomPadding, left: 0, position: 'absolute', right: 0 },
          animatedCapsuleStyle,
        ]}
      >
        <Surface shape="pill">
          <View
            ref={capsuleRef}
            className="items-center gap-1 p-1"
            onLayout={measureCapsuleBounds}
            pointerEvents={isVerticalRailVisible ? 'auto' : 'none'}
            testID="vertical-rail-capsule"
          >
            <NavTabStrip
              activeDockTab={activeDockTab}
              dragState={dragState}
              foregroundColor={foregroundColor}
              mutedForegroundColor={mutedForegroundColor}
              onSelectDestination={navigateToDestination}
              orientation="vertical"
              pinnedTabs={pinnedTabs}
              preview={preview}
              testIDPrefix="vertical-rail"
            />
          </View>
        </Surface>
      </Animated.View>
    </View>
  );
}
