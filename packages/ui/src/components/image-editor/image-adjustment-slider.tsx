import MinusIcon from '@cherrystudio/app-icons/icons/minus';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useImagePanResponder } from './use-image-pan-responder';

const MIN = -45;
const MAX = 45;
const THUMB_SIZE = 16;
const THUMB_TOUCH_RADIUS = 22;
const clamp = (value: number) => Math.max(MIN, Math.min(MAX, Math.round(value)));

/** Editing needs live preview, one history entry per drag, and rollback on cancellation. */
export function ImageAdjustmentSlider({
  label,
  unit,
  value,
  disabled,
  zeroLabel,
  increaseLabel,
  decreaseLabel,
  onPreview,
  onCommit,
  onCancel,
}: {
  label: string;
  unit: string;
  value: number;
  disabled: boolean;
  zeroLabel: string;
  increaseLabel: string;
  decreaseLabel: string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  const [width, setWidth] = useState(0);
  const trackWidth = Math.max(0, width - THUMB_SIZE);
  const position = ((value - MIN) / (MAX - MIN)) * trackWidth;
  const drag = useRef({ start: value, current: value, width: trackWidth, cancelled: false });
  const panHandlers = useImagePanResponder({
    onStartShouldSetPanResponder: () => !disabled && trackWidth > 0,
    onPanResponderGrant: (event) => {
      const pointerX = event.nativeEvent.locationX;
      const next =
        Math.abs(pointerX - position - THUMB_SIZE / 2) <= THUMB_TOUCH_RADIUS
          ? value
          : clamp(MIN + ((pointerX - THUMB_SIZE / 2) / trackWidth) * (MAX - MIN));
      drag.current = { start: next, current: next, width: trackWidth, cancelled: false };
      onPreview(next);
    },
    onPanResponderMove: (_event, gesture) => {
      if (disabled || gesture.numberActiveTouches > 1 || Math.abs(gesture.dy) > 24) {
        drag.current.cancelled = true;
        onCancel();
      } else if (!drag.current.cancelled) {
        const next = clamp(drag.current.start + (gesture.dx / drag.current.width) * (MAX - MIN));
        if (next !== drag.current.current) {
          drag.current.current = next;
          onPreview(next);
        }
      }
    },
    onPanResponderRelease: () => {
      if (!drag.current.cancelled) onCommit(drag.current.current);
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {
      drag.current.cancelled = true;
      onCancel();
    },
  });

  return (
    <View>
      <View className="min-h-5 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-foreground">{label}</Text>
        <Text className="text-xs tabular-nums text-foreground">
          {value > 0 ? '+' : ''}
          {value}
          {unit}
        </Text>
      </View>
      <View className="flex-row items-center">
        <Pressable
          accessibilityLabel={decreaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || value <= MIN }}
          disabled={disabled || value <= MIN}
          onPress={() => onCommit(clamp(value - 1))}
          className="size-11 items-center justify-center active:opacity-70 disabled:opacity-40"
        >
          <MinusIcon className="size-4 text-muted-foreground" />
        </Pressable>
        <View
          {...panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityValue={{ min: MIN, max: MAX, now: value, text: `${value}${unit}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (!disabled && nativeEvent.actionName === 'increment') onCommit(clamp(value + 1));
            if (!disabled && nativeEvent.actionName === 'decrement') onCommit(clamp(value - 1));
          }}
          onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
          className={
            disabled
              ? 'h-11 min-w-0 flex-1 justify-center px-2 opacity-40'
              : 'h-11 min-w-0 flex-1 justify-center px-2'
          }
        >
          <View pointerEvents="none" className="h-0.5 rounded-full bg-foreground-tertiary" />
          <View
            pointerEvents="none"
            className="absolute top-5 h-1 bg-primary"
            style={{
              left: THUMB_SIZE / 2 + Math.min(trackWidth / 2, position),
              width: Math.abs(position - trackWidth / 2),
            }}
          />
          <View
            pointerEvents="none"
            className="absolute top-3.5 size-4 rounded-full border-2 border-background bg-primary"
            style={{ left: position }}
          />
        </View>
        <Pressable
          accessibilityLabel={increaseLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || value >= MAX }}
          disabled={disabled || value >= MAX}
          onPress={() => onCommit(clamp(value + 1))}
          className="size-11 items-center justify-center active:opacity-70 disabled:opacity-40"
        >
          <PlusIcon className="size-4 text-muted-foreground" />
        </Pressable>
        <Pressable
          accessibilityLabel={zeroLabel}
          accessibilityHint={label}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || value === 0 }}
          disabled={disabled || value === 0}
          onPress={() => onCommit(0)}
          className="min-h-11 min-w-11 items-center justify-center px-1 active:opacity-70 disabled:opacity-40"
        >
          <Text className="text-xs text-muted-foreground">{zeroLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
