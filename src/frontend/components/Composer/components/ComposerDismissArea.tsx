import type { PropsWithChildren } from 'react';
import { useCallback, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { View } from 'react-native';

import { useComposerPresentationActions } from '../context/ComposerProvider';

/** Movement (dp) beyond which a touch sequence is a scroll/drag, not a tap. */
const TAP_SLOP = 12;
/** Duration (ms) beyond which a stationary touch is a long press, not a tap. */
const TAP_MAX_DURATION_MS = 500;

/**
 * Only a completed background tap ends editing. Touch tracking is passive: the view never
 * enters the responder negotiation, so the ScrollView/child press handoff is untouched — a
 * pressable variant contested ownership with the list and broke scrolling on device.
 */
export function ComposerDismissArea({
  children,
  disabled,
  testID,
}: PropsWithChildren<{ disabled?: boolean; testID?: string }>) {
  const { dismissInput } = useComposerPresentationActions();
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null);

  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    touchStart.current = { x: pageX, y: pageY, at: Date.now() };
  }, []);

  const onTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || disabled) return;
      const { pageX, pageY } = event.nativeEvent;
      const isTap =
        Math.abs(pageX - start.x) <= TAP_SLOP &&
        Math.abs(pageY - start.y) <= TAP_SLOP &&
        Date.now() - start.at <= TAP_MAX_DURATION_MS;
      if (isTap) dismissInput();
    },
    [disabled, dismissInput],
  );

  const onTouchCancel = useCallback(() => {
    touchStart.current = null;
  }, []);

  return (
    <View
      accessible={false}
      className="flex-1"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      testID={testID}
    >
      {children}
    </View>
  );
}
