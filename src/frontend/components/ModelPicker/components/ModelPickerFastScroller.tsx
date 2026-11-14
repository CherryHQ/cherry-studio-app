import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { ProviderAvatar } from '@/frontend/components/Avatar';

import {
  type ModelPickerFastScrollAnchor,
  modelPickerFastScrollIndexAtPosition,
} from '../utils/modelPickerFastScroll';

const RAIL_INSET = 8;
const NAVIGATION_ITEM_HEIGHT = 48;
const MAXIMUM_PROVIDER_ICON_SIZE = 20;
const accessibilityActions = [{ name: 'increment' }, { name: 'decrement' }] as const;

export const MODEL_PICKER_FAST_SCROLLER_WIDTH = 48;

type ModelPickerFastScrollerProps = {
  activeIndex: number;
  anchors: readonly ModelPickerFastScrollAnchor[];
  onNavigate: (index: number) => void;
};

/** Contacts-style rail with one direct target per provider group. */
export function ModelPickerFastScroller({
  activeIndex,
  anchors,
  onNavigate,
}: ModelPickerFastScrollerProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isMomentum = useSharedValue(false);
  const canNavigate = useSharedValue(false);
  const gestureAnchorIndex = useSharedValue(-1);
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
  const showPreview = useCallback((index: number, centerY: number) => {
    setPressPreview({ index, centerY });
  }, []);
  const clearPreview = useCallback(() => setPressPreview(null), []);
  const scrollGesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);
  const gesture = useMemo(() => {
    // Retain the native press that excludes the sheet pan, while allowing the
    // nested native scroller to handle movement. Only a completed tap navigates.
    const hold = Gesture.LongPress()
      .minDuration(0)
      .maxDistance(Number.MAX_SAFE_INTEGER)
      .shouldCancelWhenOutside(false)
      .cancelsTouchesInView(false)
      .simultaneousWithExternalGesture(scrollGesture);

    const tap = Gesture.Tap()
      .maxDuration(Number.MAX_SAFE_INTEGER)
      .simultaneousWithExternalGesture(scrollGesture)
      .onBegin((event) => {
        'worklet';
        const offset = scrollOffset.get();
        const index = modelPickerFastScrollIndexAtPosition(
          event.y + offset,
          contentHeight,
          anchors.length,
          RAIL_INSET,
        );
        gestureAnchorIndex.set(index);
        canNavigate.set(!isMomentum.get());
        if (index >= 0 && canNavigate.get()) {
          runOnJS(showPreview)(index, RAIL_INSET + (index + 0.5) * NAVIGATION_ITEM_HEIGHT - offset);
        }
      })
      .onEnd((_event, success) => {
        'worklet';
        const index = gestureAnchorIndex.get();
        if (success && canNavigate.get() && index >= 0) {
          runOnJS(navigate)(index);
        }
      })
      .onFinalize(() => {
        'worklet';
        gestureAnchorIndex.set(-1);
        canNavigate.set(false);
        runOnJS(clearPreview)();
      });

    return Gesture.Simultaneous(hold, tap);
  }, [
    anchors.length,
    canNavigate,
    clearPreview,
    contentHeight,
    gestureAnchorIndex,
    isMomentum,
    navigate,
    scrollGesture,
    scrollOffset,
    showPreview,
  ]);
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.set(event.contentOffset.y);
    },
    onBeginDrag: () => {
      isDragging.set(true);
      canNavigate.set(false);
      runOnJS(clearPreview)();
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
  useEffect(() => {
    if (
      measuredRailHeight <= 0 ||
      gestureAnchorIndex.get() >= 0 ||
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
    gestureAnchorIndex,
    isDragging,
    isMomentum,
    measuredRailHeight,
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
      style={{ width: MODEL_PICKER_FAST_SCROLLER_WIDTH }}
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
          className="absolute inset-y-0 w-9 rounded-full border border-border bg-card shadow-md shadow-constant-black/10 dark:shadow-constant-black/40"
          pointerEvents="none"
        />
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
          <View
            accessibilityElementsHidden
            className="absolute right-14 w-52 items-end"
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{ top: previewTop }}
            testID="model-picker-provider-preview"
          >
            <View
              className="max-w-full rounded-xl bg-foreground px-3 py-2 shadow-md shadow-constant-black/15"
              onLayout={({ nativeEvent }) => {
                setPreviewHeight(nativeEvent.layout.height);
              }}
            >
              <Text
                className="font-medium text-background text-xs"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {pressedAnchor.label}
              </Text>
            </View>
          </View>
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
      <ProviderAvatar
        presetProviderId={anchor.provider.presetProviderId}
        providerId={anchor.provider.id}
        providerName={anchor.provider.name}
        size={MAXIMUM_PROVIDER_ICON_SIZE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, width: '100%' },
  scrollContent: { paddingVertical: RAIL_INSET },
  navigationItem: { height: NAVIGATION_ITEM_HEIGHT },
});
