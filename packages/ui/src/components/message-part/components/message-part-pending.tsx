import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, View } from 'react-native';
import Animated, { type CSSAnimationProperties, useReducedMotion } from 'react-native-reanimated';

import { ShimmerText } from '../../shimmer-text';
import type { MessagePartPendingProps } from '../message-part.types';
import { MessagePartStatus, MessagePartStatusTextFloor } from './message-part-status';

// Desktop uses react-spinners BeatLoader with size=4 and speedMultiplier=0.8.
// Keep its linear 0.7s / 0.8 cycle and the middle dot's half-cycle delay.
const BEAT_ANIMATION = {
  animationDuration: 875,
  animationFillMode: 'both',
  animationIterationCount: 'infinite',
  animationName: {
    from: { opacity: 1, transform: [{ scale: 1 }] },
    '50%': { opacity: 0.2, transform: [{ scale: 0.75 }] },
    to: { opacity: 1, transform: [{ scale: 1 }] },
  },
  animationTimingFunction: 'linear',
} satisfies CSSAnimationProperties;
const BEAT_DOTS = [
  { delay: 0, key: 'leading' },
  { delay: 437.5, key: 'middle' },
  { delay: 0, key: 'trailing' },
] as const;

export function MessagePartPending({
  accessibilityLabel,
  reason,
  testID,
}: MessagePartPendingProps) {
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active');
    });
    const reduceMotion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      appState.remove();
      reduceMotion.remove();
    };
  }, []);

  const isAnimating = isForeground && !reducedMotion;

  return (
    <MessagePartStatus testID={testID}>
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        accessible
        className="shrink-0 flex-row items-center gap-1 p-0.5"
      >
        {BEAT_DOTS.map(({ delay, key }) => (
          <Animated.View
            className="size-1 rounded-full bg-foreground-tertiary"
            key={key}
            style={
              isAnimating ? { ...BEAT_ANIMATION, animationDelay: delay } : { animationName: 'none' }
            }
          />
        ))}
      </View>
      {/* Match a text status row so the first reasoning or content token does not shift the row. */}
      {reason ? (
        <ShimmerText className="text-sm" numberOfLines={1}>
          {reason}
        </ShimmerText>
      ) : (
        <MessagePartStatusTextFloor />
      )}
    </MessagePartStatus>
  );
}
