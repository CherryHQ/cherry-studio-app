import { resolveScheme } from 'expo-linking';
import {
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  dismissNotificationAsync,
  useLastNotificationResponse,
} from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { parseBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { backgroundActivityHref } from '../backgroundActivityNavigation';
import { isBackgroundTaskVisible } from '../foregroundActivityAttention';

const logger = loggerService.withContext('BackgroundActivityNavigation');

export function useBackgroundActivityNavigation(): void {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const response = useLastNotificationResponse();

  useEffect(() => {
    if (!navigationKey || !response) return;
    const { data } = response.notification.request.content;
    if (
      !data ||
      data.owner !== BACKGROUND_NOTIFICATION_OWNER ||
      response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const scheme = resolveScheme({});
    const href = backgroundActivityHref(data.url, scheme);
    if (href && !isBackgroundTaskVisible(parseBackgroundTaskUrl(data.url, scheme))) {
      router.navigate(href);
    }
    clearLastNotificationResponse();
    void dismissNotificationAsync(response.notification.request.identifier).catch(
      (error: unknown) => {
        logger.warn('Could not dismiss opened notification', { error });
      },
    );
  }, [navigationKey, response, router]);
}
