import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type ViewInstance } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { getNavTitleKey, type NavTabId, resolveDockTabs } from './dockTabs';
import { NavIcon } from './NavIcon';
import { resolveFloatingDockBottomPadding } from './shellMode';
import { useNavigationShell } from './state';
import { usePinDragGesture } from './usePinDragGesture';

function toColor(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function resolveTabMaxWidth(totalCount: number): number {
  if (totalCount <= 3) return 100;
  if (totalCount === 4) return 80;
  return 66;
}

type DockMiddleTabGestureProps = {
  accessibilityLabel: string;
  foregroundColor: string;
  isActive: boolean;
  isDraggingOut: boolean;
  maxWidth: number;
  mutedForegroundColor: string;
  onPress: () => void;
  tabId: NavigationPinTabId;
};

function DockMiddleTabButton({
  accessibilityLabel,
  foregroundColor,
  isActive,
  isDraggingOut,
  maxWidth,
  mutedForegroundColor,
  onPress,
  tabId,
}: DockMiddleTabGestureProps) {
  const panGesture = usePinDragGesture(tabId, 'dock');

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        className={`h-11 flex-1 items-center justify-center rounded-full ${
          isActive ? 'bg-secondary-active' : ''
        } ${isDraggingOut ? 'opacity-35' : ''}`}
        onPress={onPress}
        style={{ maxWidth }}
        testID={`floating-nav-tab-${tabId}`}
      >
        <NavIcon
          color={isActive ? foregroundColor : mutedForegroundColor}
          filled={isActive}
          id={tabId}
          size={22}
        />
      </Pressable>
    </GestureDetector>
  );
}

/** Borderless ChatGPT-style bottom floating navigation dock for compact windows. */
export function FloatingNavDock() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    activeDestination,
    activeDockTab,
    dragState,
    isAtRoot,
    isDockVisible,
    navigateToDestination,
    pinnedTabs,
    registerDockRect,
    reportDockHeight,
    shellMode,
  } = useNavigationShell();

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
  const tabs = useMemo(() => resolveDockTabs(pinnedTabs), [pinnedTabs]);
  const isChatSurface = activeDestination === 'chat';
  const fadeStartColor = isChatSurface ? transparentChatSurface : transparentDefaultSurface;
  const fadeEndColor = isChatSurface ? chatSurfaceColor : defaultSurfaceColor;

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isDockVisible ? 1 : 0, { duration: 160 }),
    transform: [{ translateY: withTiming(isDockVisible ? 0 : 20, { duration: 180 }) }],
  }));

  const measureDockBounds = useCallback(() => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        registerDockRect({ height, width, x, y });
      }
    });
  }, [registerDockRect]);

  const handleRowLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      reportDockHeight(event.nativeEvent.layout.height);
      measureDockBounds();
    },
    [measureDockBounds, reportDockHeight],
  );

  if (shellMode !== 'compact-dock' || !isAtRoot) {
    return null;
  }

  const maxWidth = resolveTabMaxWidth(tabs.length);
  const bottomPadding = resolveFloatingDockBottomPadding(insets.bottom);

  return (
    <Animated.View
      accessibilityRole="tablist"
      className="absolute right-0 bottom-0 left-0 z-20"
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
      <View
        ref={rowRef}
        className="flex-row items-center justify-center gap-2.5 px-4"
        onLayout={handleRowLayout}
        pointerEvents={isDockVisible ? 'auto' : 'none'}
      >
        {tabs.map((tabId: NavTabId, index) => {
          const isActive = activeDockTab === tabId;
          const label = t(getNavTitleKey(tabId));
          const handlePress = () => navigateToDestination(tabId);
          const showInsertIndicator =
            dragState?.source === 'more' &&
            dragState.overDock &&
            index === dragState.insertIndex + 1;

          if (tabId === 'chat' || tabId === 'more') {
            return (
              <Pressable
                key={tabId}
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                className={`h-11 flex-1 items-center justify-center rounded-full ${
                  isActive ? 'bg-secondary-active' : ''
                }`}
                onPress={handlePress}
                style={{ maxWidth }}
                testID={`floating-nav-tab-${tabId}`}
              >
                <NavIcon
                  color={isActive ? foregroundColor : mutedForegroundColor}
                  filled={isActive}
                  id={tabId}
                  size={22}
                />
              </Pressable>
            );
          }

          return (
            <View
              key={tabId}
              className="flex-1 flex-row items-center justify-center"
              style={{ maxWidth }}
            >
              {showInsertIndicator ? (
                <View className="bg-secondary-active border-border-selected mr-1 h-10 w-1.5 rounded-full border" />
              ) : null}
              <DockMiddleTabButton
                accessibilityLabel={label}
                foregroundColor={foregroundColor}
                isActive={isActive}
                isDraggingOut={
                  dragState?.source === 'dock' && dragState.id === tabId && dragState.draggingOut
                }
                maxWidth={maxWidth}
                mutedForegroundColor={mutedForegroundColor}
                onPress={handlePress}
                tabId={tabId}
              />
            </View>
          );
        })}
        {dragState?.source === 'more' &&
        dragState.overDock &&
        dragState.insertIndex >= tabs.length - 2 ? (
          <View className="bg-secondary-active border-border-selected h-10 w-1.5 rounded-full border" />
        ) : null}
      </View>
    </Animated.View>
  );
}
