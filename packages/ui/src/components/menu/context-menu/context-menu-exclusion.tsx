import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, View, type ViewProps } from 'react-native';

type ExcludeTouch = (event: GestureResponderEvent) => void;

export const ContextMenuExclusionContext = createContext<ExcludeTouch | null>(null);

/** A child-owned interaction region inside a context menu. */
export function ContextMenuExclusion({ onTouchStart, ...props }: ViewProps) {
  const excludeTouch = use(ContextMenuExclusionContext);

  return (
    <View
      {...props}
      onTouchStart={(event) => {
        excludeTouch?.(event);
        onTouchStart?.(event);
      }}
    />
  );
}

/** Keeps exclusions sticky for the touch, while rearming recognition for the next one. */
export function useContextMenuTouch() {
  const [isTouchExcluded, setIsTouchExcluded] = useState(false);
  const touch = useRef({
    excludedStart: null as GestureResponderEvent['nativeEvent'] | null,
    isExcluded: false,
  });
  const excludeTouch = useCallback((event: GestureResponderEvent) => {
    // Child touch handlers bubble before the menu's handler. Keep the actual start
    // event so the parent can distinguish this exclusion from a previous gesture.
    touch.current.excludedStart = event.nativeEvent;
    touch.current.isExcluded = true;
    setIsTouchExcluded(true);
  }, []);
  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const isExcluded =
      touch.current.excludedStart === event.nativeEvent || event.nativeEvent.touches.length > 1;
    touch.current.isExcluded = isExcluded;
    setIsTouchExcluded(isExcluded);
  }, []);
  const onTouchFinish = useCallback((event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length === 0) {
      // The native recognizer must be enabled before the next DOWN. Its event-time
      // guard retains this touch's exclusion until a fresh start arrives.
      setIsTouchExcluded(false);
    }
  }, []);
  const onTouchCancel = useCallback(() => {
    setIsTouchExcluded(false);
  }, []);
  const interaction = useMemo(
    () => ({
      isRecognitionBlocked: () => touch.current.isExcluded,
    }),
    [],
  );

  return { excludeTouch, interaction, isTouchExcluded, onTouchCancel, onTouchFinish, onTouchStart };
}
