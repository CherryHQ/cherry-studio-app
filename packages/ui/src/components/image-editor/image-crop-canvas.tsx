import { Canvas, Group, Image as SkiaImage, useImage } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { FULL_IMAGE_CROP, moveCrop, type CropHandle } from './crop-geometry';
import type {
  ImageCrop,
  ImageEdit,
  ImageEditGeometry,
  ImageEditorLabels,
} from './image-editor.types';
import { useImagePanResponder } from './use-image-pan-responder';

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
  geometry,
  ratio,
  labels,
  source,
  width,
  height,
  disabled,
  onChange,
  onPreview,
  onCancel,
  onError,
}: {
  edit: ImageEdit;
  geometry: ImageEditGeometry;
  ratio?: number;
  labels: ImageEditorLabels;
  source: { uri: string; width: number; height: number };
  width: number;
  height: number;
  disabled: boolean;
  onChange: (crop: ImageCrop) => void;
  onPreview: (crop: ImageCrop) => void;
  onCancel: () => void;
  onError: () => void;
}) {
  const image = useImage(source.uri, onError);
  const rotatedWidth = geometry.width;
  const rotatedHeight = geometry.height;
  const scale = Math.min(width / rotatedWidth, height / rotatedHeight);
  const frameWidth = rotatedWidth * scale;
  const frameHeight = rotatedHeight * scale;
  const crop = useSharedValue(edit.crop);
  useEffect(() => {
    crop.value = edit.crop;
  }, [crop, edit.crop]);
  const minWidth = Math.min(
    edit.crop.width,
    Math.max(1 / rotatedWidth, Math.min(0.1, TARGET_SIZE / frameWidth)),
  );
  const minHeight = Math.min(
    edit.crop.height,
    Math.max(1 / rotatedHeight, Math.min(0.1, TARGET_SIZE / frameHeight)),
  );
  const shared = {
    crop,
    disabled,
    frameWidth,
    frameHeight,
    minWidth,
    minHeight,
    onChange,
    onPreview,
    onCancel,
    bounds: geometry.bounds,
    ratio,
  };

  return (
    <View style={{ width: frameWidth, height: frameHeight }}>
      <Canvas accessible={false} style={StyleSheet.absoluteFill}>
        <Group transform={[{ scale }]}>
          <Group matrix={geometry.matrix}>
            <SkiaImage
              image={image}
              x={0}
              y={0}
              width={source.width}
              height={source.height}
              fit="fill"
            />
          </Group>
        </Group>
      </Canvas>
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
      <Animated.View className="absolute bg-constant-black/40" style={top} />
      <Animated.View className="absolute bg-constant-black/40" style={bottom} />
      <Animated.View className="absolute bg-constant-black/40" style={left} />
      <Animated.View className="absolute bg-constant-black/40" style={right} />
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
  onPreview,
  onCancel,
  handle,
  label,
  value,
  bounds,
  ratio,
}: {
  crop: SharedValue<ImageCrop>;
  disabled: boolean;
  frameWidth: number;
  frameHeight: number;
  minWidth: number;
  minHeight: number;
  onChange: (crop: ImageCrop) => void;
  onPreview: (crop: ImageCrop) => void;
  onCancel: () => void;
  handle: CropHandle;
  label?: string;
  value?: number;
  bounds: ImageCrop;
  ratio?: number;
}) {
  const drag = useRef({ start: FULL_IMAGE_CROP, latest: FULL_IMAGE_CROP, cancelled: false });
  const nextCrop = (dx: number, dy: number) =>
    moveCrop(
      drag.current.start,
      handle,
      dx / frameWidth,
      dy / frameHeight,
      minWidth,
      minHeight,
      bounds,
      ratio,
    );
  const panHandlers = useImagePanResponder({
    onStartShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: () => {
      drag.current = { start: crop.value, latest: crop.value, cancelled: false };
    },
    onPanResponderMove: (_event, gesture) => {
      if (gesture.numberActiveTouches > 1) {
        drag.current.cancelled = true;
        crop.value = drag.current.start;
        onCancel();
      } else if (!drag.current.cancelled) {
        const next = nextCrop(gesture.dx, gesture.dy);
        drag.current.latest = next;
        crop.value = next;
        onPreview(next);
      }
    },
    onPanResponderRelease: () => {
      if (!drag.current.cancelled) {
        const next = drag.current.latest;
        crop.value = next;
        onChange(next);
      }
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {
      crop.value = drag.current.start;
      onCancel();
    },
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
      left: Math.max(
        0,
        Math.min(frameWidth - TARGET_SIZE, horizontal * frameWidth - TARGET_SIZE / 2),
      ),
      top: Math.max(
        0,
        Math.min(frameHeight - TARGET_SIZE, vertical * frameHeight - TARGET_SIZE / 2),
      ),
      width: TARGET_SIZE,
      height: TARGET_SIZE,
    };
  });
  const adjust = (increment: boolean) => {
    if (disabled) return;
    const delta = increment ? 0.02 : -0.02;
    const next = moveCrop(crop.value, handle, delta, delta, minWidth, minHeight, bounds, ratio);
    crop.value = next;
    onChange(next);
  };
  return (
    <Animated.View
      {...panHandlers}
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
      {handle === 'move' ? <CropGrid /> : null}
    </Animated.View>
  );
}

function CropGrid() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1 / 3, 2 / 3].map((fraction) => (
        <View key={fraction} style={StyleSheet.absoluteFill}>
          <View
            className="absolute inset-y-0 w-px bg-constant-white/40"
            style={{ left: `${fraction * 100}%` }}
          />
          <View
            className="absolute inset-x-0 h-px bg-constant-white/40"
            style={{ top: `${fraction * 100}%` }}
          />
        </View>
      ))}
      {Object.entries(CORNER_CLASSES).map(([corner, classes]) => (
        <View key={corner} className={`absolute size-5 ${classes.placement}`}>
          <View className={`absolute inset-0 border-constant-black/60 ${classes.outline}`} />
          <View className={`absolute inset-0 border-constant-white ${classes.stroke}`} />
        </View>
      ))}
    </View>
  );
}

const CORNER_CLASSES = {
  'top-left': {
    placement: 'left-0 top-0',
    outline: 'border-l-4 border-t-4',
    stroke: 'border-l-2 border-t-2',
  },
  'top-right': {
    placement: 'right-0 top-0',
    outline: 'border-r-4 border-t-4',
    stroke: 'border-r-2 border-t-2',
  },
  'bottom-left': {
    placement: 'left-0 bottom-0',
    outline: 'border-l-4 border-b-4',
    stroke: 'border-l-2 border-b-2',
  },
  'bottom-right': {
    placement: 'right-0 bottom-0',
    outline: 'border-r-4 border-b-4',
    stroke: 'border-r-2 border-b-2',
  },
} as const;
