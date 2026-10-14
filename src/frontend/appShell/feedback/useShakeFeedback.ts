import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

import { observeDiagnosticMotion } from '../../../../modules/diagnostics';
import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  type FeedbackScreenshot,
} from './feedbackScreenshot';
import { createShakeDetector } from './shakeDetector';

export function useShakeFeedback({
  enabled,
  route,
  onCaptured,
}: {
  enabled: boolean;
  route: string;
  onCaptured: (screenshot: FeedbackScreenshot | undefined) => void;
}) {
  const captured = useEffectEvent(onCaptured);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let pending = false;
    let generation = 0;
    let subscription: ReturnType<typeof observeDiagnosticMotion>;
    let detect = createShakeDetector();

    async function capture() {
      if (pending || disposed || AppState.currentState !== 'active') return;
      pending = true;
      const started = generation;
      let screenshot: FeedbackScreenshot | undefined;
      try {
        screenshot = await captureFeedbackScreenshot();
      } catch {
        // A failed capture still allows text feedback; the form explains the missing image.
      }
      if (disposed || generation !== started || AppState.currentState !== 'active') {
        if (screenshot) removeFeedbackScreenshot(screenshot);
        pending = false;
        return;
      }
      // Keep admission closed until the route changes, even if navigation takes a frame.
      captured(screenshot);
    }

    function updateSubscription() {
      generation++;
      subscription?.remove();
      subscription = undefined;
      detect = createShakeDetector();
      if (AppState.currentState === 'active') {
        subscription = observeDiagnosticMotion((sample) => {
          if (detect(sample)) void capture();
        });
      }
    }
    updateSubscription();
    const appState = AppState.addEventListener('change', updateSubscription);
    return () => {
      disposed = true;
      subscription?.remove();
      appState.remove();
    };
  }, [enabled, route]);
}
