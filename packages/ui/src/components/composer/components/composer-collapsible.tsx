import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ComposerCollapsibleProps } from '../composer.types';
import { settleMotion } from '../utils/composer-motion';

/**
 * A row that grows from nothing to its content's height and shrinks back. Render
 * `null` to collapse it.
 *
 * This is only the animation — where a row sits is decided by the order it is
 * written in the composer's children, and a row that never collapses is just a
 * `View`.
 *
 * The height is measured and driven by a shared value rather than left to a
 * layout animation. A layout animation tweens the row's own frame *after* its
 * parent has committed the new one, so the surface would snap to its final
 * height while the row slid into place; driving the height directly makes the
 * surface reflow with it.
 */
export function ComposerCollapsible({ children, style, testID }: ComposerCollapsibleProps) {
  // `{cond ? <x /> : null}` yields null, `{cond && <x />}` yields false.
  const isOpen = children !== null && children !== undefined && children !== false;
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const isReducedMotion = useReducedMotion();

  // Rendering `children` straight through would drop the content the instant the
  // caller stops passing it, leaving an empty box to shrink. Held in a ref rather
  // than mirrored into state: `children` is a fresh element on every render, so
  // the equality check a state mirror needs would fire `setState` on every pass
  // and never settle. Written in an effect, so the render that collapses still
  // reads the previous frame.
  const lastChildren = useRef<ReactNode>(null);

  useEffect(() => {
    if (isOpen) {
      lastChildren.current = children;
    }
  });

  useEffect(() => {
    const nextHeight = isOpen ? contentHeight : 0;
    const nextOpacity = isOpen ? 1 : 0;

    if (isReducedMotion) {
      height.set(nextHeight);
      opacity.set(nextOpacity);
      return;
    }

    // Both on the one curve: a fade that outruns the height leaves an empty box
    // shrinking, which is the thing the held frame above exists to prevent.
    height.set(withTiming(nextHeight, settleMotion));
    opacity.set(withTiming(nextOpacity, settleMotion));
  }, [contentHeight, height, isOpen, isReducedMotion, opacity]);

  const clipStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);

    // Sub-pixel layout jitter would otherwise restart the timing animation on
    // every measurement pass.
    setContentHeight((current) => (Math.abs(current - nextHeight) <= 1 ? current : nextHeight));
  };

  return (
    <Animated.View
      accessibilityElementsHidden={!isOpen}
      className="overflow-hidden"
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isOpen ? 'auto' : 'none'}
      style={clipStyle}
      testID={testID}
    >
      {/* Floated out of flow so it keeps its natural height while the clip above
          it is still zero. Measured in flow it never lays out at all — the
          parent starts collapsed, so `onLayout` never fires and the height it is
          waiting for never arrives. */}
      <View className="absolute top-0 right-0 left-0" onLayout={handleLayout} style={style}>
        {isOpen ? children : lastChildren.current}
      </View>
    </Animated.View>
  );
}

ComposerCollapsible.displayName = 'Composer.Collapsible';
