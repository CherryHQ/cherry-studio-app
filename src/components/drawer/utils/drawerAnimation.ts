import {
  Easing,
  LinearTransition,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

export const drawerSpringConfig = {
  damping: 500,
  mass: 3,
  overshootClamping: true,
  reduceMotion: ReduceMotion.Never,
  stiffness: 1000,
} as const satisfies WithSpringConfig;

export const drawerFadeTimingConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;

export const drawerContentLayoutTransition = LinearTransition.springify()
  .damping(drawerSpringConfig.damping)
  .mass(drawerSpringConfig.mass)
  .stiffness(drawerSpringConfig.stiffness)
  .overshootClamping(drawerSpringConfig.overshootClamping ? 1 : 0)
  .reduceMotion(drawerSpringConfig.reduceMotion);
