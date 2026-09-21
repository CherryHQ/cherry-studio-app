import RadioIcon from '@cherrystudio/app-icons/icons/radio';
import { Section, useToast } from '@cherrystudio/ui/components';
import Constants from 'expo-constants';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { openSettings } from 'expo-linking';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { usePreference } from '@/frontend/data/hooks';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLiveActivityEnabled, setIsLiveActivityEnabled] = usePreference(
    'chat.background_reply.enabled',
  );
  const [isCompletionNotificationEnabled, setIsCompletionNotificationEnabled] = usePreference(
    'chat.completion_notifications.enabled',
  );
  const [isNotificationPermissionDenied, setIsNotificationPermissionDenied] = useState(false);

  useEffect(() => {
    // Only meaningful while the switch is on; rendering gates the recovery row
    // on the same condition, so a stale denial needs no synchronous reset.
    if (!isCompletionNotificationEnabled) return;
    let cancelled = false;
    void getPermissionsAsync()
      .then(({ granted }) => {
        if (!cancelled) setIsNotificationPermissionDenied(!granted);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCompletionNotificationEnabled]);

  const setLiveActivityPreference = (isEnabled: boolean) => {
    void setIsLiveActivityEnabled(isEnabled).catch(() => {
      toast.show({ label: t('settings.notifications.liveActivity.saveFailed'), variant: 'danger' });
    });
  };

  const setCompletionNotificationPreference = (isEnabled: boolean) => {
    void setIsCompletionNotificationEnabled(isEnabled)
      .then(async () => {
        if (!isEnabled) return;
        // The system sheet follows the user's explicit opt-in; Android only
        // reports the current state once it has already been decided.
        const { granted } = await requestPermissionsAsync();
        setIsNotificationPermissionDenied(!granted);
        if (!granted) {
          toast.show({
            label: t('settings.notifications.completion.permissionDenied'),
            variant: 'warning',
          });
        }
      })
      .catch(() => {
        toast.show({
          label: t('settings.notifications.completion.saveFailed'),
          variant: 'danger',
        });
      });
  };

  const openNotificationSettings = () => {
    void startActivityAsync(ActivityAction.APP_NOTIFICATION_SETTINGS, {
      extra: { 'android.provider.extra.APP_PACKAGE': Constants.expoConfig?.android?.package },
    }).catch(() => {
      toast.show({ label: t('notifications.android.settingsFailed'), variant: 'danger' });
    });
  };

  const openSystemSettings = () => {
    void openSettings().catch(() => {
      toast.show({
        label: t('settings.notifications.completion.settingsFailed'),
        variant: 'danger',
      });
    });
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.notifications.title') }}
    >
      <Section
        footer={t(
          Platform.OS === 'android'
            ? 'notifications.android.description'
            : 'settings.notifications.liveActivity.description',
        )}
      >
        <Section.SwitchItem
          label={t(
            Platform.OS === 'android'
              ? 'notifications.android.title'
              : 'settings.notifications.liveActivity.title',
          )}
          leading={<RadioIcon className="size-5 text-foreground" />}
          onValueChange={setLiveActivityPreference}
          value={isLiveActivityEnabled}
        />
      </Section>
      <Section footer={t('settings.notifications.completion.description')}>
        <Section.SwitchItem
          label={t('settings.notifications.completion.title')}
          leading={<RadioIcon className="size-5 text-foreground" />}
          onValueChange={setCompletionNotificationPreference}
          value={isCompletionNotificationEnabled}
        />
      </Section>
      {Platform.OS === 'android' ? (
        <Section footer={t('notifications.android.systemDescription')}>
          <Section.Item
            label={t('notifications.android.systemSettings')}
            onPress={openNotificationSettings}
          />
        </Section>
      ) : null}
      {Platform.OS === 'ios' &&
      isCompletionNotificationEnabled &&
      isNotificationPermissionDenied ? (
        <Section footer={t('settings.notifications.completion.permissionDenied')}>
          <Section.Item
            label={t('settings.notifications.completion.systemSettings')}
            onPress={openSystemSettings}
          />
        </Section>
      ) : null}
    </SettingsScrollPage>
  );
}
