import { haptics } from '@cherrystudio/ui/haptics';
import { useEffect, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { useNavigationShellActions } from './state';

const LONG_PRESS_DURATION_MS = 350;
const DRAG_MOVE_THRESHOLD = 8;

type UsePinDragGestureOptions = {
  onArmedChange?: (armed: boolean) => void;
};

/** Shared long-press popover + drag gesture for dock middle tabs and 「更多」 module cards. */
export function usePinDragGesture(
  id: NavigationPinTabId,
  source: 'dock' | 'more',
  options?: UsePinDragGestureOptions,
) {
  const { endDrag, openPinPopover, startDrag, updateDrag } = useNavigationShellActions();
  const dragActivated = useSharedValue(false);
  const onArmedChange = options?.onArmedChange;

  useEffect(() => {
    return () => {
      if (dragActivated.get()) {
        dragActivated.set(false);
        endDrag();
      }
    };
  }, [dragActivated, endDrag]);

  return useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_DURATION_MS)
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onStart(() => {
        dragActivated.set(false);
        haptics.light();
        onArmedChange?.(true);
      })
      .onUpdate((event) => {
        if (
          !dragActivated.get() &&
          Math.hypot(event.translationX, event.translationY) >= DRAG_MOVE_THRESHOLD
        ) {
          dragActivated.set(true);
          onArmedChange?.(false);
          startDrag({ id, source, x: event.absoluteX, y: event.absoluteY });
          return;
        }
        if (dragActivated.get()) {
          updateDrag(event.absoluteX, event.absoluteY);
        }
      })
      .onEnd((event) => {
        onArmedChange?.(false);
        if (dragActivated.get()) {
          dragActivated.set(false);
          endDrag();
        } else {
          openPinPopover({ id, source, x: event.absoluteX, y: event.absoluteY });
        }
      })
      .onFinalize(() => {
        onArmedChange?.(false);
        if (dragActivated.get()) {
          dragActivated.set(false);
          endDrag();
        }
      });
  }, [dragActivated, endDrag, id, onArmedChange, openPinPopover, source, startDrag, updateDrag]);
}
