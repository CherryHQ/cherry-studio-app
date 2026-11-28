import * as Haptics from 'expo-haptics';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  StyleSheet,
  View,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeOut,
  ReduceMotion,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ProviderAvatar } from '@/frontend/components/Avatar';

import {
  type ModelPickerFastScrollAnchor,
  modelPickerFastScrollIndexAtPosition,
} from '../utils/modelPickerFastScroll';
import { ModelPickerBackdrop } from './ModelPickerBackdrop';
import { ModelPickerProviderPreview } from './ModelPickerProviderPreview';

const RAIL_INSET = 8;
const NAVIGATION_ITEM_HEIGHT = 48;
const MAXIMUM_PROVIDER_ICON_SIZE = 20;
const LONG_PRESS_DURATION_MS = 500;
const accessibilityActions = [{ name: 'increment' }, { name: 'decrement' }] as const;
// Press feedback appears immediately; only release fades, with a reduced-motion fallback.
const providerPreviewExit = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

export const MODEL_PICKER_FAST_SCROLLER_WIDTH = 48;

type ModelPickerFastScrollerProps = {
  activeIndex: number;
  anchors: readonly ModelPickerFastScrollAnchor[];
  blurTarget: RefObject<ViewInstance | null>;
  bottomInset?: number;
  onNavigate: (index: number) => void;
};

