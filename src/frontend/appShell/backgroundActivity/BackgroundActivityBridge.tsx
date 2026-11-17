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
  const [audioConsent, setAudioConsent] = usePreference('app.background_audio.consent');
  const hasShownGuidance = useRef(false);
  useEffect(() => {
    if (
      (Platform.OS === 'ios' ? audioConsent !== null : hasSeenGuidance) ||
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
            permission.status === 'undetermined' ||
            AppState.currentState !== 'active'
          )
            return;
          hasShownGuidance.current = true;
          const reportConsentFailure = () => {
            toast.show({ label: t('backgroundRun.ios.saveFailed'), variant: 'danger' });
          };
          // A shown prompt suppresses repeated asks but leaves audio unauthorized.
          // Only the confirmation below can persist a true opt-in.
          if (Platform.OS === 'ios')
            void setAudioConsent(false, { optimistic: false }).catch(reportConsentFailure);
          else void setHasSeenGuidance(true).catch(() => {});
          alert.confirm({
            title: t('backgroundRun.title'),
            description: t(
              Platform.OS === 'android'
                ? 'backgroundRun.android.guide'
                : 'backgroundRun.ios.audioGuide',
            ),
            confirmLabel: t(
              Platform.OS === 'ios' ? 'backgroundRun.ios.enable' : 'backgroundRun.settings',
            ),
            onConfirm: () => {
              if (Platform.OS === 'ios')
                return setAudioConsent(true, { optimistic: false }).catch(reportConsentFailure);
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
    audioConsent,
    hasSeenGuidance,
    router,
    setAudioConsent,
    setHasSeenGuidance,
    status,
    t,
    toast,
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
