import { Section, useToast } from '@cherrystudio/ui/components';
import Constants from 'expo-constants';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { openSettings } from 'expo-linking';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useBackgroundExecutionStatus, usePreference } from '@/frontend/data/hooks';
import type { BackgroundRunSettings } from '@/shared/contracts/backgroundExecution';
import { isNotificationBlocked } from '@/shared/notifications/notificationPermission';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const STATUS_KEYS = {
  active: 'backgroundRun.status.active',
  idle: 'backgroundRun.status.idle',
  interrupted: 'backgroundRun.status.interrupted',
  limited: 'backgroundRun.status.limited',
  starting: 'backgroundRun.status.starting',
} as const;

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const execution = useBackendModule('backgroundExecution');
  const status = useBackgroundExecutionStatus();
  const [settings, setSettings] = useState<BackgroundRunSettings | null>(null);
  const [isLiveActivityEnabled, setIsLiveActivityEnabled] = usePreference(
    'chat.background_reply.enabled',
  );
  const [isCompletionNotificationEnabled, setIsCompletionNotificationEnabled] = usePreference(
    'chat.completion_notifications.enabled',
  );
  const [isNotificationPermissionBlocked, setIsNotificationPermissionBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    const refresh = (): void => {
      const current = ++revision;
      void execution
        .getSettings()
        .then((settings) => {
          if (cancelled || current !== revision) return;
          setSettings(settings);
        })
        .catch(() => {
          if (!cancelled && current === revision) setSettings(null);
        });
      void getPermissionsAsync()
        .then((permission) => {
          if (!cancelled && current === revision)
            setIsNotificationPermissionBlocked(isNotificationBlocked(permission));
        })
        .catch(() => {});
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [execution]);

  const reportSettingsFailure = () => {
    toast.show({ label: t('settings.notifications.completion.settingsFailed'), variant: 'danger' });
  };
  const openBackgroundSettings = () => {
    void execution.openSettings().catch(reportSettingsFailure);
  };
  const openSystemSettings = () => {
    void openSettings().catch(reportSettingsFailure);
  };
  const setLiveActivityPreference = (isEnabled: boolean) => {
    void setIsLiveActivityEnabled(isEnabled).catch(() => {
      toast.show({ label: t('settings.notifications.liveActivity.saveFailed'), variant: 'danger' });
    });
  };
  const setCompletionNotificationPreference = (isEnabled: boolean) => {
    void setIsCompletionNotificationEnabled(isEnabled)
      .then(async () => {
        if (!isEnabled) return;
        const permission = await requestPermissionsAsync();
        setIsNotificationPermissionBlocked(isNotificationBlocked(permission));
        if (isNotificationBlocked(permission)) {
          toast.show({
            label: t('settings.notifications.completion.permissionDenied'),
            variant: 'warning',
          });
        }
      })
      .catch(() => {
        toast.show({ label: t('settings.notifications.completion.saveFailed'), variant: 'danger' });
      });
  };
  const openNotificationSettings = () => {
    void startActivityAsync(ActivityAction.APP_NOTIFICATION_SETTINGS, {
      extra: { 'android.provider.extra.APP_PACKAGE': Constants.expoConfig?.android?.package },
    }).catch(reportSettingsFailure);
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.notifications.title') }}
    >
      <Section title={t('backgroundRun.title')} footer={t('backgroundRun.description')}>
        <Section.Item label={t('backgroundRun.status')} description={t(STATUS_KEYS[status])} />
        <Section.Item
          label={t(Platform.OS === 'ios' ? 'backgroundRun.ios.power' : 'backgroundRun.power')}
          description={t(
            settings
              ? settings.lowPowerMode
                ? 'backgroundRun.enabled'
                : 'backgroundRun.disabled'
              : 'backgroundRun.unknown',
          )}
        />
      </Section>
      {Platform.OS === 'android' ? (
        <Section footer={t('backgroundRun.android.guide')}>
          <Section.Item
            label={t('backgroundRun.android.battery')}
            description={t(
              settings?.batteryOptimizationExempt === true
                ? 'backgroundRun.android.unrestricted'
                : settings?.batteryOptimizationExempt === false
                  ? 'backgroundRun.android.restricted'
                  : 'backgroundRun.unknown',
            )}
            onPress={openBackgroundSettings}
          />
          <Section.Item
            label={t('backgroundRun.android.vendor')}
            description={t('backgroundRun.android.vendorHint', {
              manufacturer: settings?.manufacturer ?? 'Android',
            })}
            onPress={openSystemSettings}
          />
        </Section>
      ) : (
        <>
          <Section footer={t('backgroundRun.ios.guide')}>
            <Section.Item
              label={t('backgroundRun.settings')}
              description={t('backgroundRun.ios.limited')}
              onPress={openBackgroundSettings}
            />
          </Section>
          <Section footer={t('settings.notifications.liveActivity.description')}>
            <Section.SwitchItem
              label={t('settings.notifications.liveActivity.title')}
              onValueChange={setLiveActivityPreference}
              value={isLiveActivityEnabled}
            />
            {settings?.liveActivitiesEnabled === false ? (
              <Section.Item
                label={t('settings.notifications.completion.systemSettings')}
                onPress={openSystemSettings}
              />
            ) : null}
          </Section>
        </>
      )}
      <Section
        footer={t(
          isNotificationPermissionBlocked
            ? 'settings.notifications.completion.permissionDenied'
            : 'settings.notifications.completion.description',
        )}
      >
        <Section.SwitchItem
          label={t('settings.notifications.completion.title')}
          onValueChange={setCompletionNotificationPreference}
          value={isCompletionNotificationEnabled}
        />
        {Platform.OS === 'ios' && isNotificationPermissionBlocked ? (
          <Section.Item
            label={t('settings.notifications.completion.systemSettings')}
            onPress={openSystemSettings}
          />
        ) : null}
      </Section>
      {Platform.OS === 'android' ? (
        <Section footer={t('notifications.android.systemDescription')}>
          <Section.Item
            label={t('notifications.android.systemSettings')}
            onPress={openNotificationSettings}
          />
        </Section>
      ) : null}
    </SettingsScrollPage>
  );
}