/** Contacts-style rail with one direct target per provider group. */
export function ModelPickerFastScroller({
  activeIndex,
  anchors,
  blurTarget,
  bottomInset = 0,
  onNavigate,
}: ModelPickerFastScrollerProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isMomentum = useSharedValue(false);
  const tapAnchorIndex = useSharedValue(-1);
  const previewAnchorIndex = useSharedValue(-1);
  const [measuredRailHeight, setMeasuredRailHeight] = useState(0);
  const [pressPreview, setPressPreview] = useState<{ index: number; centerY: number } | null>(null);
  const [previewHeight, setPreviewHeight] = useState(0);
  const contentHeight = anchors.length * NAVIGATION_ITEM_HEIGHT + RAIL_INSET * 2;
  const highlightedIndex = pressPreview?.index ?? activeIndex;
  const activeAnchor = anchors[highlightedIndex] ?? anchors[0];
  const pressedAnchor = pressPreview === null ? undefined : anchors[pressPreview.index];

  const navigate = useCallback(
    (index: number) => {
      if (anchors[index]) {
        void Haptics.selectionAsync().catch(() => undefined);
        onNavigate(index);
      }
    },
    [anchors, onNavigate],
  );
  const clearPreview = useCallback(() => {
    'worklet';
    if (previewAnchorIndex.get() >= 0) {
      previewAnchorIndex.set(-1);
      scheduleOnRN(setPressPreview, null);
    }
  }, [previewAnchorIndex]);
  const scrollGesture = useMemo(
    () =>
      Gesture.Native()
        .disallowInterruption(true)
        .onFinalize((_event, success) => {
          'worklet';
          // Android may cancel the gesture without emitting a scroll-end-drag event.
          if (!success) {
            isDragging.set(false);
          }
        }),
    [isDragging],
  );
  const gesture = useMemo(() => {
    const updatePreviewAt = (y: number) => {
      'worklet';
      const offset = scrollOffset.get();
      const index = modelPickerFastScrollIndexAtPosition(
        y + offset,
        contentHeight,
        anchors.length,
        RAIL_INSET,
      );
      if (index >= 0 && index !== previewAnchorIndex.get()) {
        previewAnchorIndex.set(index);
        scheduleOnRN(setPressPreview, {
          index,
          centerY: RAIL_INSET + (index + 0.5) * NAVIGATION_ITEM_HEIGHT - offset,
        });
      }
      return index;
    };

    // Keep the press scoped to the rail when the sheet can also be dragged.
    // Its lifetime also covers a held preview after the tap recognizer fails.
    const hold = Gesture.LongPress()
      .minDuration(0)
      .maxDistance(Number.MAX_SAFE_INTEGER)
      .shouldCancelWhenOutside(false)
      .cancelsTouchesInView(false)
      .simultaneousWithExternalGesture(scrollGesture)
      .onFinalize(() => {
        'worklet';
        clearPreview();
      });

    const tap = Gesture.Tap()
      .maxDuration(Number.MAX_SAFE_INTEGER)
      .simultaneousWithExternalGesture(scrollGesture)
      .onBegin((event) => {
        'worklet';
        tapAnchorIndex.set(isDragging.get() || isMomentum.get() ? -1 : updatePreviewAt(event.y));
      })
      .onEnd((_event, success) => {
        'worklet';
        const index = tapAnchorIndex.get();
        if (success && index >= 0) {
          scheduleOnRN(navigate, index);
        }
      });

    // Movement before the hold scrolls the rail. Once held, movement previews
    // the provider under the finger while the rail stays still.
    const previewDrag = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_DURATION_MS)
      .maxPointers(1)
      .blocksExternalGesture(scrollGesture)
      .onTouchesDown((_event, manager) => {
        'worklet';
        if (isDragging.get() || isMomentum.get()) {
          manager.fail();
        }
      })
      .onStart(() => {
        'worklet';
        tapAnchorIndex.set(-1);
      })
      .onUpdate(({ y }) => {
        'worklet';
        if (previewAnchorIndex.get() >= 0 && y >= 0 && y < measuredRailHeight) {
          updatePreviewAt(y);
        }
      });

    return Gesture.Simultaneous(hold, tap, previewDrag);
  }, [
    anchors.length,
    clearPreview,
    contentHeight,
    isDragging,
    isMomentum,
    measuredRailHeight,
    navigate,
    previewAnchorIndex,
    scrollGesture,
    scrollOffset,
    tapAnchorIndex,
  ]);
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.set(event.contentOffset.y);
    },
    onBeginDrag: () => {
      isDragging.set(true);
      tapAnchorIndex.set(-1);
      clearPreview();
    },
    onEndDrag: () => {
      isDragging.set(false);
    },
    onMomentumBegin: () => {
      isMomentum.set(true);
    },
    onMomentumEnd: () => {
      isMomentum.set(false);
    },
  });
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setMeasuredRailHeight(event.nativeEvent.layout.height);
  }, []);
  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    setPreviewHeight(event.nativeEvent.layout.height);
  }, []);
  useEffect(() => {
    if (
      measuredRailHeight <= 0 ||
      previewAnchorIndex.get() >= 0 ||
      isDragging.get() ||
      isMomentum.get()
    ) {
      return;
    }

    const currentOffset = scrollOffset.get();
    const itemTop = RAIL_INSET + activeIndex * NAVIGATION_ITEM_HEIGHT;
    const itemBottom = itemTop + NAVIGATION_ITEM_HEIGHT;
    const targetOffset =
      itemTop < currentOffset
        ? itemTop - RAIL_INSET
        : itemBottom > currentOffset + measuredRailHeight
          ? itemBottom + RAIL_INSET - measuredRailHeight
          : currentOffset;
    const nextOffset = Math.max(0, Math.min(contentHeight - measuredRailHeight, targetOffset));
    if (nextOffset !== currentOffset) {
      scrollRef.current?.scrollTo({ animated: false, y: nextOffset });
    }
  }, [
    activeIndex,
    contentHeight,
    isDragging,
    isMomentum,
    measuredRailHeight,
    previewAnchorIndex,
    scrollOffset,
  ]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName !== 'increment' && actionName !== 'decrement') {
        return;
      }

      const delta = actionName === 'increment' ? 1 : -1;
      const nextIndex = Math.min(anchors.length - 1, Math.max(0, activeIndex + delta));
      if (nextIndex !== activeIndex) {
        navigate(nextIndex);
      }
    },
    [activeIndex, anchors.length, navigate],
  );

  const previewTop = Math.max(
    0,
    Math.min(measuredRailHeight - previewHeight, (pressPreview?.centerY ?? 0) - previewHeight / 2),
  );
  const accessibilityValueText = activeAnchor
    ? `${activeAnchor.label}, ${t('modelPicker.providerMarker')}`
    : undefined;

  return (
    <View
      className="absolute bottom-0 right-0 top-0 justify-center"
      pointerEvents="box-none"
      style={{ paddingBottom: bottomInset, width: MODEL_PICKER_FAST_SCROLLER_WIDTH }}
    >
      <View
        accessibilityActions={accessibilityActions}
        accessibilityHint={t('modelPicker.fastScrollHint')}
        accessibilityLabel={t('modelPicker.fastScroll')}
        accessibilityRole="adjustable"
        accessibilityValue={{
          max: anchors.length,
          min: 1,
          now: highlightedIndex + 1,
          text: accessibilityValueText,
        }}
        accessible
        className="w-full items-center"
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={handleLayout}
        style={{ height: contentHeight, maxHeight: '80%' }}
        testID="model-picker-fast-scroller"
      >
        <View
          className="absolute inset-y-0 w-9 rounded-full border border-constant-white/65 shadow-sm shadow-constant-black/10 dark:border-border dark:shadow-constant-black/20"
          pointerEvents="none"
        >
          <View className="absolute inset-0 overflow-hidden rounded-full">
            <ModelPickerBackdrop blurTarget={blurTarget} variant="rail" />
          </View>
        </View>
        <GestureDetector gesture={gesture}>
          <View className="w-full flex-1 overflow-hidden rounded-full" collapsable={false}>
            <GestureDetector gesture={scrollGesture}>
              <Animated.ScrollView
                ref={scrollRef}
                bounces={false}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.scrollView}
                testID="model-picker-provider-scroll"
              >
                {anchors.map((anchor, anchorIndex) => (
                  <View
                    className="items-center justify-center"
                    key={anchor.key}
                    pointerEvents="none"
                    style={styles.navigationItem}
                  >
                    <ModelPickerFastScrollAnchorIcon
                      anchor={anchor}
                      isActive={anchorIndex === highlightedIndex}
                    />
                  </View>
                ))}
              </Animated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>
        {pressedAnchor ? (
          <Animated.View
            accessibilityElementsHidden
            className="absolute right-16"
            exiting={providerPreviewExit}
            importantForAccessibility="no-hide-descendants"
            onLayout={handlePreviewLayout}
            pointerEvents="none"
            style={{ top: previewTop }}
            testID="model-picker-provider-preview"
          >
            <ModelPickerProviderPreview anchor={pressedAnchor} blurTarget={blurTarget} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function ModelPickerFastScrollAnchorIcon({
  anchor,
  isActive,
}: {
  anchor: ModelPickerFastScrollAnchor;
  isActive: boolean;
}) {
  return (
    <View
      className={
        isActive
          ? 'size-8 items-center justify-center rounded-full bg-secondary'
          : 'size-8 items-center justify-center opacity-80'
      }
    >
      <View className="size-5 overflow-hidden rounded-sm">
        <ProviderAvatar
          presetProviderId={anchor.provider.presetProviderId}
          providerId={anchor.provider.id}
          providerName={anchor.provider.name}
          shape="rounded"
          size={MAXIMUM_PROVIDER_ICON_SIZE}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, width: '100%' },
  scrollContent: { paddingVertical: RAIL_INSET },
  navigationItem: { height: NAVIGATION_ITEM_HEIGHT },
});
