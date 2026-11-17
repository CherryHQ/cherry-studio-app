import { useToast } from '@cherrystudio/ui/components';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, Text, View } from 'react-native';

import { useBackendModule, usePreference } from '@/frontend/data';
import type { BackgroundRunSettings } from '@/shared/contracts/backgroundExecution';
import {
  isNotificationBlocked,
  type NotificationPermissionStatusLike,
} from '@/shared/notifications/notificationPermission';

import { OnboardingButton, OnboardingChoice, OnboardingPage } from '../components/OnboardingPage';
import type { OnboardingProgress } from './useOnboardingProgress';

export function NotificationsOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const execution = useBackendModule('backgroundExecution');
  const permissions = useBackendModule('permissions');
  const [notifications, setNotifications] = usePreference('chat.completion_notifications.enabled');
  const [liveActivity, setLiveActivity] = usePreference('chat.background_reply.enabled');
  const [settings, setSettings] = useState<BackgroundRunSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionStatusLike | null>(null);
  const [isActing, setIsActing] = useState(false);
  const acting = useRef(false);
  const busy = progress.isSaving || isActing;

  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void execution
        .getSettings()
        .then((value) => {
          if (active && generation === current) setSettings(value);
        })
        .catch(() => {});
      void getPermissionsAsync()
        .then((value) => {
          if (active && generation === current) setPermission(value);
        })
        .catch(() => {});
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [execution]);

  const act = async (work: () => Promise<unknown>) => {
    if (acting.current || progress.isSaving) return;
    acting.current = true;
    setIsActing(true);
    try {
      await work();
    } catch {
      toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      acting.current = false;
      setIsActing(false);
    }
  };
  const next = () =>
    act(async () => {
      if (notifications) {
        const current = await getPermissionsAsync();
        const next = current.status === 'undetermined' ? await requestPermissionsAsync() : current;
        setPermission(next);
      }
      await progress.advance('login');
    });
  const blocked = permission && isNotificationBlocked(permission);

  return (
    <OnboardingPage
      description={t('onboarding.notifications.description')}
      footer={
        <OnboardingButton
          loading={busy}
          onPress={() => void next()}
          testID="onboarding-notifications-continue"
        >
          {t('onboarding.continue')}
        </OnboardingButton>
      }
      onBack={busy ? undefined : () => void progress.advance('permissions')}
      step={{ current: 3, total: 4, label: t('onboarding.preparation.step', { current: 3 }) }}
      testID="onboarding-notifications"
      title={t('onboarding.notifications.title')}
    >
      <View>
        <OnboardingChoice
          checked={notifications}
          description={t('settings.notifications.completion.description')}
          disabled={busy}
          onPress={() => void act(() => setNotifications(!notifications, { optimistic: false }))}
          title={t('settings.notifications.completion.title')}
          testID="onboarding-notifications-enabled"
        />
        {Platform.OS === 'ios' ? (
          <OnboardingChoice
            checked={liveActivity}
            description={t('settings.notifications.liveActivity.description')}
            disabled={busy}
            onPress={() => void act(() => setLiveActivity(!liveActivity, { optimistic: false }))}
            title={t('settings.notifications.liveActivity.title')}
            testID="onboarding-live-activity"
          />
        ) : null}
      </View>
      {blocked ? (
        <View className="items-start gap-2">
          <Text className="text-sm text-muted-foreground">
            {t('settings.notifications.completion.permissionDenied')}
          </Text>
          <OnboardingButton
            disabled={busy}
            onPress={() => void act(() => permissions.openSystemSettings())}
            variant="text"
          >
            {t('settings.notifications.completion.systemSettings')}
          </OnboardingButton>
        </View>
      ) : null}
      <View className="gap-4">
        <Text className="font-medium text-base text-foreground">{t('backgroundRun.title')}</Text>
        <Text className="text-sm text-muted-foreground">
          {t(Platform.OS === 'ios' ? 'backgroundRun.ios.guide' : 'backgroundRun.android.guide')}
        </Text>
        {settings?.lowPowerMode ? (
          <Text className="text-sm text-muted-foreground">
            {t('backgroundRun.ios.power')}: {t('backgroundRun.enabled')}
          </Text>
        ) : null}
        <OnboardingButton
          disabled={busy}
          onPress={() => void act(() => execution.openSettings())}
          variant="secondary"
        >
          {t('backgroundRun.settings')}
        </OnboardingButton>
      </View>
    </OnboardingPage>
  );
}
