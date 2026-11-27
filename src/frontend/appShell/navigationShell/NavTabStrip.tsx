import { Surface } from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { duration, easing, spring } from '@cherrystudio/ui/motion';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import {
  type DockDragPreviewState,
  getNavTitleKey,
  type NavDestinationId,
  type NavTabId,
} from './dockTabs';
import { NavIcon } from './NavIcon';
import type { DockRect, NavDragState } from './state';
import { usePinDragGesture } from './usePinDragGesture';

export const navChromeTimingConfig = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

export const navTabLayout = LinearTransition.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
export const navPreviewEnter = ZoomIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const navPillEnter = FadeIn.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);
const navPillExit = FadeOut.duration(duration.fast)
  .easing(easing.settle)
  .reduceMotion(ReduceMotion.System);

/**
 * Horizontal bottom-dock pill & icon motion:
 * - Active pill fill and outline/filled icon cross-fade run on the UI thread via opacity
 *   (`150ms` enter / `120ms` exit, `easing.settle`), keeping Android rounded corners uncollapsed
 *   (`#1899`) and allowing immediate mid-flight interruption on rapid tab switches.
 * - Tactile press-in (`1 -> 0.9`, `100ms`) responds on pointer down and recovers with
 *   `spring.tactile`; inactive-to-active switches add a subtle `0.92 -> 1` `spring.morph` settle.
 *   Both scale animations degrade to static swaps when Reduce Motion is enabled.
 */
const HORIZONTAL_PILL_ENTER_TIMING = {
  duration: 150,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;
const HORIZONTAL_PILL_EXIT_TIMING = {
  duration: 120,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;
const HORIZONTAL_PRESS_IN_TIMING = {
  duration: 100,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;
const HORIZONTAL_PRESS_OUT_TIMING = {
  duration: 180,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;
const HORIZONTAL_ICON_PRESS_SCALE = 0.9;
const HORIZONTAL_ICON_ACTIVATION_START_SCALE = 0.92;
const HORIZONTAL_ICON_PRESS_OUT_SPRING = {
  ...spring.tactile,
  reduceMotion: ReduceMotion.System,
} as const;
const HORIZONTAL_ICON_ACTIVATION_SPRING = {
  ...spring.morph,
  reduceMotion: ReduceMotion.System,
} as const;

const COLLAPSED_DETACHED_STYLE: ViewStyle = {
  height: 1,
  left: 0,
  opacity: 0,
  overflow: 'hidden',
  position: 'absolute',
  top: 0,
  width: 1,
};

const NOOP = () => undefined;

type DragStatusBanner = {
  boxClassName: string;
  label: string;
  textClassName: string;
};

function resolveDragStatusBanner(
  dragState: NavDragState | null,
  canDrop: boolean,
  isFull: boolean,
  t: (key: string) => string,
): DragStatusBanner | null {
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

type NavDragStatusPillProps = {
  containerClassName?: string;
  dragState: NavDragState | null;
  pillTestID: string;
  preview: DockDragPreviewState;
  style: StyleProp<ViewStyle>;
};

/** Status pill anchored beside the floating dock or vertical rail while dragging. */
export function NavDragStatusPill({
  containerClassName,
  dragState,
  pillTestID,
  preview,
  style,
}: NavDragStatusPillProps) {
  const { t } = useTranslation();
  const statusBanner = resolveDragStatusBanner(dragState, preview.canDrop, preview.isFull, t);

  if (!statusBanner) {
    return null;
  }

  return (
    <Animated.View
      className={containerClassName}
      entering={navPillEnter}
      exiting={navPillExit}
      pointerEvents="none"
      style={style}
    >
      <Surface shape="pill">
        <View className={`px-3.5 py-1.5 ${statusBanner.boxClassName}`} testID={pillTestID}>
          <Text className={statusBanner.textClassName}>{statusBanner.label}</Text>
        </View>
      </Surface>
    </Animated.View>
  );
}

/** Measures the dock/rail capsule bounds in window coordinates whenever visibility or tab count updates. */
export function useMeasureNavBounds(
  containerRef: RefObject<ViewInstance | null>,
  enabled: boolean,
  tabCount: number,
  isDragging: boolean,
  registerDockRect: (rect: DockRect | null) => void,
) {
  const measureBounds = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        registerDockRect({ height, width, x, y });
      }
    });
  }, [containerRef, registerDockRect]);

  useEffect(() => {
    if (!enabled) return;
    measureBounds();
  }, [enabled, isDragging, measureBounds, tabCount]);

  return measureBounds;
}

