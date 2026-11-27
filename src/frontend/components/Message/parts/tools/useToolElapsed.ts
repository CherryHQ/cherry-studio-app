import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useMessageListLiveTailVisible } from '../../list/MessageListLiveTailContext';

const ELAPSED_STEP_MS = 1_000;

function computeElapsedSeconds(startedAt: number, now: number) {
  return Math.max(0, Math.floor((now - startedAt) / ELAPSED_STEP_MS));
}

function computeNextTickDelayMs(startedAt: number, now: number) {
  const elapsedMs = now - startedAt;
  if (elapsedMs < 0) {
    return Math.max(1, Math.min(ELAPSED_STEP_MS, Math.ceil(-elapsedMs)));
  }
  return Math.max(1, Math.ceil(ELAPSED_STEP_MS - (elapsedMs % ELAPSED_STEP_MS)));
}

/** Only the visible activity row ticks; provider messages and process details never do. */
export function useToolElapsed(startedAt: number | undefined, isRunning: boolean) {
  const { t } = useTranslation();
  const visible = useMessageListLiveTailVisible(isRunning);
  const [now, setNow] = useState(Date.now);

  useLayoutEffect(() => {
    if (!isRunning || !visible || startedAt === undefined || !Number.isFinite(startedAt)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const syncAndSchedule = (appState: typeof AppState.currentState = AppState.currentState) => {
      clearTimer();
      if (cancelled || appState !== 'active') return;
      const currentNow = Date.now();
      setNow((prev) =>
        computeElapsedSeconds(startedAt, prev) === computeElapsedSeconds(startedAt, currentNow)
          ? prev
          : currentNow,
      );
      timer = setTimeout(syncAndSchedule, computeNextTickDelayMs(startedAt, currentNow));
    };
    syncAndSchedule(AppState.currentState);
    const listener = AppState.addEventListener('change', syncAndSchedule);
    return () => {
      cancelled = true;
      clearTimer();
      listener.remove();
    };
  }, [isRunning, visible, startedAt]);

  return isRunning && startedAt !== undefined && Number.isFinite(startedAt)
    ? t('chat.tool.elapsed', { seconds: computeElapsedSeconds(startedAt, now) })
    : undefined;
}
