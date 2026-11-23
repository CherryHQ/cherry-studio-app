import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { useNavigationShell } from './state';

const LONG_PRESS_DURATION_MS = 440;
const DRAG_MOVE_THRESHOLD = 10;

/** Shared long-press popover + drag gesture for dock middle tabs and 「更多」 module cards. */
export function usePinDragGesture(id: NavigationPinTabId, source: 'dock' | 'more') {
  const { endDrag, openPinPopover, startDrag, updateDrag } = useNavigationShell();
  const dragActivated = useSharedValue(false);

  return useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_DURATION_MS)
      .runOnJS(true)
      .onStart(() => {
        dragActivated.set(false);
      })
      .onUpdate((event) => {
        if (
          !dragActivated.get() &&
          Math.hypot(event.translationX, event.translationY) >= DRAG_MOVE_THRESHOLD
        ) {
          dragActivated.set(true);
          startDrag({ id, source, x: event.absoluteX, y: event.absoluteY });
          return;
        }
        if (dragActivated.get()) {
          updateDrag(event.absoluteX, event.absoluteY);
        }
      })
      .onEnd((event) => {
        if (dragActivated.get()) {
          endDrag();
        } else {
          openPinPopover({ id, source, x: event.absoluteX, y: event.absoluteY });
        }
        dragActivated.set(false);
      })
      .onFinalize(() => {
        if (dragActivated.get()) {
          endDrag();
          dragActivated.set(false);
        }
      });
  }, [dragActivated, endDrag, id, openPinPopover, source, startDrag, updateDrag]);
}
