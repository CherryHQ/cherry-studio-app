import { Section, Switch } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { usePreference } from '@/frontend/data/hooks';

export default function BuiltInToolsSettingsScreen() {
  const { t } = useTranslation();
  const [providerConfigurationEnabled, setProviderConfigurationEnabled] = usePreference(
    'chat.tools.provider_configuration.enabled',
  );

  return (
    <>
      <BackHeader title={t('settings.builtInTools.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <Section>
            <Section.Item
              label={t('settings.builtInTools.providerConfiguration')}
              showChevron={false}
              trailing={
                <Switch
                  accessibilityLabel={t('settings.builtInTools.providerConfiguration')}
                  onValueChange={(enabled) => void setProviderConfigurationEnabled(enabled)}
                  value={providerConfigurationEnabled}
                />
              }
            />
          </Section>
        </View>
      </ScrollView>
    </>
  );
}
