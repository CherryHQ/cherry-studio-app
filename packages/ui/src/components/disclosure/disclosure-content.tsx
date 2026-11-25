import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, type ViewStyle, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '../../motion';

const timing = { duration: duration.base, easing: easing.settle };

export type DisclosureContentProps = {
  children?: ReactNode;
  onAnimatingChange?: (animating: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Measure only mounted content. A reversal retargets the clip from its current height. */
export function DisclosureContent({
  children,
  onAnimatingChange,
  style,
  testID,
}: DisclosureContentProps) {
  const expanded = children !== null && children !== undefined && children !== false;
  // Keep the outgoing frame in state until the collapse finishes; render the live children on reopen.
  const [retained, setRetained] = useState<ReactNode>(() => (expanded ? children : null));
  if (expanded && retained !== children) setRetained(children);
  const displayed = expanded ? children : retained;
  const mounted = displayed !== null && displayed !== undefined && displayed !== false;
  const [measured, setMeasured] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const reduced = useReducedMotion();
  const animatingRef = useRef(false);
  const onAnimatingChangeRef = useRef(onAnimatingChange);
  useLayoutEffect(() => {
    onAnimatingChangeRef.current = onAnimatingChange;
  });
  const setAnimating = useCallback((next: boolean) => {
    if (animatingRef.current === next) return;
    animatingRef.current = next;
    onAnimatingChangeRef.current?.(next);
  }, []);
  useEffect(() => () => setAnimating(false), [setAnimating]);

  const targetHeight = expanded ? measured : 0;

  useLayoutEffect(() => {
    let current = true;
    const finishOpen = () => {
      if (!current) return;
      setAnimating(false);
    };
    const finishClose = () => {
      if (!current) return;
      setRetained(null);
      setMeasured(0);
      setAnimating(false);
    };

    if (!mounted) {
      setAnimating(false);
      return;
    }
    if (expanded) {
      if (targetHeight <= 0) {
        setAnimating(false);
        return;
      }
      if (reduced) {
        opacity.set(1);
        height.set(targetHeight);
        setAnimating(false);
      } else {
        setAnimating(true);
        opacity.set(withTiming(1, timing));
        height.set(
          withTiming(targetHeight, timing, (finished) => {
            if (finished) scheduleOnRN(finishOpen);
          }),
        );
      }
    } else if (reduced) {
      opacity.set(0);
      height.set(0);
      finishClose();
    } else {
      setAnimating(true);
      opacity.set(withTiming(0, timing));
      height.set(
        withTiming(0, timing, (finished) => {
          if (finished) scheduleOnRN(finishClose);
        }),
      );
    }

    return () => {
      current = false;
    };
  }, [expanded, height, mounted, opacity, reduced, setAnimating, targetHeight]);

  const clip = useAnimatedStyle(() => ({ height: height.value, opacity: opacity.value }));
  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    setMeasured((previous) => (Math.abs(previous - next) <= 1 ? previous : next));
  }, []);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      className="overflow-hidden"
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={clip}
      testID={testID}
    >
      {mounted ? (
        <View className="absolute top-0 right-0 left-0" onLayout={measure} style={style}>
          {displayed}
        </View>
      ) : null}
    </Animated.View>
  );
}
