import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import type { BackgroundTaskLink } from '@/shared/backgroundActivity/taskLink';

import { registerVisibleBackgroundTask } from '../foregroundActivityAttention';

/**
 * Reports the task this screen shows while it is focused and the app is in the
 * foreground. Registration is platform-blind: both a Live Activity and a
 * notification are retired once the user is looking at their destination.
 */
export function useVisibleBackgroundTask(task: BackgroundTaskLink | undefined, enabled: boolean) {
  const taskKind = task?.kind;
  const taskId = task?.kind === 'chat' ? task.sessionId : task?.paintingId;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !taskKind || !taskId) return;
      const target: BackgroundTaskLink =
        taskKind === 'chat'
          ? { kind: taskKind, sessionId: taskId }
          : { kind: taskKind, paintingId: taskId };
      let release: (() => void) | undefined;
      const sync = () => {
        release?.();
        release =
          AppState.currentState === 'active' ? registerVisibleBackgroundTask(target) : undefined;
      };
      const appState = AppState.addEventListener('change', sync);
      sync();
      return () => {
        release?.();
        appState.remove();
      };
    }, [enabled, taskId, taskKind]),
  );
}
