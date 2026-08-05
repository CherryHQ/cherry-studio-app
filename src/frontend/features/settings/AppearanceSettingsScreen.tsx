import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { ALargeSmallIcon, ChevronRightIcon, GlobeIcon, SunIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { usePreference } from '@/frontend/data/hooks';
import { normalizeFontSizeStep } from '@/frontend/utils/typographyScale';

import { SettingSelect } from './components/SettingSelect';
import { useSettingPreferences } from './hooks/useSettingPreferences';
import { FONT_SIZE_STEP_LABEL_KEYS } from './utils/fontSizeOptions';

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const normalizedFontSizeStep = normalizeFontSizeStep(fontSizeStep);
  const settingPreferences = useSettingPreferences();

  return (
    <>
      <BackHeader title={t('settings.appearance.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          <Section.Item
            label={t('settings.items.theme')}
            leading={<SunIcon className="size-5 text-foreground" strokeWidth={2} />}
            trailing={
              <SettingSelect
                label={t('settings.items.theme')}
                options={settingPreferences.theme.options}
                value={settingPreferences.theme.value}
                onValueChange={settingPreferences.theme.onValueChange}
              />
            }
          />
          <Section.Item
            label={t('settings.items.appLanguage')}
            leading={<GlobeIcon className="size-5 text-foreground" strokeWidth={2} />}
            trailing={
              <SettingSelect
                label={t('settings.items.appLanguage')}
                options={settingPreferences.language.options}
                value={settingPreferences.language.value}
                onValueChange={settingPreferences.language.onValueChange}
              />
            }
          />
          <Section.Item
            label={t('settings.items.fontSize')}
            leading={<ALargeSmallIcon className="size-5 text-foreground" strokeWidth={2} />}
            onPress={() => router.push('/settings/font-size')}
            trailing={
              <View className="flex-row items-center gap-1">
                <Text className="text-right text-base text-default-foreground">
                  {t(FONT_SIZE_STEP_LABEL_KEYS[normalizedFontSizeStep])}
                </Text>
                <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2} />
              </View>
            }
          />
        </Section>
      </ScrollView>
    </>
  );
}
