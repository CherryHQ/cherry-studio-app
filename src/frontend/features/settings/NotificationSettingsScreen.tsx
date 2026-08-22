import { RadioIcon } from '@cherrystudio/app-icons';
import { Section, Switch, useAlert } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';
import { usePreference } from '@/frontend/data/hooks';

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
    <>
      <RouteHeader title={t('settings.notifications.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
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
      </ScrollView>
    </>
  );
}
