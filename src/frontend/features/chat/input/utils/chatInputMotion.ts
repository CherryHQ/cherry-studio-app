// What is left of the chat input's own motion: the composer's sizes and fades
// now come from `@cherrystudio/ui/motion`, and only the inline camera and photo
// picker still animate on their own terms.
//
// Nothing here opts out of the system's reduced-motion setting any more. Every
// config used to carry `ReduceMotion.Never`, which was a defect rather than a
// decision — the composer respects the setting, and these had no reason not to.
import {
  Easing,
  type WithSpringConfig,
  type WithTimingConfig,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Snappy ease-in for dismissal so the subview retracts crisply.
const chatInputExitMotionConfig = {
  duration: 100,
  easing: Easing.in(Easing.cubic),
} as const satisfies WithTimingConfig;

// Initial/final scale for the inline subviews (camera / photo picker) as they
// pop in and out. Kept close to 1 so the embedded NATIVE views (VisionCamera
// preview, PHPicker) only scale a hair — a larger range would bitmap-stretch
// and blur them mid-animation.
const SUBVIEW_COLLAPSED_SCALE = 0.9;

// Springy enough for a full-screen pop-in. Drives the scale so the
// camera/picker springs in; opacity uses a flat 100ms fade.
const chatInputSubviewSpringConfig = {
  stiffness: 520,
  damping: 30,
  mass: 0.7,
} as const satisfies WithSpringConfig;

const chatInputSubviewEnterMotionConfig = {
  duration: 100,
  easing: Easing.out(Easing.cubic),
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
