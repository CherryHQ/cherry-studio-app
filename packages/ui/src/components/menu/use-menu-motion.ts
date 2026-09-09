import { useEffect, useState } from 'react';
import {
  cancelAnimation,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { menuCloseMotion, menuOpenMotion } from './menu-motion';

/** Closing disables rows immediately and retains the surface through its exit. */
export function useMenuMotion(isOpen: boolean, isMeasured = true) {
  const progress = useSharedValue(0);
  const isReducedMotion = useReducedMotion();
  const [hasExited, setHasExited] = useState(!isOpen);

  // A new open starts a new presentation before children commit. Only the
  // animation completion below marks it exited; no effect copies open state.
  if (isOpen && hasExited) setHasExited(false);

  useEffect(() => {
    let isCurrent = true;
    const finishExit = () => {
      if (isCurrent) setHasExited(true);
    };
    if (isOpen) {
      if (isMeasured) {
        progress.set(isReducedMotion ? 1 : withTiming(1, menuOpenMotion));
      }
    } else {
      progress.set(
        withTiming(0, isReducedMotion ? { duration: 0 } : menuCloseMotion, (finished) => {
          if (finished) {
            runOnJS(finishExit)();
          }
        }),
      );
    }
    return () => {
      isCurrent = false;
      cancelAnimation(progress);
    };
  }, [isMeasured, isOpen, isReducedMotion, progress]);

  return { progress, isVisible: isOpen || (!isReducedMotion && !hasExited) };
}
