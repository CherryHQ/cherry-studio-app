import RadioIcon from '@cherrystudio/app-icons/icons/radio';
import { Section, useToast } from '@cherrystudio/ui/components';
import Constants from 'expo-constants';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
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

  const setLiveActivityPreference = (isEnabled: boolean) => {
    void setIsLiveActivityEnabled(isEnabled).catch(() => {
      toast.show({ label: t('settings.notifications.liveActivity.saveFailed'), variant: 'danger' });
    });
  };

  const openNotificationSettings = () => {
    void startActivityAsync(ActivityAction.APP_NOTIFICATION_SETTINGS, {
      extra: { 'android.provider.extra.APP_PACKAGE': Constants.expoConfig?.android?.package },
    }).catch(() => {
      toast.show({ label: t('notifications.android.settingsFailed'), variant: 'danger' });
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
