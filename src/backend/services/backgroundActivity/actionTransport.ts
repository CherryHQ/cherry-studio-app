import { Platform } from 'react-native';

import {
  parseBackgroundActivityAction,
  type BackgroundActivityActionResponse,
} from '@/shared/backgroundActivity/actions';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getSystemIntegration } from '../../../../modules/system-integration';

const logger = loggerService.withContext('BackgroundActivityActions');

/** System events enter the live reply owner without requiring a visible chat screen. */
export function subscribeBackgroundActivityActions(
  listener: (response: BackgroundActivityActionResponse) => void,
): () => void {
  if (Platform.OS === 'android') {
    const native = getSystemIntegration();
    if (!native?.drainBackgroundTaskActions) return () => {};
    let disposed = false;
    let tail = Promise.resolve();
    const drain = () => {
      tail = tail
        .then(async () => {
          if (disposed) return;
          const responses = await native.drainBackgroundTaskActions!();
          if (!disposed)
            for (const value of responses) {
              const response = parseBackgroundActivityAction(value);
              if (response) listener(response);
            }
        })
        .catch((error: unknown) => logger.warn('Could not read system decisions', { error }));
    };
    const subscription = native.addListener('onBackgroundTaskActionPending', drain);
    drain();
    return () => {
      disposed = true;
      subscription.remove();
    };
  }
  if (Platform.OS !== 'ios') return () => {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- iOS-only native modules
  const notifications = require('expo-notifications') as typeof import('expo-notifications');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- iOS-only native modules
  const widgets = require('expo-widgets') as typeof import('expo-widgets');
  const receive = (event: import('expo-notifications').NotificationResponse) => {
    const data = event.notification.request.content.data;
    if (
      !data ||
      data.owner !== BACKGROUND_NOTIFICATION_OWNER ||
      event.actionIdentifier === notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const response = parseBackgroundActivityAction({
      token: data.actionToken,
      actionId: event.actionIdentifier,
      text: event.userText,
    });
    if (response) listener(response);
    notifications.clearLastNotificationResponse();
  };
  const notice = notifications.addNotificationResponseReceivedListener(receive);
  const widget = widgets.addUserInteractionListener((event) => {
    // Live Activity events use the instance's activityID as source, not its
    // factory name. The live reply owner validates the exact decision token.
    try {
      const response = parseBackgroundActivityAction(JSON.parse(event.target));
      if (response) listener(response);
    } catch {
      /* Other widget targets are not decision envelopes. */
    }
  });
  const pending = notifications.getLastNotificationResponse();
  if (pending) receive(pending);
  return () => {
    notice.remove();
    widget.remove();
  };
}
