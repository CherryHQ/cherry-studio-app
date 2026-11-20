import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

export interface NextFrameScheduler {
  schedule(callback: () => void): void;
  cancel(): void;
}

/**
 * Schedules a single callback on the next animation frame, replacing any previously pending frame
 * and cancelling automatically on unmount.
 */
export function useNextFrame(): NextFrameScheduler {
  const frameRef = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
  }, []);

  const schedule = useCallback(
    (callback: () => void) => {
      cancel();
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined;
        callback();
      });
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}

/** Invokes `callback` on the next animation frame whenever `isActive` transitions to true. */
export function useAfterNextFrame(isActive: boolean, callback: () => void): void {
  const onFrame = useEffectEvent(callback);

  useEffect(() => {
    if (!isActive) return;
    const frameId = requestAnimationFrame(() => {
      onFrame();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isActive]);
}
