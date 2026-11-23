import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type ViewInstance } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { getNavTitleKey, type NavTabId, resolveDockDragPreview } from './dockTabs';
import { NavIcon } from './NavIcon';
import { resolveFloatingDockBottomPadding } from './shellMode';
import { useNavigationShell } from './state';
import { usePinDragGesture } from './usePinDragGesture';

const dockTabLayout = LinearTransition.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const dockPreviewEnter = ZoomIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const dockPillEnter = FadeIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const dockPillExit = FadeOut.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

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
  isDragPreview: boolean;
  isDraggingOut: boolean;
  mutedForegroundColor: string;
  onPress: () => void;
  tabId: NavigationPinTabId;
};

function DockMiddleTabButton({
  accessibilityLabel,
  foregroundColor,
  isActive,
  isDragPreview,
  isDraggingOut,
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
        className={`h-11 w-full items-center justify-center rounded-full ${
          isDragPreview
            ? 'bg-secondary-active border-border-selected border border-dashed'
            : isActive
              ? 'bg-secondary-active'
              : ''
        } ${isDraggingOut ? 'opacity-35' : ''}`}
        onPress={onPress}
        testID={`floating-nav-tab-${tabId}`}
      >
        <NavIcon
          color={isActive || isDragPreview ? foregroundColor : mutedForegroundColor}
          filled={isActive || isDragPreview}
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
  const preview = useMemo(
    () => resolveDockDragPreview(pinnedTabs, dragState),
    [dragState, pinnedTabs],
  );
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

  const isDragging = Boolean(dragState);
  useEffect(() => {
    if (!isDockVisible || shellMode !== 'compact-dock' || !isAtRoot) return;
    measureDockBounds();
  }, [isAtRoot, isDockVisible, isDragging, measureDockBounds, preview.tabs.length, shellMode]);

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

  const maxWidth = resolveTabMaxWidth(preview.tabs.length);
  const bottomPadding = resolveFloatingDockBottomPadding(insets.bottom);

  const trayClassName = !dragState
    ? null
    : dragState.overDock && preview.canDrop
      ? 'h-14 w-full rounded-full bg-secondary/25'
      : dragState.overDock && preview.isFull
        ? 'h-14 w-full rounded-full bg-secondary/50'
        : dragState.source === 'more'
          ? 'h-14 w-full rounded-full bg-secondary/10'
          : 'h-14 w-full rounded-full';

  const statusBanner =
    dragState?.source === 'more' && dragState.overDock && preview.canDrop
      ? {
          boxClassName: '',
          label: t('navigation.dropToPin'),
          textClassName: 'text-foreground text-xs font-medium',
        }
      : dragState?.source === 'more' && dragState.overDock && preview.isFull
        ? {
            boxClassName: 'bg-secondary/40',
            label: t('navigation.dockFullToast'),
            textClassName: 'text-muted-foreground text-xs font-medium',
          }
        : dragState?.source === 'dock' && dragState.draggingOut
          ? {
              boxClassName: '',
              label: t('navigation.dropToUnpin'),
              textClassName: 'text-foreground text-xs font-medium',
            }
          : null;

  const isDragOutUnpinning =
    dragState?.source === 'dock' && dragState.draggingOut && !preview.tabs.includes(dragState.id);

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
      {statusBanner ? (
        <Animated.View
          className="items-center"
          entering={dockPillEnter}
          exiting={dockPillExit}
          pointerEvents="none"
          style={{ bottom: 58 + bottomPadding, left: 16, position: 'absolute', right: 16 }}
        >
          <Surface shape="pill">
            <View
              className={`px-3.5 py-1.5 ${statusBanner.boxClassName}`}
              testID="floating-dock-status-pill"
            >
              <Text className={statusBanner.textClassName}>{statusBanner.label}</Text>
            </View>
          </Surface>
        </Animated.View>
      ) : null}
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
          {preview.tabs.map((tabId: NavTabId) => {
            const isActive = activeDockTab === tabId;
            const label = t(getNavTitleKey(tabId));
            const handlePress = () => navigateToDestination(tabId);

            if (tabId === preview.previewTabId && dragState?.source === 'more') {
              return (
                <Animated.View
                  key={tabId}
                  className="flex-1 items-center justify-center"
                  entering={dockPreviewEnter}
                  layout={dockTabLayout}
                  style={{ maxWidth }}
                  testID={`floating-nav-preview-${tabId}`}
                >
                  <View className="bg-secondary-active border-border-selected h-11 w-full items-center justify-center rounded-full border border-dashed">
                    <NavIcon color={foregroundColor} filled id={tabId} size={22} />
                  </View>
                </Animated.View>
              );
            }

            if (tabId === 'chat' || tabId === 'more') {
              return (
                <Animated.View
                  key={tabId}
                  className="flex-1 items-center justify-center"
                  layout={dockTabLayout}
                  style={{ maxWidth }}
                >
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    className={`h-11 w-full items-center justify-center rounded-full ${
                      isActive ? 'bg-secondary-active' : ''
                    }`}
                    onPress={handlePress}
                    testID={`floating-nav-tab-${tabId}`}
                  >
                    <NavIcon
                      color={isActive ? foregroundColor : mutedForegroundColor}
                      filled={isActive}
                      id={tabId}
                      size={22}
                    />
                  </Pressable>
                </Animated.View>
              );
            }

            const isDockDragPreview =
              dragState?.source === 'dock' && dragState.id === tabId && !dragState.draggingOut;

            return (
              <Animated.View
                key={tabId}
                className="flex-1 items-center justify-center"
                layout={dockTabLayout}
                style={{ maxWidth }}
              >
                <DockMiddleTabButton
                  accessibilityLabel={label}
                  foregroundColor={foregroundColor}
                  isActive={isActive}
                  isDragPreview={isDockDragPreview}
                  isDraggingOut={false}
                  mutedForegroundColor={mutedForegroundColor}
                  onPress={handlePress}
                  tabId={tabId}
                />
              </Animated.View>
            );
          })}
          {isDragOutUnpinning ? (
            <Animated.View
              key={dragState.id}
              layout={dockTabLayout}
              style={{ height: 0, opacity: 0, overflow: 'hidden', width: 0 }}
              testID={`floating-nav-detached-${dragState.id}`}
            >
              <DockMiddleTabButton
                accessibilityLabel={t(getNavTitleKey(dragState.id))}
                foregroundColor={foregroundColor}
                isActive={false}
                isDragPreview={false}
                isDraggingOut
                mutedForegroundColor={mutedForegroundColor}
                onPress={() => undefined}
                tabId={dragState.id}
              />
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
