import { resolveScheme } from 'expo-linking';
import {
  addNotificationPresentedListener,
  dismissNotificationAsync,
  getPresentedNotificationsAsync,
  type Notification,
} from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import {
  type BackgroundTaskLink,
  isSameBackgroundTask,
  parseBackgroundTaskUrl,
} from '@/shared/backgroundActivity/taskLink';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { registerVisibleBackgroundTask } from '../foregroundActivityAttention';

const logger = loggerService.withContext('BackgroundTaskNotifications');

export function useBackgroundTaskNotifications(
  task: BackgroundTaskLink | undefined,
  enabled = true,
): void {
  const scheme = resolveScheme({});
  const taskKind = task?.kind;
  const taskId = task?.kind === 'chat' ? task.sessionId : task?.paintingId;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !taskKind || !taskId) return;
      const target: BackgroundTaskLink =
        taskKind === 'chat'
          ? { kind: taskKind, sessionId: taskId }
          : { kind: taskKind, paintingId: taskId };
      let releaseVisibility: (() => void) | undefined;
      let focused = true;

      const dismissViewed = async (notification: Notification) => {
        const { data } = notification.request.content;
        if (
          focused &&
          AppState.currentState === 'active' &&
          data?.owner === BACKGROUND_NOTIFICATION_OWNER &&
          isSameBackgroundTask(target, parseBackgroundTaskUrl(data.url, scheme))
        ) {
          await dismissNotificationAsync(notification.request.identifier);
        }
      };
      const reportError = (error: unknown) =>
        logger.warn('Could not clear viewed notification', { error });
      const updateVisibility = () => {
        releaseVisibility?.();
        releaseVisibility = undefined;
        if (AppState.currentState !== 'active') return;
        releaseVisibility = registerVisibleBackgroundTask(target);
        void getPresentedNotificationsAsync()
          .then((notifications) => Promise.all(notifications.map(dismissViewed)))
          .catch(reportError);
      };

      // The native presentation event follows the actual post, including background
      // delivery. Receipt alone can happen before posting or never reach JS at all.
      const presented = addNotificationPresentedListener((notification) => {
        void dismissViewed(notification).catch(reportError);
      });
      const appState = AppState.addEventListener('change', updateVisibility);
      updateVisibility();
      return () => {
        focused = false;
        releaseVisibility?.();
        appState.remove();
        presented.remove();
      };
    }, [enabled, scheme, taskId, taskKind]),
  );
}
