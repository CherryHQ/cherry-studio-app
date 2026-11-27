import { easing } from '@cherrystudio/ui/motion';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { SpeechPhase } from '@/shared/contracts/voice';

import { useLiveReducedMotion } from './useLiveReducedMotion';

const BAR_SPECS = [
  { id: 'left', delay: 0, duration: 480, min: 0.35, max: 0.9, staticActive: 0.6 },
  { id: 'center', delay: 140, duration: 600, min: 0.45, max: 1.0, staticActive: 1.0 },
  { id: 'right', delay: 80, duration: 520, min: 0.3, max: 0.85, staticActive: 0.72 },
] as const;

const RESTING_BAR_SCALES = [0.32, 0.38, 0.32] as const;

/**
 * Motion: ambient audio activity indicator for active read-aloud.
 * Trigger: enters when speech `phase === 'playing'` while the app is active.
 * Ownership: SpeechPlaybackBar leading status badge (`transform: scaleY` on the UI thread).
 * Interruption: cancels immediately on pause, stop, unmount, or backgrounding (`AppState !== 'active'`).
 * Reduced motion: replaces looping motion with static balanced bar heights while playing.
 */
function WaveformBar({
  active,
  paused,
  reducedMotion,
  spec,
  restingScale,
}: {
  active: boolean;
  paused: boolean;
  reducedMotion: boolean;
  spec: (typeof BAR_SPECS)[number];
  restingScale: number;
}) {
  const targetStatic = paused ? restingScale : spec.staticActive;
  const scaleY = useSharedValue<number>(targetStatic);

  useEffect(() => {
    if (active && !reducedMotion) {
      scaleY.set(spec.min);
      scaleY.set(
        withDelay(
          spec.delay,
          withRepeat(
            withSequence(
              withTiming(spec.max, { duration: spec.duration, easing: easing.inOut }),
              withTiming(spec.min, { duration: spec.duration, easing: easing.inOut }),
            ),
            -1,
            false,
          ),
        ),
      );
      return () => {
        cancelAnimation(scaleY);
      };
    }

    cancelAnimation(scaleY);
    scaleY.set(targetStatic);
    return undefined;
  }, [active, reducedMotion, scaleY, spec, targetStatic]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.get() }],
  }));

  return (
    <Animated.View
      className={`h-3.5 w-[2.5px] rounded-full ${paused ? 'bg-muted-foreground' : 'bg-primary'}`}
      style={animatedStyle}
    />
  );
}

/** Compact three-bar indicator reflecting active reading vs paused silence. */
export function SpeechWaveform({ phase }: { phase: Exclude<SpeechPhase, 'preparing'> }) {
  const reducedMotion = useLiveReducedMotion();
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const isPlaying = phase === 'playing';
  const animate = isPlaying && isAppActive;

  return (
    <View
      accessibilityElementsHidden
      className="h-3.5 w-4 flex-row items-center justify-center gap-[2.5px]"
      importantForAccessibility="no-hide-descendants"
      testID={`speech-waveform-${phase}`}
    >
      {BAR_SPECS.map((spec, index) => (
        <WaveformBar
          key={spec.id}
          active={animate}
          paused={!isPlaying}
          reducedMotion={reducedMotion}
          restingScale={RESTING_BAR_SCALES[index]!}
          spec={spec}
        />
      ))}
    </View>
  );
}
