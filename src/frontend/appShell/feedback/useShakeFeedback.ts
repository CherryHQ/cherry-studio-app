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
  prepareForNavigation,
  canStart,
  captureScreenshot,
}: {
  enabled: boolean;
  captureScreenshot: boolean;
  canStart: () => boolean;
  route: string;
  prepareForNavigation: (signal: AbortSignal) => Promise<boolean>;
  onCaptured: (screenshot: FeedbackScreenshot | undefined) => void;
}) {
  const canBegin = useEffectEvent(canStart);
  const captured = useEffectEvent(onCaptured);
  const prepare = useEffectEvent(prepareForNavigation);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let pending = false;
    let handoff: AbortController | undefined;
    let generation = 0;
    let subscription: ReturnType<typeof observeDiagnosticMotion>;
    let detect = createShakeDetector();

    async function capture() {
      if (pending || disposed || AppState.currentState !== 'active' || !canBegin()) return;
      pending = true;
      const started = generation;
      const controller = new AbortController();
      handoff = controller;
      let screenshot: FeedbackScreenshot | undefined;
      try {
        if (captureScreenshot) screenshot = await captureFeedbackScreenshot();
      } catch {
        // A failed capture still allows text feedback; the form explains the missing image.
      }
      if (disposed || generation !== started || AppState.currentState !== 'active') {
        if (screenshot) removeFeedbackScreenshot(screenshot);
        pending = false;
        return;
      }
      let ready = false;
      try {
        ready = await prepare(controller.signal);
      } catch {
        // Preserve the current surface if it cannot safely yield to navigation.
      }
      if (!ready || disposed || generation !== started || AppState.currentState !== 'active') {
        if (screenshot) removeFeedbackScreenshot(screenshot);
        pending = false;
        return;
      }
      // Keep admission closed until the route changes, even if navigation takes a frame.
      captured(screenshot);
    }

    function updateSubscription() {
      generation++;
      handoff?.abort();
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
      handoff?.abort();
      subscription?.remove();
      appState.remove();
    };
  }, [enabled, route, captureScreenshot]);
}
