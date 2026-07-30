import { RefreshCcwIcon } from 'lucide-uniwind/png';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const rotationDurationMs = 900;

/**
 * The pull icon, spinning clockwise.
 *
 * A bottom-toolbar button has no busy state of its own, so an in-flight pull
 * swaps the button out for this inside a `Stack.Toolbar.View`.
 */
export function PullSpinner({ className }: { className?: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: rotationDurationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <RefreshCcwIcon className={className} strokeWidth={2} />
    </Animated.View>
  );
}
