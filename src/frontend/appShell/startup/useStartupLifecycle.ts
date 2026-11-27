import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';

import { loggerService } from '@/shared/core/logger/LoggerService';
import { recordStartupEvent } from '@/shared/core/logger/startupDiagnostics';

import { isStartupReadyToExit, STARTUP_CONTENT_TIMEOUT_MS } from './startupState';

const logger = loggerService.withContext('StartupCoordinator');

export function useStartupLifecycle(bootstrapReady: boolean) {
  const [contentReady, setContentReady] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const didHideSplashRef = useRef(false);
  const didReportContentReadyRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!bootstrapReady || contentReady || timedOut) {
      return;
    }

    const timer = setTimeout(() => {
      logger.warn('Initial content did not report readiness before the startup timeout', {
        operation: 'startup.content.timeout',
      });
      setTimedOut(true);
    }, STARTUP_CONTENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [bootstrapReady, contentReady, timedOut]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reportContentReady = useCallback(() => {
    if (!didReportContentReadyRef.current) {
      didReportContentReadyRef.current = true;
      recordStartupEvent('startup.content.ready', 'completed');
    }
    setContentReady(true);
  }, []);

  const exitRequested = isStartupReadyToExit({
    bootstrapReady,
    contentReady,
    timedOut,
  });

  useEffect(() => {
    if (!exitRequested || didHideSplashRef.current) {
      return;
    }

    didHideSplashRef.current = true;
    void SplashScreen.hideAsync()
      .catch(() => undefined)
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }

        recordStartupEvent('startup.splash.hidden', 'completed');
        setCoverVisible(false);
      });
  }, [exitRequested]);

  return {
    coverVisible,
    reportContentReady,
  };
}
