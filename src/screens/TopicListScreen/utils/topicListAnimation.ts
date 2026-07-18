// Android-only: retained for the custom messages-tab header transition.
import {
  Easing,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

export const topicListSpringConfig = {
  damping: 500,
  mass: 3,
  overshootClamping: true,
  reduceMotion: ReduceMotion.Never,
  stiffness: 1000,
} as const satisfies WithSpringConfig;

export const topicListFadeTimingConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;
