import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Image } from '@/components/nativePrimitives';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

// A single pannable / pinch- & double-tap-zoomable page. Pan stays disabled at
// rest so the parent horizontal pager keeps its swipe; it enables once the image
// is zoomed, and the pager disables its own scroll in tandem (via onZoomChange)
// so panning a zoomed image never pages away. `width`/`height` are the concrete
// page box (a horizontal list won't stretch cells on the cross axis, so the size
// is passed in rather than read from `100%`).
export function ZoomableImage({
  height,
  onZoomChange,
  uri,
  width,
}: {
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  uri: string;
  width: number;
}) {
  const { t } = useTranslation();
  const [isZoomed, setIsZoomed] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const setZoomed = (zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange(zoomed);
  };

  const clampTranslate = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * (scale.value - 1)) / 2;
    translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
    translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
  };

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(setZoomed)(false);
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
      runOnJS(setZoomed)(true);
    });

  const pan = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((event) => {
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      clampTranslate();
      savedX.value = translateX.value;
      savedY.value = translateY.value;
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
      runOnJS(setZoomed)(true);
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ height, width }, animatedStyle]}>
        <Image
          accessibilityLabel={t('painting.output')}
          cachePolicy="memory-disk"
          contentFit="contain"
          source={uri}
          style={styles.image}
          transition={120}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    height: '100%',
    width: '100%',
  },
});