type NavTabCapsuleProps = {
  color: string;
  filled: boolean;
  id: NavTabId;
  isActive: boolean;
  isDragPreview?: boolean;
};

function NavTabCapsule({ color, filled, id, isActive, isDragPreview = false }: NavTabCapsuleProps) {
  const capsuleClassName = 'h-11 w-11 items-center justify-center rounded-full';
  const stateClassName = isDragPreview
    ? 'bg-secondary-active border-border-selected border border-dashed'
    : isActive
      ? 'bg-secondary-active'
      : '';

  return (
    <View
      className={stateClassName ? `${capsuleClassName} ${stateClassName}` : capsuleClassName}
      collapsable={false}
    >
      <NavIcon color={color} filled={filled} id={id} size={22} />
    </View>
  );
}

type NavHorizontalTabButtonProps = {
  accessibilityLabel: string;
  foregroundColor: string;
  gesture?: ReturnType<typeof usePinDragGesture>;
  isActive: boolean;
  isDragPreview: boolean;
  isDraggingOut: boolean;
  mutedForegroundColor: string;
  onPress: () => void;
  rippleColor?: string;
  tabId: NavTabId;
  testIDPrefix: 'floating-nav' | 'vertical-rail';
};

function NavHorizontalTabButton({
  accessibilityLabel,
  foregroundColor,
  gesture,
  isActive,
  isDragPreview,
  isDraggingOut,
  mutedForegroundColor,
  onPress,
  rippleColor,
  tabId,
  testIDPrefix,
}: NavHorizontalTabButtonProps) {
  const isAndroid = Platform?.OS === 'android';
  const reducedMotion = useReducedMotion();
  const isVisualActive = isActive || isDragPreview;
  const activeProgress = useSharedValue(isVisualActive ? 1 : 0);
  const pressScale = useSharedValue(1);
  const activationScale = useSharedValue(1);
  const pressWashOpacity = useSharedValue(0);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    activeProgress.set(
      withTiming(
        isVisualActive ? 1 : 0,
        isVisualActive ? HORIZONTAL_PILL_ENTER_TIMING : HORIZONTAL_PILL_EXIT_TIMING,
      ),
    );
  }, [activeProgress, isVisualActive]);

  useEffect(() => {
    if (reducedMotion) {
      pressScale.set(1);
      activationScale.set(1);
      prevActiveRef.current = isActive;
      return;
    }
    if (isActive && !prevActiveRef.current) {
      activationScale.set(HORIZONTAL_ICON_ACTIVATION_START_SCALE);
      activationScale.set(withSpring(1, HORIZONTAL_ICON_ACTIVATION_SPRING));
    }
    prevActiveRef.current = isActive;
  }, [activationScale, isActive, pressScale, reducedMotion]);

  const handlePressIn = useCallback(() => {
    if (!reducedMotion) {
      pressScale.set(withTiming(HORIZONTAL_ICON_PRESS_SCALE, HORIZONTAL_PRESS_IN_TIMING));
    }
    if (!isAndroid) {
      pressWashOpacity.set(withTiming(1, HORIZONTAL_PRESS_IN_TIMING));
    }
  }, [isAndroid, pressScale, pressWashOpacity, reducedMotion]);

  const handlePressOut = useCallback(() => {
    if (!reducedMotion) {
      pressScale.set(withSpring(1, HORIZONTAL_ICON_PRESS_OUT_SPRING));
    } else {
      pressScale.set(1);
    }
    if (!isAndroid) {
      pressWashOpacity.set(withTiming(0, HORIZONTAL_PRESS_OUT_TIMING));
    }
  }, [isAndroid, pressScale, pressWashOpacity, reducedMotion]);

  const handlePress = useCallback(() => {
    if (!isActive && !isDraggingOut) {
      haptics.selection();
    }
    onPress();
  }, [isActive, isDraggingOut, onPress]);

  const activePillStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.get(),
  }));

  const pressWashStyle = useAnimatedStyle(() => ({
    opacity: pressWashOpacity.get() * 0.75,
  }));

  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() * activationScale.get() }],
  }));

  const outlineIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeProgress.get(),
  }));

  const filledIconStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.get(),
  }));

  const pill = (
    <View className="h-[46px] w-full overflow-hidden rounded-full" collapsable={false}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        android_ripple={
          isAndroid && rippleColor
            ? { borderless: false, color: rippleColor, foreground: true }
            : undefined
        }
        className={`h-full w-full items-center justify-center rounded-full ${
          isDraggingOut ? 'opacity-35' : ''
        }`}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={`${testIDPrefix}-tab-${tabId}`}
      >
        <Animated.View
          className="bg-secondary dark:bg-secondary-active absolute inset-0 rounded-full"
          collapsable={false}
          pointerEvents="none"
          style={activePillStyle}
          testID={`${testIDPrefix}-active-pill-${tabId}`}
        />
        {!isAndroid ? (
          <Animated.View
            className="bg-secondary dark:bg-secondary-active absolute inset-0 rounded-full"
            pointerEvents="none"
            style={pressWashStyle}
            testID={`${testIDPrefix}-press-wash-${tabId}`}
          />
        ) : null}
        {isDragPreview ? (
          <View
            className="border-border-selected absolute inset-0 rounded-full border border-dashed"
            pointerEvents="none"
            testID={`${testIDPrefix}-dashed-border-${tabId}`}
          />
        ) : null}
        <Animated.View
          className="h-6 w-6 items-center justify-center"
          pointerEvents="none"
          style={iconScaleStyle}
        >
          <Animated.View
            className="absolute inset-0 items-center justify-center"
            style={outlineIconStyle}
          >
            <NavIcon
              color={mutedForegroundColor}
              filled={false}
              id={tabId}
              size={24}
              strokeWidth={2}
            />
          </Animated.View>
          <Animated.View
            className="absolute inset-0 items-center justify-center"
            style={filledIconStyle}
          >
            <NavIcon color={foregroundColor} filled id={tabId} size={24} strokeWidth={2} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );

  return gesture ? <GestureDetector gesture={gesture}>{pill}</GestureDetector> : pill;
}

