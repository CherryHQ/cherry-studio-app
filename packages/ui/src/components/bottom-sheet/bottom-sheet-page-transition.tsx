import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '../../motion';
import { bottomSheetPageMotion } from './bottom-sheet.layout';
import type { BottomSheetPageTransitionProps } from './bottom-sheet.types';

type PageSnapshot = Pick<BottomSheetPageTransitionProps, 'children' | 'depth' | 'pageKey'>;
type PageDirection = 'backward' | 'forward' | 'replace';

type TransitionState = {
  direction: PageDirection;
  id: number;
  outgoing: PageSnapshot | null;
  renderedKey: string;
};

const pageTiming = { duration: duration.base, easing: easing.settle } as const;

export function BottomSheetPageTransition({
  children,
  depth,
  pageKey,
  style,
  testID,
}: BottomSheetPageTransitionProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(1);
  const committedPageRef = useRef<PageSnapshot>({ children, depth, pageKey });
  const [transition, setTransition] = useState<TransitionState>({
    direction: 'replace',
    id: 0,
    outgoing: null,
    renderedKey: pageKey,
  });

  if (transition.renderedKey !== pageKey) {
    const outgoing = committedPageRef.current;
    const direction =
      depth > outgoing.depth ? 'forward' : depth < outgoing.depth ? 'backward' : 'replace';

    setTransition({
      direction,
      id: transition.id + 1,
      outgoing,
      renderedKey: pageKey,
    });
  }

  useLayoutEffect(() => {
    committedPageRef.current = { children, depth, pageKey };
  }, [children, depth, pageKey]);

  const finishTransition = useCallback((id: number) => {
    setTransition((current) =>
      current.id === id && current.outgoing ? { ...current, outgoing: null } : current,
    );
  }, []);

  useLayoutEffect(() => {
    if (!transition.outgoing) {
      progress.set(1);
      return;
    }

    if (reducedMotion) {
      progress.set(1);
      finishTransition(transition.id);
      return;
    }

    progress.set(0);
    progress.set(
      withTiming(1, pageTiming, (finished) => {
        if (finished) {
          scheduleOnRN(finishTransition, transition.id);
        }
      }),
    );

    return () => cancelAnimation(progress);
  }, [finishTransition, progress, reducedMotion, transition.id, transition.outgoing]);

  const direction =
    transition.direction === 'forward' ? 1 : transition.direction === 'backward' ? -1 : 0;
  const incomingStyle = useAnimatedStyle(() => ({
    filter: [{ blur: bottomSheetPageMotion.blur * (1 - progress.value) }],
    opacity: progress.value,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [bottomSheetPageMotion.distance * direction, 0],
        ),
      },
    ],
  }));
  const outgoingStyle = useAnimatedStyle(() => ({
    filter: [{ blur: bottomSheetPageMotion.blur * progress.value }],
    opacity: 1 - progress.value,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [0, -bottomSheetPageMotion.distance * direction],
        ),
      },
    ],
  }));

  return (
    <View style={[styles.viewport, style]} testID={testID}>
      {transition.outgoing ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          key={transition.outgoing.pageKey}
          pointerEvents="none"
          style={[styles.page, outgoingStyle]}
          testID={testID ? `${testID}-outgoing` : undefined}
        >
          {transition.outgoing.children}
        </Animated.View>
      ) : null}
      <Animated.View
        key={pageKey}
        style={[styles.page, incomingStyle]}
        testID={testID ? `${testID}-active` : undefined}
      >
        {children}
      </Animated.View>
    </View>
  );
}

BottomSheetPageTransition.displayName = 'BottomSheet.PageTransition';

const styles = StyleSheet.create({
  page: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
});
