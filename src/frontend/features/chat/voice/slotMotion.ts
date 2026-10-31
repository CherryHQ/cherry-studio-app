import { duration, easing } from '@cherrystudio/ui/motion';
import { type EntryExitAnimationFunction, withTiming } from 'react-native-reanimated';

const swapTiming = { duration: duration.fast, easing: easing.settle };

// Motion: a composer slot's actions cross-fade with a slight scale when dictation or the draft
// changes their role, so the swap reads as one control changing. Reduced motion swaps instantly.
export const slotEnter: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, swapTiming),
      transform: [{ scale: withTiming(1, swapTiming) }],
    },
  };
};

export const slotExit: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, swapTiming),
      transform: [{ scale: withTiming(0.6, swapTiming) }],
    },
  };
};
