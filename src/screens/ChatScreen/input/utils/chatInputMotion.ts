import {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

export const chatInputMotionConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;

// Spring tuned to match the reference prompt-input expand/collapse feel.
export const chatInputSpringConfig = {
  stiffness: 380,
  damping: 34,
  mass: 1,
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithSpringConfig;

export const chatInputLayoutTransition = LinearTransition.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);

export const chatInputFadeIn = FadeIn.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);

export const chatInputFadeOut = FadeOut.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);
