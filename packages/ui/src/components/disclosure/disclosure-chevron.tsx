import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { useEffect } from 'react';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing } from '../../motion';

const disclosureIconMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

export function DisclosureChevron({
  expanded,
  className = 'size-4 shrink-0 text-muted-foreground',
}: {
  expanded: boolean;
  className?: string;
}) {
  const rotation = useSharedValue(expanded ? 90 : 0);

  useEffect(() => {
    rotation.set(withTiming(expanded ? 90 : 0, disclosureIconMotion));
  }, [expanded, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={animatedStyle}>
      <ChevronRightIcon className={className} />
    </Animated.View>
  );
}
