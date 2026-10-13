import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, type PanResponderCallbacks } from 'react-native';

/** Retain the native gesture's accumulated displacement while preview updates re-render. */
export function useImagePanResponder(callbacks: PanResponderCallbacks) {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  }, [callbacks]);
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: (event, gesture) =>
        latest.current.onStartShouldSetPanResponder?.(event, gesture) ?? false,
      onPanResponderGrant: (event, gesture) => latest.current.onPanResponderGrant?.(event, gesture),
      onPanResponderMove: (event, gesture) => latest.current.onPanResponderMove?.(event, gesture),
      onPanResponderRelease: (event, gesture) =>
        latest.current.onPanResponderRelease?.(event, gesture),
      onPanResponderTerminationRequest: (event, gesture) =>
        latest.current.onPanResponderTerminationRequest?.(event, gesture) ?? true,
      onPanResponderTerminate: (event, gesture) =>
        latest.current.onPanResponderTerminate?.(event, gesture),
    }),
  );
  return responder.panHandlers;
}
