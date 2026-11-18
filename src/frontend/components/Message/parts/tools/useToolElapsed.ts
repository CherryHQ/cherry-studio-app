import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useMessageListLiveTailVisible } from '../../list/MessageListLiveTailContext';

/** Only the visible activity row ticks; provider messages and process details never do. */
export function useToolElapsed(startedAt: number | undefined, isRunning: boolean) {
  const { t } = useTranslation();
  const visible = useMessageListLiveTailVisible(isRunning);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!isRunning || !visible || startedAt === undefined || !Number.isFinite(startedAt)) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      clearInterval(timer);
      timer = undefined;
      if (AppState.currentState === 'active') {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 15_000);
      }
    };
    refresh();
    const listener = AppState.addEventListener('change', refresh);
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [isRunning, visible, startedAt]);
  return isRunning && startedAt !== undefined && Number.isFinite(startedAt)
    ? t('chat.tool.elapsed', { seconds: Math.max(0, Math.floor((now - startedAt) / 1000)) })
    : undefined;
}
