import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, type LayoutChangeEvent, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

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
  const railHeight = useSharedValue(0);
  const gestureAnchorIndex = useSharedValue(-1);
  const [measuredRailHeight, setMeasuredRailHeight] = useState(0);
  const [pressedAnchorIndex, setPressedAnchorIndex] = useState<number | null>(null);
  const [previewHeight, setPreviewHeight] = useState(0);
  // During a drag the finger owns the marker, even if scrolling reports a different group.
  const highlightedIndex = pressedAnchorIndex ?? activeIndex;
  const activeAnchor = anchors[highlightedIndex] ?? anchors[0];
  const pressedAnchor = pressedAnchorIndex === null ? undefined : anchors[pressedAnchorIndex];

  const navigate = useCallback(
    (index: number) => {
      if (anchors[index]) {
        setPressedAnchorIndex(index);
        onNavigate(index);
      }
    },
    [anchors, onNavigate],
  );
  const triggerHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);
  const gesture = useMemo(() => {
    const seek = (position: number) => {
      'worklet';
      const index = modelPickerFastScrollIndexAtPosition(
        position,
        railHeight.get(),
        anchors.length,
        RAIL_INSET,
      );
      if (index >= 0 && index !== gestureAnchorIndex.get()) {
        gestureAnchorIndex.set(index);
        runOnJS(navigate)(index);
      }
    };

    // An immediate native press owns the index before the sheet's pan can begin.
    return Gesture.LongPress()
      .minDuration(0)
      .maxDistance(Number.MAX_SAFE_INTEGER)
      .shouldCancelWhenOutside(false)
      .onStart((event) => {
        'worklet';
        gestureAnchorIndex.set(-1);
        runOnJS(triggerHaptic)();
        seek(event.y);
      })
      .onTouchesMove((event) => {
        'worklet';
        seek(event.allTouches[0].y);
      })
      .onFinalize(() => {
        'worklet';
        gestureAnchorIndex.set(-1);
        runOnJS(setPressedAnchorIndex)(null);
      });
  }, [anchors.length, gestureAnchorIndex, navigate, railHeight, triggerHaptic]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      railHeight.set(height);
      setMeasuredRailHeight((current) => (current === height ? current : height));
    },
    [railHeight],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName !== 'increment' && actionName !== 'decrement') {
        return;
      }

      const delta = actionName === 'increment' ? 1 : -1;
      const nextIndex = Math.min(anchors.length - 1, Math.max(0, activeIndex + delta));
      if (nextIndex !== activeIndex) {
        void Haptics.selectionAsync().catch(() => undefined);
        onNavigate(nextIndex);
      }
    },
    [activeIndex, anchors.length, onNavigate],
  );

  const trackHeight = Math.max(0, measuredRailHeight - RAIL_INSET * 2);
  const slotHeight = anchors.length === 0 ? 0 : trackHeight / anchors.length;
  const providerIconSize = Math.max(8, Math.min(MAXIMUM_PROVIDER_ICON_SIZE, slotHeight - 12));
  const previewTop = Math.max(
    0,
    Math.min(
      measuredRailHeight - previewHeight,
      RAIL_INSET + ((pressedAnchorIndex ?? 0) + 0.5) * slotHeight - previewHeight / 2,
    ),
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
      <GestureDetector gesture={gesture}>
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
          style={{ height: anchors.length * NAVIGATION_ITEM_HEIGHT, maxHeight: '100%' }}
          testID="model-picker-fast-scroller"
        >
          <View
            className="absolute inset-y-0 w-9 rounded-full border border-border bg-card shadow-md shadow-constant-black/10 dark:shadow-constant-black/40"
            pointerEvents="none"
          />
          <View className="absolute bottom-2 top-2 w-full items-center" pointerEvents="none">
            {anchors.map((anchor, anchorIndex) => (
              <View className="flex-1 items-center justify-center" key={anchor.key}>
                <ModelPickerFastScrollAnchorIcon
                  anchor={anchor}
                  isActive={anchorIndex === highlightedIndex}
                  providerIconSize={providerIconSize}
                />
              </View>
            ))}
          </View>
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
      </GestureDetector>
    </View>
  );
}

function ModelPickerFastScrollAnchorIcon({
  anchor,
  isActive,
  providerIconSize,
}: {
  anchor: ModelPickerFastScrollAnchor;
  isActive: boolean;
  providerIconSize: number;
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
        size={providerIconSize}
      />
    </View>
  );
}
