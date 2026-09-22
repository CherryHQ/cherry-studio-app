import { AppState } from 'react-native';

import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isNotificationAllowed } from '@/shared/notifications/notificationPermission';

import type { BackgroundReplyOutcome } from './backgroundReplyTypes';

const logger = loggerService.withContext('ReplyCompletionNotifications');

type Notifications = typeof import('expo-notifications');

/** One logical terminal event of a reply turn. */
export type ReplyCompletionNotificationEvent = {
  deepLinkUrl: string;
  detail: string;
  /** Captured when the turn reached its terminal phase. */
  occurredInBackground: boolean;
  /** Only completions and failures notify; cancellations are user-initiated. */
  outcome: BackgroundReplyOutcome;
  preview?: string;
  title: string;
};

export type ReplyCompletionNotifier = {
  /** Foreground prompt follow-up after an explicit user action (reply started). */
  requestPermissionOnce(): void;
  /** One logical terminal event owns one notification attempt. */
  notifyTurnFinished(event: ReplyCompletionNotificationEvent): Promise<boolean>;
  /** Retires the delivered notification for a destination. */
  dismissDestination(deepLinkUrl: string): void;
};

export type ReplyCompletionNotificationEnvironment = {
  /** Whether finishing chat replies may raise a system notification. */
  isReplyCompletionNotificationEnabled(): boolean;
};

/**
 * iOS attention delivery for chat replies, fed by the reply runtime's logical
 * turn-terminal events. Delivery is independent of any Live Activity surface:
 * a notice goes out whenever a reply that ran in the background finishes while
 * the app is still hidden, whether or not a Live Activity existed, failed, or
 * was already dismissed. One destination holds at most one delivered notice —
 * a new delivery or a new reply replaces it, and opening the destination
 * retires it (the host wires that to the same visible-task source the
 * background-activity manager uses).
 */
export function createReplyCompletionNotifier(
  environment: ReplyCompletionNotificationEnvironment,
): ReplyCompletionNotifier {
  let notifications: Notifications | undefined;
  let permissionRequested = false;

  // Lazy native-module load matches the other native services so CommonJS test
  // environments keep their mocks and unsupported platforms never load it.
  const loadNotifications = (): Notifications => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
    notifications ??= require('expo-notifications') as Notifications;
    return notifications;
  };

  const requestPermissionOnce = (): void => {
    if (permissionRequested || AppState.currentState !== 'active') return;
    if (!environment.isReplyCompletionNotificationEnabled()) return;
    permissionRequested = true;
    void loadNotifications()
      .requestPermissionsAsync()
      .catch((error: unknown) => {
        // A native request error permits a later attempt.
        permissionRequested = false;
        logger.warn('Notification permission request failed', error as Error);
      });
  };

  const notificationId = (deepLinkUrl: string): string =>
    `cherry-reply-${deepLinkUrl.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const dismissDestination = (deepLinkUrl: string): void => {
    // The identifier is deterministic per destination, so dismissal works
    // without prior in-memory knowledge — including a notice delivered
    // before a process restart.
    void loadNotifications()
      .dismissNotificationAsync(notificationId(deepLinkUrl))
      .catch((error: unknown) => {
        logger.warn('Failed to dismiss reply notification', error as Error, { deepLinkUrl });
      });
  };

  const notifyTurnFinished = async (event: ReplyCompletionNotificationEvent): Promise<boolean> => {
    // User-initiated cancellations stay silent; the preference gates the channel.
    if (event.outcome === 'cancelled') return false;
    if (!environment.isReplyCompletionNotificationEnabled()) return false;
    // A background ending must still be unseen at delivery: a queued notice
    // must not alert once the user is back.
    if (!event.occurredInBackground || AppState.currentState !== 'background') return false;
    if (!isNotificationAllowed(await loadNotifications().getPermissionsAsync())) return false;
    // One destination holds one completion notice.
    dismissDestination(event.deepLinkUrl);
    const identifier = notificationId(event.deepLinkUrl);
    await loadNotifications().scheduleNotificationAsync({
      identifier,
      // A null trigger fires immediately.
      trigger: null,
      content: {
        title: event.title.slice(0, 120),
        body: [event.detail, event.preview].filter(Boolean).join('\n').slice(0, 600),
        sound: 'default',
        data: { owner: BACKGROUND_NOTIFICATION_OWNER, terminal: true, url: event.deepLinkUrl },
      },
    });
    return true;
  };

  return { requestPermissionOnce, notifyTurnFinished, dismissDestination };
}

/** Environment without iOS notification delivery (Android, tests, unsupported). */
export function noopReplyCompletionNotifier(): ReplyCompletionNotifier {
  return {
    requestPermissionOnce: () => {},
    notifyTurnFinished: async () => false,
    dismissDestination: () => {},
  };
}
