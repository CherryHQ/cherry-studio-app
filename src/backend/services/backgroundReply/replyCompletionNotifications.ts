import { AppState } from 'react-native';

import {
  BACKGROUND_REPLY_ACTION,
  type BackgroundActivityActions,
} from '@/shared/backgroundActivity/actions';
import type { ForegroundActivityAttention } from '@/shared/backgroundActivity/attention';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isNotificationAllowed } from '@/shared/notifications/notificationPermission';

import type { BackgroundReplyOutcome } from './backgroundReplyTypes';

const logger = loggerService.withContext('ReplyCompletionNotifications');

type Notifications = typeof import('expo-notifications');

/** One logical terminal event of a reply turn. */
export type ReplyCompletionNotificationEvent = {
  beforeDelivery?: () => Promise<void>;
  isCurrent?: () => boolean;
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
  notifyAttention(event: ReplyAttentionNotificationEvent): Promise<boolean>;
  dismissAttention(deepLinkUrl: string): void;
};

export type ReplyAttentionNotificationEvent = {
  actions?: BackgroundActivityActions;
  /** Controls arriving after their remote input loads update the notice silently. */
  alert?: boolean;
  deepLinkUrl: string;
  detail: string;
  isCurrent(): boolean;
  phase: 'awaiting-approval' | 'awaiting-answer';
  title: string;
};

export type ReplyCompletionNotificationEnvironment = {
  /** Whether finishing chat replies may raise a system notification. */
  isReplyCompletionNotificationEnabled(): boolean;
  onForegroundAttention?: (attention: ForegroundActivityAttention) => void;
};

/**
 * iOS attention delivery for chat replies, fed by logical decision and terminal
 * events. Delivery is independent of any Live Activity surface:
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
    if (notifications) return notifications;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
    notifications = require('expo-notifications') as Notifications;
    // Every notice is for a hidden app. Expo presents foreground arrivals unless a handler
    // declines, so a notice that lands as the user returns stays out of the open app.
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      }),
    });
    return notifications;
  };

  const requestPermissionOnce = (): void => {
    if (permissionRequested || AppState.currentState !== 'active') return;
    // Decisions must reach the user even when optional completion alerts are off.
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

  const attentionId = (deepLinkUrl: string): string =>
    `cherry-attention-${encodeURIComponent(deepLinkUrl)}`;

  const dismissAttention = (deepLinkUrl: string): void => {
    void loadNotifications()
      .dismissNotificationAsync(attentionId(deepLinkUrl))
      .catch((error) => {
        logger.warn('Failed to dismiss attention notification', error as Error);
      });
  };

  const dismissDestination = (deepLinkUrl: string): void => {
    dismissAttention(deepLinkUrl);
    // The identifier is deterministic per destination, so dismissal works
    // without prior in-memory knowledge — including a notice delivered
    // before a process restart.
    void loadNotifications()
      .dismissNotificationAsync(notificationId(deepLinkUrl))
      .catch((error: unknown) => {
        logger.warn('Failed to dismiss reply notification', error as Error, { deepLinkUrl });
      });
  };

  const notifyAttention = async (event: ReplyAttentionNotificationEvent): Promise<boolean> => {
    if (!event.isCurrent()) return false;
    if (isForeground()) {
      environment.onForegroundAttention?.({
        detail: event.detail,
        phase: event.phase,
        title: event.title,
        url: event.deepLinkUrl,
      });
      return false;
    }
    if (!isNotificationAllowed(await loadNotifications().getPermissionsAsync())) return false;
    if (!event.isCurrent() || isForeground()) return false;
    const identifier = attentionId(event.deepLinkUrl);
    if (event.actions) {
      await loadNotifications().setNotificationCategoryAsync(identifier, [
        ...event.actions.buttons.map((button) => ({
          identifier: button.id,
          buttonTitle: button.label,
          options: { opensAppToForeground: false, isAuthenticationRequired: true },
        })),
        ...(event.actions.reply
          ? [
              {
                identifier: BACKGROUND_REPLY_ACTION,
                buttonTitle: event.actions.reply.label,
                textInput: {
                  submitButtonTitle: event.actions.reply.label,
                  placeholder: event.actions.reply.placeholder,
                },
                options: { opensAppToForeground: false, isAuthenticationRequired: true },
              },
            ]
          : []),
      ]);
      if (!event.isCurrent() || isForeground()) return false;
    }
    await loadNotifications().scheduleNotificationAsync({
      identifier,
      trigger: null,
      content: {
        title: event.title.slice(0, 120),
        // Simple question text is necessary to answer from the notification.
        body: event.actions ? [event.detail, event.actions.prompt].join('\n') : event.detail,
        ...(event.actions ? { categoryIdentifier: identifier } : {}),
        ...(event.alert === false ? {} : { sound: 'default' }),
        data: {
          owner: BACKGROUND_NOTIFICATION_OWNER,
          attention: true,
          url: event.deepLinkUrl,
          ...(event.actions ? { actionToken: event.actions.token } : {}),
        },
      },
    });
    // A decision can resolve while native delivery is in flight.
    if (!event.isCurrent() || isForeground()) {
      await loadNotifications().dismissNotificationAsync(identifier);
      return false;
    }
    return true;
  };

  const notifyTurnFinished = async (event: ReplyCompletionNotificationEvent): Promise<boolean> => {
    // User-initiated cancellations stay silent. A failure needs the user, so like a decision it
    // ignores the completion preference and surfaces in the open app too; completions follow the
    // preference and only an ending the user did not see.
    if (event.outcome === 'cancelled') return false;
    const failed = event.outcome === 'failed';
    if (failed && isForeground()) {
      environment.onForegroundAttention?.({
        detail: event.detail,
        phase: 'failed',
        title: event.title,
        url: event.deepLinkUrl,
      });
      return false;
    }
    if (!failed && !environment.isReplyCompletionNotificationEnabled()) return false;
    // A background ending must still be unseen at delivery: a queued notice
    // must not alert once the user is back.
    if ((!failed && !event.occurredInBackground) || AppState.currentState !== 'background')
      return false;
    if (!isNotificationAllowed(await loadNotifications().getPermissionsAsync())) return false;
    if (event.isCurrent?.() === false || AppState.currentState !== 'background') return false;
    // Retire the existing activity before posting its replacement, never stack both.
    await event.beforeDelivery?.();
    if (event.isCurrent?.() === false || AppState.currentState !== 'background') return false;
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

  return {
    requestPermissionOnce,
    notifyTurnFinished,
    dismissDestination,
    notifyAttention,
    dismissAttention,
  };
}

function isForeground(): boolean {
  return AppState.currentState === 'active';
}

/** Environment without iOS notification delivery (Android, tests, unsupported). */
export function noopReplyCompletionNotifier(): ReplyCompletionNotifier {
  return {
    requestPermissionOnce: () => {},
    notifyTurnFinished: async () => false,
    dismissDestination: () => {},
    dismissAttention: () => {},
    notifyAttention: async () => false,
  };
}
