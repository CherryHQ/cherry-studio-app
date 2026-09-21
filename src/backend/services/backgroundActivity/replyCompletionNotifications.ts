import { AppState } from 'react-native';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { BackgroundActivityDeliveryContext, BackgroundActivityPresenter } from './presenter';

const logger = loggerService.withContext('ReplyCompletionNotifications');

type Notifications = typeof import('expo-notifications');

export type ReplyCompletionNotificationEnvironment = {
  /** Whether finishing chat replies may raise a system notification. */
  isReplyCompletionNotificationEnabled(): boolean;
};

/**
 * iOS attention delivery for chat replies. Android owns its attention path in
 * `AndroidBackgroundActivityRuntime`; this decorator adds the missing iOS half
 * to the Live Activity presenter without touching the widget lifecycle: when a
 * turn reaches a terminal phase that began in the background, it raises one
 * local notification. Foreground completion stays silent — the session list
 * already surfaces it in app — and a cancelled turn never notifies. Each
 * surface start sends at most one terminal notification, so late final title
 * updates cannot repost a notice.
 *
 * The two completion artifacts are coordinated, not stacked: a delivered
 * notice dismisses the Live Activity immediately so the lock screen keeps a
 * single completion item, while an undelivered one (preference off, denied
 * permission, foreground ending) keeps the platform's lingering default card.
 */
export function createReplyCompletionNotifier<Props extends BackgroundReplyActivityProps>(
  presenter: BackgroundActivityPresenter<Props>,
  environment: ReplyCompletionNotificationEnvironment,
): BackgroundActivityPresenter<Props> {
  let notifications: Notifications | undefined;
  let permissionRequested = false;
  let nextId = 0;

  // Lazy native-module load matches the other native services so CommonJS test
  // environments keep their mocks and unsupported platforms never load it.
  const loadNotifications = (): Notifications => {
    notifications ??= require('expo-notifications') as Notifications;
    return notifications;
  };

  // The prompt follows a user-started generation, mirroring Android's
  // in-context request after a task's service admission attempt.
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

  return {
    ...presenter,
    // The terminal notice is a delivery this surface owes, so the keep-alive
    // lease must span it; otherwise ending generation releases the lease and
    // the app can be suspended between the end and the notification
    // submission (mirrors the Android runtime's own declaration).
    shouldHoldLeaseUntilDelivery: true,
    start: (props, deepLinkUrl) => {
      requestPermissionOnce();
      const handle = presenter.start(props, deepLinkUrl);
      // `noticeUsed` reserves the one-shot slot before awaiting delivery so
      // replays stay silent; `delivered` records whether a notice actually
      // went out and may replace the Live Activity card.
      let noticeUsed = false;
      let delivered = false;
      const notice = (
        finalProps: Props,
        context: BackgroundActivityDeliveryContext | undefined,
        policy: 'default' | 'immediate',
      ): Promise<void> => {
        // A surface transitions back to a non-terminal phase only when a new
        // turn inherits it: re-arm the one-shot notice and the delivery record
        // for the new turn's own ending.
        if (finalProps.phase !== 'completed' && finalProps.phase !== 'failed') {
          noticeUsed = false;
          delivered = false;
          return Promise.resolve();
        }
        // Only a terminal phase consumes the one-shot notice: streaming
        // updates ride the same channel and must leave it armed for the real
        // ending, while later title updates never replay a delivered one.
        if (noticeUsed) return Promise.resolve();
        noticeUsed = true;
        return deliver(deepLinkUrl, finalProps, context, policy)
          .then((sent) => {
            delivered = sent;
          })
          .catch((error: unknown) => {
            logger.warn('Reply completion notification failed', error as Error);
          });
      };
      const deliver = async (
        url: string | undefined,
        props: Props,
        context: BackgroundActivityDeliveryContext | undefined,
        policy: 'default' | 'immediate',
      ): Promise<boolean> => {
        const phase = props.phase;
        // User-initiated and manager-shutdown endings stay silent.
        if (policy !== 'default' || (phase !== 'completed' && phase !== 'failed')) return false;
        if (!environment.isReplyCompletionNotificationEnabled()) return false;
        const occurredInBackground =
          context?.phaseStartedInBackground ?? AppState.currentState === 'background';
        // Foreground completion stays silent even if delivery runs after
        // foreground entry, and a queued notice must not alert once the user
        // is back.
        if (!occurredInBackground || AppState.currentState !== 'background') return false;
        if (!(await loadNotifications().getPermissionsAsync()).granted) return false;
        await loadNotifications().scheduleNotificationAsync({
          identifier: `cherry-reply-${Date.now()}-${nextId++}`,
          // A null trigger fires immediately.
          trigger: null,
          content: {
            title: props.title.slice(0, 120),
            body: [props.detail, props.preview].filter(Boolean).join('\n').slice(0, 600),
            sound: 'default',
            data: { owner: BACKGROUND_NOTIFICATION_OWNER, terminal: true, url },
          },
        });
        return true;
      };
      return {
        update: async (nextProps, context) => {
          await handle.update(nextProps, context);
          await notice(nextProps, context, 'default');
        },
        end: async (policy, finalProps, context) => {
          await notice(finalProps, context, policy);
          // A delivered notice replaces the Live Activity as the completion
          // artifact; the lingering default dismissal would show both.
          await handle.end(
            delivered && policy === 'default' ? 'immediate' : policy,
            finalProps,
            context,
          );
        },
      };
    },
  };
}
