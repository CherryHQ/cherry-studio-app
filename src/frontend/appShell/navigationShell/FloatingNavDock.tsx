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

function toColor(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function resolveTabMaxWidth(totalCount: number): number {
  if (totalCount <= 3) return 100;
  if (totalCount === 4) return 80;
  return 66;
}

/** Borderless ChatGPT-style bottom floating navigation dock for compact windows. */
export function FloatingNavDock() {
  const insets = useSafeAreaInsets();
  const {
    activeDestination,
    activeDockTab,
    isAtRoot,
    isDockVisible,
    navigateToDestination,
    pinnedTabs,
    registerDockRect,
    reportDockHeight,
    shellMode,
  } = useNavigationShell();
  const { dragState } = useNavigationShellInteraction();

  const [chatSurfaceColor, defaultSurfaceColor, foregroundColor, mutedForegroundColor] =
    useThemeColor(['chat-background', 'background', 'foreground', 'muted-foreground']);
  const transparentChatSurface = toColor(
    useResolveClassNames('bg-chat-background/0').backgroundColor,
    chatSurfaceColor,
  );
  const transparentDefaultSurface = toColor(
    useResolveClassNames('bg-background/0').backgroundColor,
    defaultSurfaceColor,
  );

  const rowRef = useRef<ViewInstance>(null);
  const preview = useMemo(
    () => resolveDockDragPreview(pinnedTabs, dragState),
    [dragState, pinnedTabs],
  );
  const isChatSurface = activeDestination === 'chat';
  const fadeStartColor = isChatSurface ? transparentChatSurface : transparentDefaultSurface;
  const fadeEndColor = isChatSurface ? chatSurfaceColor : defaultSurfaceColor;

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

  if (shellMode !== 'compact-dock') {
    return null;
  }

  const maxWidth = resolveTabMaxWidth(preview.tabs.length);
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
      <LinearGradient
        colors={[fadeStartColor, fadeEndColor, fadeEndColor]}
        end={{ x: 0.5, y: 1 }}
        locations={isChatSurface ? [0, 0.25, 1] : [0, 0.38, 1]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={{
          bottom: 0,
          left: 0,
          position: 'absolute',
          right: 0,
          top: isChatSurface ? 0 : -18,
        }}
      />
      <NavDragStatusPill
        containerClassName="items-center"
        dragState={dragState}
        pillTestID="floating-dock-status-pill"
        preview={preview}
        style={{ bottom: 58 + bottomPadding, left: 16, position: 'absolute', right: 16 }}
      />
      <View className="relative" pointerEvents="box-none">
        {trayClassName ? (
          <View
            pointerEvents="none"
            style={{ bottom: -6, left: 12, position: 'absolute', right: 12, top: -6 }}
          >
            <Surface shape="pill">
              <View className={trayClassName} testID="floating-dock-drop-tray" />
            </Surface>
          </View>
        ) : null}
        <View
          ref={rowRef}
          className="flex-row items-center justify-center gap-2.5 px-4"
          onLayout={handleRowLayout}
          pointerEvents={isDockVisible ? 'auto' : 'none'}
        >
          <NavTabStrip
            activeDockTab={activeDockTab}
            dragState={dragState}
            foregroundColor={foregroundColor}
            maxItemWidth={maxWidth}
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
