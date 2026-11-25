import { resolveScheme } from 'expo-linking';
import {
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  dismissNotificationAsync,
  useLastNotificationResponse,
} from 'expo-notifications';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

import { parseBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { backgroundActivityHref } from '../backgroundActivityNavigation';
import { isBackgroundTaskVisible } from '../foregroundActivityAttention';

const logger = loggerService.withContext('BackgroundActivityNavigation');

/**
 * Opens a tapped background-task notification on every platform that raises
 * them: the Android attention runtime and the iOS reply completion notifier.
 */
export function useBackgroundActivityNavigation(): void {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const response = useLastNotificationResponse();
  const pathname = usePathname();
  const openDestination = useEffectEvent(
    (href: NonNullable<ReturnType<typeof backgroundActivityHref>>) => {
      // Reuse the content scene under Settings instead of opening a second one.
      if (pathname === '/settings' || pathname.startsWith('/settings/')) router.dismissTo(href);
      else router.navigate(href);
    },
  );

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
      openDestination(href);
    }
    clearLastNotificationResponse();
    if (data.terminal !== true && data.attention !== true) return;
    void dismissNotificationAsync(response.notification.request.identifier).catch(
      (error: unknown) => {
        logger.warn('Could not dismiss opened notification', { error });
      },
    );
  }, [navigationKey, response]);
}
