import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Image } from '../image';
import { FULL_IMAGE_CROP, moveCrop, type CropHandle } from './crop-geometry';
import type { ImageCrop, ImageEdit, ImageEditorLabels } from './image-editor.types';

const HANDLES: readonly CropHandle[] = [
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];
const TARGET_SIZE = 44;

export function ImageCropCanvas({
  edit,
  labels,
  source,
  width,
  height,
  disabled,
  onChange,
  onError,
}: {
  edit: ImageEdit;
  labels: ImageEditorLabels;
  source: { uri: string; width: number; height: number };
  width: number;
  height: number;
  disabled: boolean;
  onChange: (crop: ImageCrop) => void;
  onError: () => void;
}) {
  const swapped = edit.rotation === 90 || edit.rotation === 270;
  const rotatedWidth = swapped ? source.height : source.width;
  const rotatedHeight = swapped ? source.width : source.height;
  const scale = Math.min(width / rotatedWidth, height / rotatedHeight);
  const frameWidth = rotatedWidth * scale;
  const frameHeight = rotatedHeight * scale;
  const crop = useSharedValue(edit.crop);
  const minWidth = Math.min(
    edit.crop.width,
    Math.max(1 / rotatedWidth, Math.min(0.1, TARGET_SIZE / frameWidth)),
  );
  const minHeight = Math.min(
    edit.crop.height,
    Math.max(1 / rotatedHeight, Math.min(0.1, TARGET_SIZE / frameHeight)),
  );
  const shared = { crop, disabled, frameWidth, frameHeight, minWidth, minHeight, onChange };

  return (
    <View style={{ width: frameWidth, height: frameHeight }}>
      <Image
        accessible={false}
        contentFit="fill"
        onError={onError}
        source={{ uri: source.uri }}
        style={{
          position: 'absolute',
          width: source.width * scale,
          height: source.height * scale,
          left: (frameWidth - source.width * scale) / 2,
          top: (frameHeight - source.height * scale) / 2,
          transform: [{ rotate: `${edit.rotation}deg` }],
        }}
      />
      <CropShade crop={crop} height={frameHeight} width={frameWidth} />
      <CropControl {...shared} handle="move" />
      {HANDLES.map((handle) => (
        <CropControl
          {...shared}
          handle={handle}
          key={handle}
          value={
            handle === 'left'
              ? edit.crop.x
              : handle === 'right'
                ? edit.crop.x + edit.crop.width
                : handle === 'top'
                  ? edit.crop.y
                  : edit.crop.y + edit.crop.height
          }
          label={
            handle === 'left'
              ? labels.cropLeft
              : handle === 'right'
                ? labels.cropRight
                : handle === 'top'
                  ? labels.cropTop
                  : handle === 'bottom'
                    ? labels.cropBottom
                    : undefined
          }
        />
      ))}
    </View>
  );
}

function CropShade({
  crop,
  width,
  height,
}: {
  crop: SharedValue<ImageCrop>;
  width: number;
  height: number;
}) {
  const top = useAnimatedStyle(() => ({ height: crop.value.y * height, width }));
  const bottom = useAnimatedStyle(() => ({
    top: (crop.value.y + crop.value.height) * height,
    bottom: 0,
    width,
  }));
  const left = useAnimatedStyle(() => ({
    top: crop.value.y * height,
    height: crop.value.height * height,
    width: crop.value.x * width,
  }));
  const right = useAnimatedStyle(() => ({
    top: crop.value.y * height,
    height: crop.value.height * height,
    left: (crop.value.x + crop.value.width) * width,
    right: 0,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View className="absolute bg-constant-black/60" style={top} />
      <Animated.View className="absolute bg-constant-black/60" style={bottom} />
      <Animated.View className="absolute bg-constant-black/60" style={left} />
      <Animated.View className="absolute bg-constant-black/60" style={right} />
    </View>
  );
}

/**
 * The crop owns pans only inside the inset image region. It has no tap/long-press action.
 * A cancelled pan restores its starting rectangle; navigation edges remain platform-owned.
 * Edge handles expose adjustable actions so cropping is also possible without dragging.
 */
function CropControl({
  crop,
  disabled,
  frameWidth,
  frameHeight,
  minWidth,
  minHeight,
  onChange,
  handle,
  label,
  value,
}: {
  crop: SharedValue<ImageCrop>;
  disabled: boolean;
  frameWidth: number;
  frameHeight: number;
  minWidth: number;
  minHeight: number;
  onChange: (crop: ImageCrop) => void;
  handle: CropHandle;
  label?: string;
  value?: number;
}) {
  const start = useSharedValue(FULL_IMAGE_CROP);
  const started = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .maxPointers(1)
    .onStart(() => {
      start.value = crop.value;
      started.value = true;
    })
    .onUpdate((event) => {
      crop.value = moveCrop(
        start.value,
        handle,
        event.translationX / frameWidth,
        event.translationY / frameHeight,
        minWidth,
        minHeight,
      );
    })
    .onEnd((_event, success) => {
      if (success) runOnJS(onChange)(crop.value);
    })
    .onFinalize((_event, success) => {
      if (started.value && !success) crop.value = start.value;
      started.value = false;
    });
  const style = useAnimatedStyle(() => {
    const { x, y, width, height } = crop.value;
    if (handle === 'move')
      return {
        left: x * frameWidth,
        top: y * frameHeight,
        width: width * frameWidth,
        height: height * frameHeight,
      };
    const horizontal = handle.includes('left')
      ? x
      : handle.includes('right')
        ? x + width
        : x + width / 2;
    const vertical = handle.includes('top')
      ? y
      : handle.includes('bottom')
        ? y + height
        : y + height / 2;
    return {
      left: horizontal * frameWidth - TARGET_SIZE / 2,
      top: vertical * frameHeight - TARGET_SIZE / 2,
      width: TARGET_SIZE,
      height: TARGET_SIZE,
    };
  });
  const adjust = (increment: boolean) => {
    if (disabled) return;
    const delta = increment ? 0.02 : -0.02;
    const next = moveCrop(crop.value, handle, delta, delta, minWidth, minHeight);
    crop.value = next;
    onChange(next);
  };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible={Boolean(label)}
        accessibilityLabel={label}
        accessibilityRole={label ? 'adjustable' : undefined}
        accessibilityState={{ disabled }}
        accessibilityValue={
          label && value !== undefined
            ? { min: 0, max: 100, now: Math.round(value * 100) }
            : undefined
        }
        accessibilityActions={label ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
        onAccessibilityAction={({ nativeEvent }) => adjust(nativeEvent.actionName === 'increment')}
        className={
          handle === 'move'
            ? 'absolute border border-constant-white'
            : 'absolute items-center justify-center'
        }
        style={style}
      >
        {handle !== 'move' ? (
          <View
            className={
              label
                ? 'h-2 w-2 rounded-full bg-constant-white'
                : 'size-3 rounded-sm border-2 border-constant-white bg-constant-black'
            }
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
