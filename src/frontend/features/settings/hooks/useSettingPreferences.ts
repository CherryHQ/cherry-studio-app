import { type LanguageVarious, ThemeMode } from '@cherrystudio/universal/data/preference';
import { useCallback } from 'react';

import { useMultiplePreferences } from '@/frontend/data/hooks';
import { initI18n, resolveLanguage } from '@/frontend/i18n';
import { applyThemeModePreference } from '@/frontend/utils/theme';

import type { SettingOption } from '../settingOptions';

const preferenceMapping = {
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export const languageOptions: SettingOption<LanguageVarious>[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];

export function useSettingPreferences() {
  const [preferences, setPreferences] = useMultiplePreferences(preferenceMapping);
  const languageValue = resolveLanguage(preferences.language);

  const handleThemeModeChange = useCallback(
    (nextThemeMode: ThemeMode) => {
      void setPreferences({ themeMode: nextThemeMode }).then(() => {
        applyThemeModePreference(nextThemeMode);
      });
    },
    [setPreferences],
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: LanguageVarious) => {
      void setPreferences({ language: nextLanguage }).then(() => initI18n(nextLanguage));
    },
    [setPreferences],
  );

  return {
    language: {
      options: languageOptions,
      value: languageValue,
      onValueChange: handleLanguageChange,
    },
    theme: {
      value: preferences.themeMode,
      onValueChange: handleThemeModeChange,
    },
  };
}
