import { useRouter } from 'expo-router';
import {
  CloudIcon,
  DatabaseIcon,
  EarthIcon,
  GlobeIcon,
  InfoIcon,
  SparklesIcon,
  SunIcon,
} from 'lucide-uniwind';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { CloseHeader } from '@/components/headers';
import { usePrefetchProviders } from '@/hooks/settings/usePrefetchProviders';
import { SettingSelect } from './components/SettingSelect';
import { SettingsSection } from './components/SettingsSection';
import { useSettingPreferences } from './hooks/useSettingPreferences';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const settingPreferences = useSettingPreferences();
  const prefetchProviders = usePrefetchProviders();

  return (
    <>
      <CloseHeader title={t('settings.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-4 py-5">
          <SettingsSection
            items={[
              {
                icon: CloudIcon,
                title: t('settings.items.modelService'),
                onPress: () => router.push('/settings/provider'),
                onPressIn: prefetchProviders,
              },
              {
                icon: SparklesIcon,
                title: t('settings.items.defaultModel'),
                onPress: () => router.push('/settings/model'),
              },
            ]}
            title={t('settings.model.title')}
          />
          <SettingsSection
            items={[
              {
                icon: EarthIcon,
                title: t('settings.items.webSearch'),
                onPress: () => router.push('/settings/websearch'),
              },
              {
                icon: DatabaseIcon,
                title: t('settings.items.dataBackup'),
                onPress: () => router.push('/settings/data'),
              },
            ]}
            title={t('settings.plugin.title')}
          />
          <SettingsSection
            items={[
              {
                accessory: (
                  <SettingSelect
                    label={t('settings.items.appLanguage')}
                    options={settingPreferences.language.options}
                    value={settingPreferences.language.value}
                    onValueChange={settingPreferences.language.onValueChange}
                  />
                ),
                icon: GlobeIcon,
                title: t('settings.items.appLanguage'),
              },
              {
                accessory: (
                  <SettingSelect
                    label={t('settings.items.appearance')}
                    options={settingPreferences.theme.options}
                    value={settingPreferences.theme.value}
                    onValueChange={settingPreferences.theme.onValueChange}
                  />
                ),
                icon: SunIcon,
                title: t('settings.items.appearance'),
              },
            ]}
            title={t('settings.app.title')}
          />
          <SettingsSection
            items={[
              {
                icon: InfoIcon,
                title: t('settings.items.aboutUs'),
                onPress: () => router.push('/settings/about'),
              },
            ]}
            title={t('settings.about.title')}
          />
        </View>
      </ScrollView>
    </>
  );
}