type NavMiddleTabButtonProps = {
  accessibilityLabel: string;
  buttonSizeClass: string;
  foregroundColor: string;
  isActive: boolean;
  isDragPreview: boolean;
  isDraggingOut: boolean;
  mutedForegroundColor: string;
  onPress: () => void;
  orientation: 'horizontal' | 'vertical';
  rippleColor?: string;
  tabId: NavigationPinTabId;
  testIDPrefix: 'floating-nav' | 'vertical-rail';
};

function NavMiddleTabButton({
  accessibilityLabel,
  buttonSizeClass,
  foregroundColor,
  isActive,
  isDragPreview,
  isDraggingOut,
  mutedForegroundColor,
  onPress,
  orientation,
  rippleColor,
  tabId,
  testIDPrefix,
}: NavMiddleTabButtonProps) {
  const panGesture = usePinDragGesture(tabId, 'dock');

  if (orientation === 'horizontal') {
    return (
      <NavHorizontalTabButton
        accessibilityLabel={accessibilityLabel}
        foregroundColor={foregroundColor}
        gesture={panGesture}
        isActive={isActive}
        isDragPreview={isDragPreview}
        isDraggingOut={isDraggingOut}
        mutedForegroundColor={mutedForegroundColor}
        onPress={onPress}
        rippleColor={rippleColor}
        tabId={tabId}
        testIDPrefix={testIDPrefix}
      />
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        className={`${buttonSizeClass} items-center justify-center rounded-full ${
          isDraggingOut ? 'opacity-35' : ''
        }`}
        onPress={onPress}
        testID={`${testIDPrefix}-tab-${tabId}`}
      >
        <NavTabCapsule
          color={isActive || isDragPreview ? foregroundColor : mutedForegroundColor}
          filled={isActive || isDragPreview}
          id={tabId}
          isActive={isActive}
          isDragPreview={isDragPreview}
        />
      </Pressable>
    </GestureDetector>
  );
}

type NavTabStripProps = {
  activeDockTab: NavTabId | undefined;
  dragState: NavDragState | null;
  foregroundColor: string;
  maxItemWidth?: number;
  mutedForegroundColor: string;
  onSelectDestination: (id: NavDestinationId) => void;
  orientation: 'horizontal' | 'vertical';
  pinnedTabs: readonly NavigationPinTabId[];
  preview: DockDragPreviewState;
  rippleColor?: string;
  testIDPrefix: 'floating-nav' | 'vertical-rail';
};

/**
 * Shared dock/rail tab sequence: bookends (`chat`/`more`), draggable middle tabs, and
 * in-place drag-out concealment so active `GestureDetector` instances never unmount mid-gesture.
 */
export function NavTabStrip({
  activeDockTab,
  dragState,
  foregroundColor,
  maxItemWidth,
  mutedForegroundColor,
  onSelectDestination,
  orientation,
  pinnedTabs,
  preview,
  rippleColor,
  testIDPrefix,
}: NavTabStripProps) {
  const { t } = useTranslation();
  const isHorizontal = orientation === 'horizontal';
  const itemWrapperClassName = isHorizontal
    ? 'flex-1 max-w-[100px] items-center justify-center'
    : undefined;
  const itemWrapperStyle = maxItemWidth !== undefined ? { maxWidth: maxItemWidth } : undefined;
  const buttonSizeClass = 'h-11 w-11';
  const isDragOutUnpinning =
    dragState?.source === 'dock' && dragState.draggingOut && !preview.tabs.includes(dragState.id);

  const renderedTabs = useMemo(() => {
    const items = preview.tabs.map((id) => ({ detached: false, id }));
    if (isDragOutUnpinning && dragState) {
      const originalMiddleIndex = pinnedTabs.indexOf(dragState.id);
      const insertAt = Math.min(items.length, Math.max(1, originalMiddleIndex + 1));
      items.splice(insertAt, 0, { detached: true, id: dragState.id });
    }
    return items;
  }, [dragState, isDragOutUnpinning, pinnedTabs, preview.tabs]);

  return (
    <>
      {renderedTabs.map(({ detached, id: tabId }) => {
        const isActive = !detached && activeDockTab === tabId;
        const label = t(getNavTitleKey(tabId));
        const handlePress = () => onSelectDestination(tabId);

        if (!detached && tabId === preview.previewTabId && dragState?.source === 'more') {
          return (
            <Animated.View
              key={tabId}
              className={itemWrapperClassName}
              entering={navPreviewEnter}
              layout={navTabLayout}
              style={itemWrapperStyle}
              testID={`${testIDPrefix}-preview-${tabId}`}
            >
              {isHorizontal ? (
                <View
                  className="bg-secondary dark:bg-secondary-active h-[46px] w-full items-center justify-center overflow-hidden rounded-full"
                  collapsable={false}
                >
                  <View
                    className="border-border-selected absolute inset-0 rounded-full border border-dashed"
                    pointerEvents="none"
                    testID={`${testIDPrefix}-dashed-border-${tabId}`}
                  />
                  <NavIcon color={foregroundColor} filled id={tabId} size={24} strokeWidth={2} />
                </View>
              ) : (
                <View className={`${buttonSizeClass} items-center justify-center`}>
                  <NavTabCapsule color={foregroundColor} filled id={tabId} isActive isDragPreview />
                </View>
              )}
            </Animated.View>
          );
        }

        if (tabId === 'chat' || tabId === 'more') {
          return (
            <Animated.View
              key={tabId}
              className={itemWrapperClassName}
              layout={navTabLayout}
              style={itemWrapperStyle}
            >
              {isHorizontal ? (
                <NavHorizontalTabButton
                  accessibilityLabel={label}
                  foregroundColor={foregroundColor}
                  isActive={isActive}
                  isDragPreview={false}
                  isDraggingOut={false}
                  mutedForegroundColor={mutedForegroundColor}
                  onPress={handlePress}
                  rippleColor={rippleColor}
                  tabId={tabId}
                  testIDPrefix={testIDPrefix}
                />
              ) : (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  className={`${buttonSizeClass} items-center justify-center rounded-full`}
                  onPress={handlePress}
                  testID={`${testIDPrefix}-tab-${tabId}`}
                >
                  <NavTabCapsule
                    color={isActive ? foregroundColor : mutedForegroundColor}
                    filled={isActive}
                    id={tabId}
                    isActive={isActive}
                  />
                </Pressable>
              )}
            </Animated.View>
          );
        }

        const isDockDragPreview =
          !detached &&
          dragState?.source === 'dock' &&
          dragState.id === tabId &&
          !dragState.draggingOut;

        return (
          <Animated.View
            key={tabId}
            className={detached ? undefined : itemWrapperClassName}
            layout={detached ? undefined : navTabLayout}
            style={detached ? COLLAPSED_DETACHED_STYLE : itemWrapperStyle}
            testID={detached ? `${testIDPrefix}-detached-${tabId}` : undefined}
          >
            <NavMiddleTabButton
              accessibilityLabel={label}
              buttonSizeClass={buttonSizeClass}
              foregroundColor={foregroundColor}
              isActive={isActive}
              isDragPreview={isDockDragPreview}
              isDraggingOut={detached}
              mutedForegroundColor={mutedForegroundColor}
              onPress={detached ? NOOP : handlePress}
              orientation={orientation}
              rippleColor={rippleColor}
              tabId={tabId}
              testIDPrefix={testIDPrefix}
            />
          </Animated.View>
        );
      })}
    </>
  );
}
