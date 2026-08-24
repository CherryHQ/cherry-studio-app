import ALargeSmallIcon from '@cherrystudio/app-icons/icons/a-large-small';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import { Section } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/components/headers';
import { usePreference } from '@/frontend/data/hooks';
import { ThemeMode } from '@/shared/data/preference';

import { ThemePreviewSelector } from './components/ThemePreviewSelector';
import { useSettingPreferences } from './hooks/useSettingPreferences';
import { FONT_SIZE_STEP_LABEL_KEYS } from './utils/fontSizeOptions';

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme: resolvedTheme } = useUniwind();
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const normalizedFontSizeStep = normalizeFontSizeStep(fontSizeStep);
  const settingPreferences = useSettingPreferences();
  const languageLabel = settingPreferences.language.options.find(
    (option) => option.value === settingPreferences.language.value,
  )?.label;
  const isAutomaticTheme = settingPreferences.theme.value === ThemeMode.system;
  const resolvedThemeMode = resolvedTheme === 'dark' ? ThemeMode.dark : ThemeMode.light;
  const selectedTheme = isAutomaticTheme
    ? resolvedThemeMode
    : settingPreferences.theme.value === ThemeMode.dark
      ? ThemeMode.dark
      : ThemeMode.light;
  const handleAutomaticThemeChange = (isAutomatic: boolean) => {
    settingPreferences.theme.onValueChange(isAutomatic ? ThemeMode.system : resolvedThemeMode);
  };

  return (
    <>
      <RouteHeader title={t('settings.appearance.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section title={t('settings.items.theme')}>
          <Section.Item testID="theme-preview-section-item">
            <ThemePreviewSelector
              isAutomatic={isAutomaticTheme}
              onAutomaticChange={handleAutomaticThemeChange}
              onThemeChange={settingPreferences.theme.onValueChange}
              selectedTheme={selectedTheme}
            />
          </Section.Item>
        </Section>

        <Section>
          <Section.Item
            label={t('settings.items.appLanguage')}
            leading={<GlobeIcon className="size-5 text-foreground" />}
            onPress={() => router.push('/settings/language')}
            trailing={
              <View className="flex-row items-center gap-1">
                <Text className="text-right text-base text-foreground">{languageLabel}</Text>
                <ChevronRightIcon className="size-5 text-foreground" />
              </View>
            }
          />
          <Section.Item
            label={t('settings.items.fontSize')}
            leading={<ALargeSmallIcon className="size-5 text-foreground" />}
            onPress={() => router.push('/settings/font-size')}
            trailing={
              <View className="flex-row items-center gap-1">
                <Text className="text-right text-base text-foreground">
                  {t(FONT_SIZE_STEP_LABEL_KEYS[normalizedFontSizeStep])}
                </Text>
                <ChevronRightIcon className="size-5 text-foreground" />
              </View>
            }
          />
        </Section>
      </ScrollView>
    </>
  );
}
