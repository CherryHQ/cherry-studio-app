import { Surface } from '@cherrystudio/ui/components';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useRef } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { resolveDockDragPreview } from './dockTabs';
import {
  navChromeTimingConfig,
  NavDragStatusPill,
  NavTabStrip,
  useMeasureNavBounds,
} from './NavTabStrip';
import { resolveFloatingDockBottomPadding } from './shellMode';
import { useNavigationShell, useNavigationShellInteraction } from './state';

const DOCK_FADE_START = { x: 0.5, y: 0 } as const;
const DOCK_FADE_END = { x: 0.5, y: 1 } as const;
const DOCK_FADE_LOCATIONS = [0, 0.38, 1] as const;
const DOCK_FADE_STYLE = {
  bottom: 0,
  left: 0,
  position: 'absolute',
  right: 0,
  top: -18,
} as const;
const DOCK_TRAY_STYLE = {
  bottom: -6,
  left: 12,
  position: 'absolute',
  right: 12,
  top: -6,
} as const;

function toColor(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/** Borderless ChatGPT-style bottom floating navigation dock for compact windows. */
export function FloatingNavDock() {
  const insets = useSafeAreaInsets();
  const {
    activeDestination,
    activeDockTab,
    isAtRoot,
    isOnboardingBlocking,
    isDockVisible,
    navigateToDestination,
    pinnedTabs,
    registerDockRect,
    reportDockHeight,
    shellMode,
  } = useNavigationShell();
  const { dragState } = useNavigationShellInteraction();

  const [defaultSurfaceColor, foregroundColor, mutedForegroundColor] = useThemeColor([
    'background',
    'foreground',
    'muted-foreground',
  ]);
  const transparentDefaultSurface = toColor(
    useResolveClassNames('bg-background/0').backgroundColor,
    defaultSurfaceColor,
  );
  const defaultFadeColors = useMemo(
    () => [transparentDefaultSurface, defaultSurfaceColor, defaultSurfaceColor] as const,
    [defaultSurfaceColor, transparentDefaultSurface],
  );

  const rowRef = useRef<ViewInstance>(null);
  const preview = useMemo(
    () => resolveDockDragPreview(pinnedTabs, dragState),
    [dragState, pinnedTabs],
  );
  const isChatSurface = activeDestination === 'chat';

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isDockVisible ? 1 : 0, navChromeTimingConfig),
    transform: [{ translateY: withTiming(isDockVisible ? 0 : 20, navChromeTimingConfig) }],
  }));

  const measureDockBounds = useMeasureNavBounds(
    rowRef,
    isDockVisible && shellMode === 'compact-dock' && isAtRoot,
    preview.tabs.length,
    Boolean(dragState),
    registerDockRect,
  );

  const handleRowLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      reportDockHeight(event.nativeEvent.layout.height);
      measureDockBounds();
    },
    [measureDockBounds, reportDockHeight],
  );

  if (isOnboardingBlocking || shellMode !== 'compact-dock') {
    return null;
  }

  const bottomPadding = resolveFloatingDockBottomPadding(insets.bottom, Platform?.OS ?? 'ios');

  const trayClassName = !dragState
    ? null
    : dragState.overDock && preview.canDrop
      ? 'h-14 w-full rounded-full bg-secondary/25'
      : dragState.overDock && preview.isFull
        ? 'h-14 w-full rounded-full bg-secondary/50'
        : dragState.source === 'more'
          ? 'h-14 w-full rounded-full bg-secondary/10'
          : 'h-14 w-full rounded-full';

  return (
    <Animated.View
      accessibilityElementsHidden={!isDockVisible}
      accessibilityRole="tablist"
      className="absolute right-0 bottom-0 left-0 z-20"
      importantForAccessibility={isDockVisible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isDockVisible ? 'box-none' : 'none'}
      style={[animatedContainerStyle, { paddingBottom: bottomPadding }]}
      testID="floating-nav-dock"
    >
      {isChatSurface ? (
        <View className="absolute inset-0 bg-chat-background" pointerEvents="none" />
      ) : (
        <LinearGradient
          colors={defaultFadeColors}
          end={DOCK_FADE_END}
          locations={DOCK_FADE_LOCATIONS}
          pointerEvents="none"
          start={DOCK_FADE_START}
          style={DOCK_FADE_STYLE}
        />
      )}
      <NavDragStatusPill
        containerClassName="items-center"
        dragState={dragState}
        pillTestID="floating-dock-status-pill"
        preview={preview}
        style={{ bottom: 58 + bottomPadding, left: 16, position: 'absolute', right: 16 }}
      />
      <View className="relative" pointerEvents="box-none">
        {trayClassName ? (
          <View pointerEvents="none" style={DOCK_TRAY_STYLE}>
            <Surface shape="pill">
              <View className={trayClassName} testID="floating-dock-drop-tray" />
            </Surface>
          </View>
        ) : null}
        <View
          ref={rowRef}
          className="flex-row items-center justify-center gap-2 px-4"
          onLayout={handleRowLayout}
          pointerEvents={isDockVisible ? 'auto' : 'none'}
          testID="floating-nav-row"
        >
          <NavTabStrip
            activeDockTab={activeDockTab}
            dragState={dragState}
            foregroundColor={foregroundColor}
            mutedForegroundColor={mutedForegroundColor}
            onSelectDestination={navigateToDestination}
            orientation="horizontal"
            pinnedTabs={pinnedTabs}
            preview={preview}
            testIDPrefix="floating-nav"
          />
        </View>
      </View>
    </Animated.View>
  );
}
