import { type ReactNode, memo, useCallback, useLayoutEffect, useState } from 'react';
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
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Measure only mounted content. A reversal retargets the clip from its current height. */
export function DisclosureContent({ children, style, testID }: DisclosureContentProps) {
  const expanded = children !== null && children !== undefined && children !== false;
  const [mounted, setMounted] = useState(expanded);
  if (expanded && !mounted) setMounted(true);
  const [measured, setMeasured] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const reduced = useReducedMotion();

  const targetHeight = expanded ? measured : 0;

  useLayoutEffect(() => {
    let current = true;
    const finishClose = () => {
      if (!current) return;
      setMounted(false);
      setMeasured(0);
    };

    if (!mounted) return;
    opacity.set(reduced ? Number(expanded) : withTiming(Number(expanded), timing));
    if (expanded) {
      height.set(reduced ? targetHeight : withTiming(targetHeight, timing));
    } else if (reduced) {
      height.set(0);
      finishClose();
    } else {
      height.set(
        withTiming(0, timing, (finished) => {
          if (finished) scheduleOnRN(finishClose);
        }),
      );
    }

    return () => {
      current = false;
    };
  }, [expanded, height, mounted, opacity, reduced, targetHeight]);

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
        <MeasuredBody expanded={expanded} onLayout={measure} style={style}>
          {children}
        </MeasuredBody>
      ) : null}
    </Animated.View>
  );
}

// Keep the outgoing body until the clip reaches zero. A reversal renders the new children immediately.
const MeasuredBody = memo(
  function MeasuredBody({
    children,
    onLayout,
    style,
  }: DisclosureContentProps & { expanded: boolean; onLayout(event: LayoutChangeEvent): void }) {
    return (
      <View className="absolute top-0 right-0 left-0" onLayout={onLayout} style={style}>
        {children}
      </View>
    );
  },
  (_previous, next) => !next.expanded,
);
