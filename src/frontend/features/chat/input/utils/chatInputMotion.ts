import {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const chatInputMotionConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;

// Snappy ease-in for dismissal so the subview retracts crisply.
export const chatInputExitMotionConfig = {
  duration: 100,
  easing: Easing.in(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;

// Spring tuned to match the reference prompt-input expand/collapse feel.
export const chatInputSpringConfig = {
  stiffness: 380,
  damping: 34,
  mass: 1,
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithSpringConfig;

// Initial/final scale for the inline subviews (camera / photo picker) as they
// pop in and out. Kept close to 1 so the embedded NATIVE views (VisionCamera
// preview, PHPicker) only scale a hair — a larger range would bitmap-stretch
// and blur them mid-animation.
const SUBVIEW_COLLAPSED_SCALE = 0.9;

// Spring dedicated to the inline subviews — faster/springier than the shared
// chatInputSpringConfig, which felt sluggish for a full-screen pop-in. Drives the
// scale so the camera/picker springs in; opacity uses a flat 100ms fade.
const chatInputSubviewSpringConfig = {
  stiffness: 520,
  damping: 30,
  mass: 0.7,
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithSpringConfig;

const chatInputSubviewEnterMotionConfig = {
  duration: 100,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;

// Custom reanimated entering/exiting for the inline camera & photo picker: a
// scale-up-from-90% + fade, anchored to the top of the sheet (set via
// `transformOrigin: 'top'` on the wrapping Animated.View) so it reads as the
// view growing out of the media-row buttons; reversed on dismiss.
export function chatInputSubviewEntering() {
  'worklet';

  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: SUBVIEW_COLLAPSED_SCALE }],
    },
    animations: {
      opacity: withTiming(1, chatInputSubviewEnterMotionConfig),
      transform: [{ scale: withSpring(1, chatInputSubviewSpringConfig) }],
    },
  };
}

export function chatInputSubviewExiting() {
  'worklet';

  return {
    initialValues: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },
    animations: {
      opacity: withTiming(0, chatInputExitMotionConfig),
      transform: [{ scale: withTiming(SUBVIEW_COLLAPSED_SCALE, chatInputExitMotionConfig) }],
    },
  };
}

export const chatInputLayoutTransition = LinearTransition.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);

export const chatInputFadeIn = FadeIn.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);

export const chatInputFadeOut = FadeOut.duration(chatInputMotionConfig.duration)
  .easing(chatInputMotionConfig.easing)
  .reduceMotion(chatInputMotionConfig.reduceMotion);
