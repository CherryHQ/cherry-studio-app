import RadioIcon from '@cherrystudio/app-icons/icons/radio';
import { Section, Switch, useAlert } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

import { SettingsScrollPage } from './components/SettingsScrollPage';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [isLiveActivityEnabled, setIsLiveActivityEnabled] = usePreference(
    'chat.background_reply.enabled',
  );

  const setLiveActivityPreference = (isEnabled: boolean) => {
    void setIsLiveActivityEnabled(isEnabled).catch(() => {
      alert.show({ title: t('settings.notifications.liveActivity.saveFailed') });
    });
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.notifications.title') }}
    >
      <Section footer={t('settings.notifications.liveActivity.description')}>
        <Section.Item
          accessibilityRole="switch"
          accessibilityState={{ checked: isLiveActivityEnabled }}
          label={t('settings.notifications.liveActivity.title')}
          leading={<RadioIcon className="size-5 text-foreground" />}
          onPress={() => setLiveActivityPreference(!isLiveActivityEnabled)}
          trailing={
            <Switch
              accessibilityLabel={t('settings.notifications.liveActivity.title')}
              onValueChange={setLiveActivityPreference}
              value={isLiveActivityEnabled}
            />
          }
        />
      </Section>
    </SettingsScrollPage>
  );
}
