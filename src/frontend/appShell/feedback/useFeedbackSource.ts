import { useIsFocused, usePathname } from 'expo-router';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { useFeedbackActions } from './FeedbackCaptureProvider';
import type { FeedbackContextInput } from './feedbackContext';

/** A focused page supplies metadata on demand; streamed updates never enter app-wide state. */
export function useFeedbackSource(read: () => FeedbackContextInput) {
  const { registerSource } = useFeedbackActions();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const latest = useRef(read);
  useLayoutEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    if (isFocused) return registerSource(pathname, () => latest.current());
  }, [isFocused, pathname, registerSource]);
}
