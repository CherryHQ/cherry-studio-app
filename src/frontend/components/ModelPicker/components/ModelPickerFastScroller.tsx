import { Image } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, type LayoutChangeEvent, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import type { Provider } from '@/shared/data/types/provider';

import {
  type ModelPickerFastScrollAnchor,
  modelPickerFastScrollIndexAtPosition,
} from '../utils/modelPickerFastScroll';

const RAIL_INSET = 8;
const NAVIGATION_ITEM_HEIGHT = 48;
const MAXIMUM_PROVIDER_ICON_SIZE = 20;
const accessibilityActions = [{ name: 'increment' }, { name: 'decrement' }] as const;

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
  const activeAnchor = anchors[activeIndex] ?? anchors[0];

  const navigate = useCallback(
    (index: number) => {
      if (anchors[index]) {
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

    return Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => {
        'worklet';
        gestureAnchorIndex.set(-1);
        runOnJS(triggerHaptic)();
        seek(event.y);
      })
      .onUpdate((event) => {
        'worklet';
        seek(event.y);
      })
      .onFinalize(() => {
        'worklet';
        gestureAnchorIndex.set(-1);
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
        navigate(nextIndex);
      }
    },
    [activeIndex, anchors.length, navigate],
  );

  const trackHeight = Math.max(0, measuredRailHeight - RAIL_INSET * 2);
  const slotHeight = anchors.length === 0 ? 0 : trackHeight / anchors.length;
  const providerIconSize = Math.max(8, Math.min(MAXIMUM_PROVIDER_ICON_SIZE, slotHeight - 12));
  const accessibilityValueText = activeAnchor
    ? `${activeAnchor.label}, ${t('modelPicker.providerMarker')}`
    : undefined;

  return (
    <View className="absolute bottom-0 right-0 top-0 w-12 justify-center" pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <View
          accessibilityActions={accessibilityActions}
          accessibilityHint={t('modelPicker.fastScrollHint')}
          accessibilityLabel={t('modelPicker.fastScroll')}
          accessibilityRole="adjustable"
          accessibilityValue={{
            max: anchors.length,
            min: 1,
            now: activeIndex + 1,
            text: accessibilityValueText,
          }}
          accessible
          className="w-12 items-center"
          onAccessibilityAction={handleAccessibilityAction}
          onLayout={handleLayout}
          style={{ height: anchors.length * NAVIGATION_ITEM_HEIGHT, maxHeight: '100%' }}
          testID="model-picker-fast-scroller"
        >
          <View className="absolute bottom-2 top-2 w-12 items-center" pointerEvents="none">
            {anchors.map((anchor, anchorIndex) => (
              <View className="flex-1 items-center justify-center" key={anchor.key}>
                <ModelPickerFastScrollAnchorIcon
                  anchor={anchor}
                  isActive={anchorIndex === activeIndex}
                  providerIconSize={providerIconSize}
                />
              </View>
            ))}
          </View>
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
    <View className={isActive ? 'scale-110 opacity-100' : 'opacity-40'}>
      <ProviderRailIcon provider={anchor.provider} size={providerIconSize} />
    </View>
  );
}

function ProviderRailIcon({ provider, size }: { provider: Provider; size: number }) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const iconId = provider.presetProviderId ?? provider.id;
  const iconSource = resolveProviderIcon(iconId);

  if (!iconSource) {
    const initial = Array.from(provider.name.trim())[0] ?? 'P';
    return (
      <Text
        className="text-center font-semibold text-muted-foreground"
        style={{ fontSize: size * 0.72, lineHeight: size }}
      >
        {initial}
      </Text>
    );
  }

  return (
    <Image
      cachePolicy="memory-disk"
      className="rounded"
      contentFit="contain"
      recyclingKey={provider.id}
      source={iconSource[iconTheme]}
      style={{ height: size, width: size }}
    />
  );
}
