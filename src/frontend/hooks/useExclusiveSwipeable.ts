import { useCallback, useRef } from 'react';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

// Coordinates a list of independent `ReanimatedSwipeable` rows so opening one
// closes whichever other row was already open — the standard one-at-a-time
// swipe-to-reveal behavior. Each row still owns its own ref/state; this only
// tracks which one is currently open across the list.
export function useExclusiveSwipeable() {
  const openRef = useRef<SwipeableMethods | null>(null);

  const closeOpen = useCallback(() => {
    const open = openRef.current;
    openRef.current = null;
    open?.close();
  }, []);

  const notifyWillOpen = useCallback((swipeable: SwipeableMethods) => {
    if (openRef.current && openRef.current !== swipeable) {
      openRef.current.close();
    }
    openRef.current = swipeable;
  }, []);

  const notifyClose = useCallback((swipeable: SwipeableMethods) => {
    if (openRef.current === swipeable) {
      openRef.current = null;
    }
  }, []);

  return { closeOpen, notifyClose, notifyWillOpen };
}
