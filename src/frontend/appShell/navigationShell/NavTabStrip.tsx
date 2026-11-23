import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { type RefObject, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
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

const COLLAPSED_DETACHED_STYLE: ViewStyle = {
  height: 0,
  opacity: 0,
  overflow: 'hidden',
  width: 0,
};

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

type NavMiddleTabButtonProps = {
  accessibilityLabel: string;
  buttonSizeClass: string;
  foregroundColor: string;
  isActive: boolean;
  isDragPreview: boolean;
  isDraggingOut: boolean;
  mutedForegroundColor: string;
  onPress: () => void;
  tabId: NavigationPinTabId;
  testIDPrefix: string;
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
  tabId,
  testIDPrefix,
}: NavMiddleTabButtonProps) {
  const panGesture = usePinDragGesture(tabId, 'dock');

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        className={`${buttonSizeClass} items-center justify-center rounded-full ${
          isDragPreview
            ? 'bg-secondary-active border-border-selected border border-dashed'
            : isActive
              ? 'bg-secondary-active'
              : ''
        } ${isDraggingOut ? 'opacity-35' : ''}`}
        onPress={onPress}
        testID={`${testIDPrefix}-tab-${tabId}`}
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

type NavTabStripProps = {
  activeDockTab: NavTabId | undefined;
  dragState: NavDragState | null;
  foregroundColor: string;
  maxItemWidth?: number;
  mutedForegroundColor: string;
  onSelectDestination: (id: NavDestinationId) => void;
  orientation: 'horizontal' | 'vertical';
  preview: DockDragPreviewState;
  testIDPrefix: 'floating-nav' | 'vertical-rail';
};

/** Shared dock/rail tab sequence: bookends (`chat`/`more`), draggable middle tabs, and drag-out cleanup. */
export function NavTabStrip({
  activeDockTab,
  dragState,
  foregroundColor,
  maxItemWidth,
  mutedForegroundColor,
  onSelectDestination,
  orientation,
  preview,
  testIDPrefix,
}: NavTabStripProps) {
  const { t } = useTranslation();
  const isHorizontal = orientation === 'horizontal';
  const itemWrapperClassName = isHorizontal ? 'flex-1 items-center justify-center' : undefined;
  const itemWrapperStyle = maxItemWidth !== undefined ? { maxWidth: maxItemWidth } : undefined;
  const buttonSizeClass = isHorizontal ? 'h-11 w-full' : 'h-11 w-11';
  const isDragOutUnpinning =
    dragState?.source === 'dock' && dragState.draggingOut && !preview.tabs.includes(dragState.id);

  return (
    <>
      {preview.tabs.map((tabId: NavTabId) => {
        const isActive = activeDockTab === tabId;
        const label = t(getNavTitleKey(tabId));
        const handlePress = () => onSelectDestination(tabId);

        if (tabId === preview.previewTabId && dragState?.source === 'more') {
          return (
            <Animated.View
              key={tabId}
              className={itemWrapperClassName}
              entering={navPreviewEnter}
              layout={navTabLayout}
              style={itemWrapperStyle}
              testID={`${testIDPrefix}-preview-${tabId}`}
            >
              <View
                className={`${buttonSizeClass} bg-secondary-active border-border-selected items-center justify-center rounded-full border border-dashed`}
              >
                <NavIcon color={foregroundColor} filled id={tabId} size={22} />
              </View>
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
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                className={`${buttonSizeClass} items-center justify-center rounded-full ${
                  isActive ? 'bg-secondary-active' : ''
                }`}
                onPress={handlePress}
                testID={`${testIDPrefix}-tab-${tabId}`}
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
            className={itemWrapperClassName}
            layout={navTabLayout}
            style={itemWrapperStyle}
          >
            <NavMiddleTabButton
              accessibilityLabel={label}
              buttonSizeClass={buttonSizeClass}
              foregroundColor={foregroundColor}
              isActive={isActive}
              isDragPreview={isDockDragPreview}
              isDraggingOut={false}
              mutedForegroundColor={mutedForegroundColor}
              onPress={handlePress}
              tabId={tabId}
              testIDPrefix={testIDPrefix}
            />
          </Animated.View>
        );
      })}
      {isDragOutUnpinning ? (
        <Animated.View
          key={dragState.id}
          layout={navTabLayout}
          style={COLLAPSED_DETACHED_STYLE}
          testID={`${testIDPrefix}-detached-${dragState.id}`}
        >
          <NavMiddleTabButton
            accessibilityLabel={t(getNavTitleKey(dragState.id))}
            buttonSizeClass={buttonSizeClass}
            foregroundColor={foregroundColor}
            isActive={false}
            isDragPreview={false}
            isDraggingOut
            mutedForegroundColor={mutedForegroundColor}
            onPress={() => undefined}
            tabId={dragState.id}
            testIDPrefix={testIDPrefix}
          />
        </Animated.View>
      ) : null}
    </>
  );
}
