import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
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

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { getNavTitleKey, type NavTabId, resolveDockDragPreview } from './dockTabs';
import { NavIcon } from './NavIcon';
import { VERTICAL_RAIL_WIDTH } from './shellMode';
import { type NavDragState, useNavigationShell } from './state';
import { usePinDragGesture } from './usePinDragGesture';

const railTabLayout = LinearTransition.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const railPreviewEnter = ZoomIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const railPillEnter = FadeIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const railPillExit = FadeOut.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

function resolveDragStatusBanner(
  dragState: NavDragState | null,
  canDrop: boolean,
  isFull: boolean,
  t: (key: string) => string,
): { boxClassName: string; label: string; textClassName: string } | null {
  if (dragState?.source === 'more' && dragState.overDock && canDrop) {
    return {
      boxClassName: '',
      label: t('navigation.dropToPin'),
      textClassName: 'text-foreground text-xs font-medium',
    };
  }
  if (dragState?.source === 'more' && dragState.overDock && isFull) {
    return {
      boxClassName: 'bg-secondary/40',
      label: t('navigation.dockFullToast'),
      textClassName: 'text-muted-foreground text-xs font-medium',
    };
  }
  if (dragState?.source === 'dock' && dragState.draggingOut) {
    return {
      boxClassName: '',
      label: t('navigation.dropToUnpin'),
      textClassName: 'text-foreground text-xs font-medium',
    };
  }
  return null;
}

type RailMiddleTabButtonProps = {
  accessibilityLabel: string;
  foregroundColor: string;
  isActive: boolean;
  isDragPreview: boolean;
  isDraggingOut: boolean;
  mutedForegroundColor: string;
  onPress: () => void;
  tabId: NavigationPinTabId;
};

function RailMiddleTabButton({
  accessibilityLabel,
  foregroundColor,
  isActive,
  isDragPreview,
  isDraggingOut,
  mutedForegroundColor,
  onPress,
  tabId,
}: RailMiddleTabButtonProps) {
  const panGesture = usePinDragGesture(tabId, 'dock');

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        className={`h-11 w-11 items-center justify-center rounded-full ${
          isDragPreview
            ? 'bg-secondary-active border-border-selected border border-dashed'
            : isActive
              ? 'bg-secondary-active'
              : ''
        } ${isDraggingOut ? 'opacity-35' : ''}`}
        onPress={onPress}
        testID={`vertical-rail-tab-${tabId}`}
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

/**
 * Transparent trailing vertical rail overlay for foldable screens whose OS system bar runs down
 * the trailing edge, leaving top native toolbar actions visible above the bottom glass capsule.
 */
export function VerticalNavRail() {
  const { t } = useTranslation();
  const outerInsets = useSafeAreaInsets();
  const {
    activeDockTab,
    dragState,
    isAtRoot,
    isVerticalRailVisible,
    navigateToDestination,
    pinnedTabs,
    registerDockRect,
    shellMode,
  } = useNavigationShell();
  const [foregroundColor, mutedForegroundColor] = useThemeColor(['foreground', 'muted-foreground']);
  const capsuleRef = useRef<ViewInstance>(null);

  const preview = useMemo(
    () => resolveDockDragPreview(pinnedTabs, dragState),
    [dragState, pinnedTabs],
  );

  const animatedCapsuleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isVerticalRailVisible ? 1 : 0, { duration: 160 }),
    transform: [{ translateX: withTiming(isVerticalRailVisible ? 0 : 20, { duration: 180 }) }],
  }));

  const measureCapsuleBounds = useCallback(() => {
    capsuleRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        registerDockRect({ height, width, x, y });
      }
    });
  }, [registerDockRect]);

  const isDragging = Boolean(dragState);
  useEffect(() => {
    if (!isVerticalRailVisible || shellMode !== 'vertical-rail' || !isAtRoot) return;
    measureCapsuleBounds();
  }, [
    isAtRoot,
    isDragging,
    isVerticalRailVisible,
    measureCapsuleBounds,
    preview.tabs.length,
    shellMode,
  ]);

  if (shellMode !== 'vertical-rail' || !isAtRoot) {
    return null;
  }

  const railWidth = outerInsets.right > 0 ? outerInsets.right : VERTICAL_RAIL_WIDTH;
  const bottomPadding = Math.max(outerInsets.bottom, 18);
  const statusBanner = resolveDragStatusBanner(dragState, preview.canDrop, preview.isFull, t);
  const isDragOutUnpinning =
    dragState?.source === 'dock' && dragState.draggingOut && !preview.tabs.includes(dragState.id);

  return (
    <View
      accessibilityRole="tablist"
      className="absolute top-0 right-0 bottom-0 z-20"
      pointerEvents="box-none"
      style={{ width: railWidth }}
      testID="vertical-nav-rail"
    >
      <View
        className="bg-sidebar-border absolute top-0 bottom-0 left-0"
        pointerEvents="none"
        style={{ width: StyleSheet.hairlineWidth }}
        testID="vertical-nav-rail-divider"
      />
      {statusBanner ? (
        <Animated.View
          entering={railPillEnter}
          exiting={railPillExit}
          pointerEvents="none"
          style={{ bottom: bottomPadding + 8, position: 'absolute', right: railWidth + 10 }}
        >
          <Surface shape="pill">
            <View
              className={`px-3.5 py-1.5 ${statusBanner.boxClassName}`}
              testID="vertical-rail-status-pill"
            >
              <Text className={statusBanner.textClassName}>{statusBanner.label}</Text>
            </View>
          </Surface>
        </Animated.View>
      ) : null}
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
            {preview.tabs.map((tabId: NavTabId) => {
              const isActive = activeDockTab === tabId;
              const label = t(getNavTitleKey(tabId));
              const handlePress = () => navigateToDestination(tabId);

              if (tabId === preview.previewTabId && dragState?.source === 'more') {
                return (
                  <Animated.View
                    key={tabId}
                    entering={railPreviewEnter}
                    layout={railTabLayout}
                    testID={`vertical-rail-preview-${tabId}`}
                  >
                    <View className="bg-secondary-active border-border-selected h-11 w-11 items-center justify-center rounded-full border border-dashed">
                      <NavIcon color={foregroundColor} filled id={tabId} size={22} />
                    </View>
                  </Animated.View>
                );
              }

              if (tabId === 'chat' || tabId === 'more') {
                return (
                  <Animated.View key={tabId} layout={railTabLayout}>
                    <Pressable
                      accessibilityLabel={label}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      className={`h-11 w-11 items-center justify-center rounded-full ${
                        isActive ? 'bg-secondary-active' : ''
                      }`}
                      onPress={handlePress}
                      testID={`vertical-rail-tab-${tabId}`}
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
                <Animated.View key={tabId} layout={railTabLayout}>
                  <RailMiddleTabButton
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
                layout={railTabLayout}
                style={{ height: 0, opacity: 0, overflow: 'hidden', width: 0 }}
                testID={`vertical-rail-detached-${dragState.id}`}
              >
                <RailMiddleTabButton
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
        </Surface>
      </Animated.View>
    </View>
  );
}
