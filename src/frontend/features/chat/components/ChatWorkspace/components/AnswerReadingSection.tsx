import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import Animated, {
  measure,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { useMessageListScroll } from '@/frontend/components/Message';

export type AnswerReadingSectionHandle = Readonly<{
  /** Aligns the section below the header before an optional layout-changing action. */
  revealTop: (onRevealed?: () => void) => void;
}>;

/**
 * An answer read in full under a bar naming it. While the answer scrolls under the list's top
 * inset, the bar stays there until the answer's end reaches it, so a reader several screens in
 * still sees which answer this is and can switch.
 */
export function AnswerReadingSection({
  bar,
  children,
  ref,
  revealKey,
}: {
  bar: ReactNode;
  children: ReactNode;
  ref?: Ref<AnswerReadingSectionHandle>;
  /** Changing it starts the reader at the section's top, as for another answer. */
  revealKey: string;
}) {
  const scroll = useMessageListScroll();
  const sectionRef = useAnimatedRef<Animated.View>();
  const barHeight = useSharedValue(0);
  const pinOffset = useSharedValue(0);
  // Captured separately: a worklet must not close over the context's JS functions.
  const listRef = scroll?.listRef;
  const scrollOffset = scroll?.scrollOffset;
  const topInset = scroll?.topInset ?? 0;
  const scrollToOffset = scroll?.scrollToOffset;

  const placeBar = useCallback(() => {
    'worklet';
    if (!listRef) return;
    const section = measure(sectionRef);
    const list = measure(listRef);
    if (!section || !list) return;
    const pin = list.pageY + topInset;
    pinOffset.set(
      Math.min(Math.max(pin - section.pageY, 0), Math.max(0, section.height - barHeight.get())),
    );
  }, [barHeight, listRef, pinOffset, sectionRef, topInset]);
  useAnimatedReaction(() => scrollOffset?.get() ?? 0, placeBar);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pinOffset.get() }] }));

  // A programmatic scroll lands after the frame that measured it, so the bar is placed again then.
  const scrollTo = useCallback(
    (offset: number, onRevealed?: () => void) => {
      scrollToOffset?.(offset);
      requestAnimationFrame(() => {
        if (onRevealed) {
          onRevealed();
          // Folding changes the list's content size; apply the target after its anchor correction.
          requestAnimationFrame(() => scrollToOffset?.(offset));
        } else {
          runOnUI(placeBar)();
        }
      });
    },
    [placeBar, scrollToOffset],
  );
  const revealTop = useCallback(
    (onRevealed?: () => void) => {
      if (!listRef || !scrollOffset) {
        onRevealed?.();
        return;
      }
      runOnUI((complete?: () => void) => {
        const section = measure(sectionRef);
        const list = measure(listRef);
        if (!section || !list) {
          if (complete) runOnJS(complete)();
          return;
        }
        const pin = list.pageY + topInset;
        runOnJS(scrollTo)(scrollOffset.get() + section.pageY - pin, complete);
      })(onRevealed);
    },
    [listRef, scrollOffset, scrollTo, sectionRef, topInset],
  );
  useImperativeHandle(ref, () => ({ revealTop }), [revealTop]);
  // Opening the section and showing another answer start at the top once laid out; layout
  // within one answer does not move the reader.
  const pendingReveal = useRef(true);
  useEffect(() => {
    pendingReveal.current = true;
    revealTop();
  }, [revealKey, revealTop]);
  const handleLayout = () => {
    if (pendingReveal.current) {
      pendingReveal.current = false;
      revealTop();
    }
    runOnUI(placeBar)();
  };

  return (
    <Animated.View collapsable={false} onLayout={handleLayout} ref={sectionRef}>
      <Animated.View
        onLayout={(event) => barHeight.set(event.nativeEvent.layout.height)}
        style={[{ zIndex: 1 }, barStyle]}
      >
        {bar}
      </Animated.View>
      {children}
    </Animated.View>
  );
}
