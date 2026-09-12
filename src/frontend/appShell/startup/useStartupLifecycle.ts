import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  isStartupReadyToExit,
  STARTUP_CONTENT_TIMEOUT_MS,
  STARTUP_MINIMUM_VISIBLE_MS,
} from './startupState';

const logger = loggerService.withContext('StartupCoordinator');

export function useStartupLifecycle(bootstrapReady: boolean, onCoverPresented?: () => void) {
  const [contentReady, setContentReady] = useState(false);
  const [coverPresented, setCoverPresented] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const didHandleCoverLayoutRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingFramesRef = useRef<{ first?: number; second?: number }>({});
  const minimumTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!bootstrapReady || contentReady || timedOut) {
      return;
    }

    const timer = setTimeout(() => {
      logger.warn('Initial content did not report readiness before the startup timeout');
      setTimedOut(true);
    }, STARTUP_CONTENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [bootstrapReady, contentReady, timedOut]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const { first, second } = pendingFramesRef.current;
      if (first !== undefined) {
        cancelAnimationFrame(first);
      }
      if (second !== undefined) {
        cancelAnimationFrame(second);
      }
      if (minimumTimerRef.current !== undefined) {
        clearTimeout(minimumTimerRef.current);
      }
      pendingFramesRef.current = {};
    };
  }, []);

  const runAfterTwoFrames = useCallback((callback: () => void) => {
    pendingFramesRef.current.first = requestAnimationFrame(() => {
      pendingFramesRef.current.first = undefined;
      pendingFramesRef.current.second = requestAnimationFrame(() => {
        pendingFramesRef.current.second = undefined;
        callback();
      });
    });
  }, []);
  const reportContentReady = useCallback(() => setContentReady(true), []);
  const handleCoverLayout = useCallback(() => {
    if (didHandleCoverLayoutRef.current) {
      return;
    }

    didHandleCoverLayoutRef.current = true;
    // Fabric can emit onLayout before the view reaches the first composited
    // frame. Keep the native surface up until the cover has crossed that gap.
    runAfterTwoFrames(() => {
      void SplashScreen.hideAsync()
        .catch(() => undefined)
        .then(() => {
          if (!isMountedRef.current) {
            return;
          }

          // The native API resolves after dispatching its main-thread removal,
          // not after the React Native cover is visible. Cross two more frames
          // before starting the cover's minimum visible duration.
          runAfterTwoFrames(() => {
            if (!isMountedRef.current) {
              return;
            }

            minimumTimerRef.current = setTimeout(() => {
              minimumTimerRef.current = undefined;
              setMinimumElapsed(true);
            }, STARTUP_MINIMUM_VISIBLE_MS);
            setCoverPresented(true);
            onCoverPresented?.();
          });
        });
    });
  }, [onCoverPresented, runAfterTwoFrames]);
  const handleCoverExitComplete = useCallback(() => setCoverVisible(false), []);
  const exitRequested = isStartupReadyToExit({
    bootstrapReady,
    contentReady,
    minimumElapsed,
    timedOut,
  });

  return {
    coverPresented,
    coverVisible,
    exitRequested,
    handleCoverExitComplete,
    handleCoverLayout,
    reportContentReady,
  };
}
