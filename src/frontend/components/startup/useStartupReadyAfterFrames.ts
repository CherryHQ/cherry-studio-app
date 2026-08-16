import { useCallback, useEffect, useRef } from 'react';

import { useReportStartupContentReady } from './StartupReadinessContext';

type PendingFrames = {
  first?: number;
  second?: number;
};

export function useStartupReadyAfterFrames() {
  const reportContentReady = useReportStartupContentReady();
  const pendingFramesRef = useRef<PendingFrames>({});
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    return () => {
      const { first, second } = pendingFramesRef.current;
      if (first !== undefined) {
        cancelAnimationFrame(first);
      }
      if (second !== undefined) {
        cancelAnimationFrame(second);
      }
      pendingFramesRef.current = {};
    };
  }, []);

  return useCallback(() => {
    if (hasScheduledRef.current) {
      return;
    }

    hasScheduledRef.current = true;
    pendingFramesRef.current.first = requestAnimationFrame(() => {
      pendingFramesRef.current.first = undefined;
      pendingFramesRef.current.second = requestAnimationFrame(() => {
        pendingFramesRef.current.second = undefined;
        reportContentReady();
      });
    });
  }, [reportContentReady]);
}
