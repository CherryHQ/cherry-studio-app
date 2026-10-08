import { useAlert, useToast } from '@cherrystudio/ui/components';
import { resolveScheme } from 'expo-linking';
import { getPermissionsAsync } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import { usePreference, useBackgroundExecutionStatus } from '@/frontend/data/hooks';
import { parseBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';

import {
  isBackgroundTaskVisible,
  subscribeForegroundActivityAttention,
} from './foregroundActivityAttention';
import { useBackgroundActivityNavigation } from './useBackgroundActivityNavigation';

/** Isolates notification subscriptions from the root navigator's render surface. */
export function BackgroundActivityBridge() {
  useBackgroundActivityNavigation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const router = useRouter();
  const status = useBackgroundExecutionStatus();
  const [hasSeenGuidance, setHasSeenGuidance] = usePreference('app.background_run_guidance.seen');
  const [isCompletionNotificationEnabled] = usePreference('chat.completion_notifications.enabled');
  const hasShownGuidance = useRef(false);
  useEffect(() => {
    if (
      hasSeenGuidance ||
      hasShownGuidance.current ||
      (status !== 'active' && status !== 'limited')
    )
      return;
    let cancelled = false;
    const showGuidance = () => {
      if (AppState.currentState !== 'active') return;
      void getPermissionsAsync()
        .then((permission) => {
          // Let the native permission sheet settle before presenting guidance.
          if (
            cancelled ||
            hasShownGuidance.current ||
            (permission.status === 'undetermined' &&
              (Platform.OS === 'android' || isCompletionNotificationEnabled)) ||
            AppState.currentState !== 'active'
          )
            return;
          hasShownGuidance.current = true;
          void setHasSeenGuidance(true).catch(() => {});
          alert.confirm({
            title: t('backgroundRun.title'),
            description: t(
              Platform.OS === 'android' ? 'backgroundRun.android.guide' : 'backgroundRun.ios.guide',
            ),
            confirmLabel: t('backgroundRun.settings'),
            onConfirm: () => {
              router.push('/settings/notifications');
            },
          });
        })
        .catch(() => {});
    };
    showGuidance();
    const changes = AppState.addEventListener('change', (state) => {
      if (state === 'active') showGuidance();
    });
    const focus =
      Platform.OS === 'android' ? AppState.addEventListener('focus', showGuidance) : undefined;
    return () => {
      cancelled = true;
      changes.remove();
      focus?.remove();
    };
  }, [
    alert,
    hasSeenGuidance,
    isCompletionNotificationEnabled,
    router,
    setHasSeenGuidance,
    status,
    t,
  ]);
  useEffect(
    () =>
      subscribeForegroundActivityAttention((attention) => {
        if (
          AppState.currentState !== 'active' ||
          isBackgroundTaskVisible(parseBackgroundTaskUrl(attention.url, resolveScheme({})))
        )
          return;
        toast.show({
          label: `${attention.title}: ${attention.detail}`,
          variant: attention.phase === 'failed' ? 'danger' : 'warning',
        });
      }),
    [toast],
  );
  return null;
}
