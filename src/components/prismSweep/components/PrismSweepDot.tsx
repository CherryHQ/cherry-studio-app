import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const PEAK_OPACITY = 1;
// Trough of the active sweep's own comet-trail decay — dim, not empty, so
// gaps between passes still read as part of a lit grid.
const REST_OPACITY = 0.14;
// Every dot once the sweep stops entirely (not animating / reduced motion) —
// deliberately brighter than REST_OPACITY so the grid reads as a filled,
// muted icon instead of looking empty.
const IDLE_OPACITY = 0.45;
// How far a dot's own bright-to-dim decay stretches across the full cycle.
const FADE_SPAN = 0.34;
// How much of the cycle the sweep uses to reach the last dot; keeping this
// well above FADE_SPAN lets several dots stay lit at once, giving the sweep
// its comet-trail look instead of a single isolated blink.
const SWEEP_SPAN = 0.9;

type PrismSweepDotProps = {
  className?: string;
  isAnimating: boolean;
  orderFraction: number;
  progress: SharedValue<number>;
  size: number;
};

export function PrismSweepDot({
  className,
  isAnimating,
  orderFraction,
  progress,
  size,
}: PrismSweepDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (!isAnimating) {
      return { opacity: IDLE_OPACITY };
    }

    const localPhase = (((progress.value - orderFraction * SWEEP_SPAN) % 1) + 1) % 1;
    const opacity = interpolate(
      localPhase,
      [0, 0.05, 0.12, 0.22, FADE_SPAN, 1],
      [PEAK_OPACITY, 0.82, 0.55, 0.32, REST_OPACITY, REST_OPACITY],
      Extrapolation.CLAMP,
    );

    return { opacity };
  }, [isAnimating, orderFraction]);

  return (
    <Animated.View
      className={className}
      style={[{ width: size, height: size, borderRadius: size / 2 }, animatedStyle]}
    />
  );
}
