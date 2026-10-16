import { Image } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fitPaintingImage, type PaintingAnnotation } from '../utils/paintingAnnotations';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const MARKER_SIZE = 30;
const MARKER_HIT_RADIUS = 24;
const SWIPE_DISTANCE = 60;

type CanvasSize = { height: number; width: number };

/**
 * The focused image, full-bleed. Each gesture has one owner:
 * tap shows or hides the chrome (or selects a marker), long press drops an
 * annotation at the pressed point (or removes the marker under it), pinch and
 * double tap zoom, and a horizontal swipe at rest moves between the images of
 * one generation. Annotation coordinates are normalized to the image itself,
 * excluding letterboxing, so they survive keyboard and zoom changes.
 */
export function PaintingFocusCanvas({
  accessibilityLabel,
  annotations,
  canAnnotate,
  imageCount,
  onAddAnnotation,
  onRemoveAnnotation,
  onSelectAnnotation,
  onSwipe,
  onTap,
  selectedAnnotationId,
  uri,
}: {
  accessibilityLabel: string;
  annotations: readonly PaintingAnnotation[];
  canAnnotate: boolean;
  imageCount: number;
  onAddAnnotation: (x: number, y: number) => void;
  onRemoveAnnotation: (id: number) => void;
  onSelectAnnotation: (id: number) => void;
  onSwipe: (direction: 1 | -1) => void;
  onTap: () => void;
  selectedAnnotationId: number | null;
  uri: string;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState<CanvasSize>({ height: 0, width: 0 });
  const [sourceRatio, setSourceRatio] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const image = sourceRatio
    ? fitPaintingImage(size.width, size.height, sourceRatio)
    : { height: size.height, left: 0, top: 0, width: size.width };

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const { height, width } = size;

  function markerAt(x: number, y: number) {
    return annotations.find(
      (annotation) =>
        Math.hypot(
          image.left + annotation.x * image.width - x,
          image.top + annotation.y * image.height - y,
        ) <= MARKER_HIT_RADIUS,
    );
  }

  function handleTap(x: number, y: number) {
    const marker = markerAt(x, y);
    if (marker) onSelectAnnotation(marker.id);
    else onTap();
  }

  function handleLongPress(x: number, y: number) {
    if (!canAnnotate) return;
    const marker = markerAt(x, y);
    if (marker) {
      onRemoveAnnotation(marker.id);
      return;
    }
    const nx = (x - image.left) / image.width;
    const ny = (y - image.top) / image.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    onAddAnnotation(nx, ny);
  }

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(setIsZoomed)(false);
  };

  const clampTranslate = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * (scale.value - 1)) / 2;
    translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
    translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, savedScale.value * event.scale);
    })
    .onEnd(() => {
      const next = Math.min(MAX_SCALE, Math.max(1, scale.value));
      if (next <= 1) {
        resetZoom();
        return;
      }
      scale.value = withTiming(next);
      savedScale.value = next;
      clampTranslate();
      savedX.value = translateX.value;
      savedY.value = translateY.value;
      runOnJS(setIsZoomed)(true);
    });

  // Zoomed: pan the image. At rest: a horizontal swipe changes the image.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        clampTranslate();
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }
      if (imageCount > 1 && Math.abs(event.translationX) > SWIPE_DISTANCE) {
        runOnJS(onSwipe)(event.translationX < 0 ? 1 : -1);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        resetZoom();
        return;
      }
      const maxX = (width * (DOUBLE_TAP_SCALE - 1)) / 2;
      const maxY = (height * (DOUBLE_TAP_SCALE - 1)) / 2;
      const targetX = Math.min(
        maxX,
        Math.max(-maxX, -(event.x - width / 2) * (DOUBLE_TAP_SCALE - 1)),
      );
      const targetY = Math.min(
        maxY,
        Math.max(-maxY, -(event.y - height / 2) * (DOUBLE_TAP_SCALE - 1)),
      );
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      translateX.value = withTiming(targetX);
      translateY.value = withTiming(targetY);
      savedX.value = targetX;
      savedY.value = targetY;
      runOnJS(setIsZoomed)(true);
    });

  const singleTap = Gesture.Tap().onEnd((event) => {
    runOnJS(handleTap)(event.x, event.y);
  });

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .onStart((event) => {
      runOnJS(handleLongPress)(event.x, event.y);
    });

  const gesture = Gesture.Race(
    longPress,
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinch, pan),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      className="flex-1"
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { height: layout.height, width: layout.width },
        )
      }
    >
      {width > 0 && height > 0 ? (
        <GestureDetector gesture={gesture}>
          <Animated.View
            accessibilityHint={canAnnotate ? t('painting.focus.annotationHint') : undefined}
            accessibilityLabel={accessibilityLabel}
            accessible
            style={[{ height, width }, animatedStyle]}
          >
            {failedUri === uri ? (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-center text-muted-foreground text-sm">
                  {t('painting.focus.imageUnavailable')}
                </Text>
              </View>
            ) : (
              <Image
                allowDownscaling
                cachePolicy="memory-disk"
                contentFit="contain"
                onError={() => setFailedUri(uri)}
                onLoad={({ source }) => {
                  if (source.width > 0 && source.height > 0) {
                    setSourceRatio(source.width / source.height);
                  }
                }}
                source={uri}
                style={StyleSheet.absoluteFill}
                transition={120}
              />
            )}
            {sourceRatio && !isZoomed
              ? annotations.map((annotation) => (
                  <View
                    accessibilityLabel={t('painting.editor.annotation', { number: annotation.id })}
                    accessibilityState={{ selected: annotation.id === selectedAnnotationId }}
                    className={
                      annotation.id === selectedAnnotationId
                        ? 'absolute items-center justify-center rounded-full border-[3px] border-constant-white bg-primary'
                        : 'absolute items-center justify-center rounded-full border-[1.5px] border-constant-white bg-primary'
                    }
                    key={annotation.id}
                    pointerEvents="none"
                    style={{
                      height: MARKER_SIZE,
                      left: image.left + annotation.x * image.width - MARKER_SIZE / 2,
                      top: image.top + annotation.y * image.height - MARKER_SIZE / 2,
                      width: MARKER_SIZE,
                    }}
                  >
                    <Text className="font-semibold text-primary-foreground text-xs">
                      {annotation.id}
                    </Text>
                  </View>
                ))
              : null}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}
