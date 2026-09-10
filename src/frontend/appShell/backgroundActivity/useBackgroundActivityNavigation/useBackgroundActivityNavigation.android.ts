import { resolveScheme } from 'expo-linking';
import {
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  useLastNotificationResponse,
} from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';

import { backgroundActivityHref } from '../backgroundActivityNavigation';

export function useBackgroundActivityNavigation(): void {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const response = useLastNotificationResponse();

  useEffect(() => {
    if (!navigationKey || !response) return;
    const { data } = response.notification.request.content;
    if (
      data.owner !== BACKGROUND_NOTIFICATION_OWNER ||
      response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER
    )
      return;
    clearLastNotificationResponse();
    const href = backgroundActivityHref(data.url, resolveScheme({}));
    if (href) router.push(href);
  }, [navigationKey, response, router]);
}
