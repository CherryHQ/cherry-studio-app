import ALargeSmallIcon from '@cherrystudio/app-icons/icons/a-large-small';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import { Section } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { usePreference } from '@/frontend/data/hooks';

import { SettingsOptionPickerBottomSheet } from './components/SettingsOptionPickerBottomSheet';
import { SettingsScrollPage } from './components/SettingsScrollPage';
import { ThemePreviewSelector } from './components/ThemePreviewSelector';
import { useSettingPreferences } from './hooks/useSettingPreferences';
import { FONT_SIZE_STEP_LABEL_KEYS } from './utils/fontSizeOptions';

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const normalizedFontSizeStep = normalizeFontSizeStep(fontSizeStep);
  const settingPreferences = useSettingPreferences();
  const languageLabel = settingPreferences.language.options.find(
    (option) => option.value === settingPreferences.language.value,
  )?.label;
  return (
    <>
      <SettingsScrollPage
        contentClassName="gap-6"
        headerProps={{ title: t('settings.appearance.title') }}
      >
        <Section title={t('settings.items.theme')}>
          <Section.Item testID="theme-preview-section-item">
            <ThemePreviewSelector
              onThemeChange={settingPreferences.theme.onValueChange}
              selectedTheme={settingPreferences.theme.value}
            />
          </Section.Item>
        </Section>

        <Section>
          <Section.Item
            label={t('settings.items.appLanguage')}
            leading={<GlobeIcon className="size-5 text-foreground" />}
            onPress={() => setIsLanguagePickerOpen(true)}
            trailing={
              <View className="flex-row items-center gap-1">
                <Text className="text-right text-base text-foreground">{languageLabel}</Text>
                <ChevronDownIcon className="size-5 text-foreground" />
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
      </SettingsScrollPage>
      <SettingsOptionPickerBottomSheet
        onClose={() => setIsLanguagePickerOpen(false)}
        onSelect={settingPreferences.language.onValueChange}
        open={isLanguagePickerOpen}
        options={settingPreferences.language.options}
        selectedValue={settingPreferences.language.value}
        size="compact"
        testID="language-picker"
        title={t('settings.items.appLanguage')}
      />
    </>
  );
}
