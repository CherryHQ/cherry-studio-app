import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { applyThemeModePreference } from '@/data/bootstrap/appRuntime';
import { useMultiplePreferences } from '@/data/hooks';
import { type LanguageVarious, ThemeMode } from '@/data/preference';
import { initI18n, resolveLanguage } from '@/i18n';
import type { SettingSelectOption } from '../components/SettingSelect';

const preferenceMapping = {
  language: 'app.language',
  themeMode: 'ui.theme_mode',
} as const;

export function useSettingPreferences() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useMultiplePreferences(preferenceMapping);
  const languageValue = resolveLanguage(preferences.language);

  const themeOptions = useMemo<SettingSelectOption<ThemeMode>[]>(
    () => [
      { label: t('settings.options.theme.system'), value: ThemeMode.system },
      { label: t('settings.options.theme.dark'), value: ThemeMode.dark },
      { label: t('settings.options.theme.light'), value: ThemeMode.light },
    ],
    [t],
  );

  const languageOptions = useMemo<SettingSelectOption<LanguageVarious>[]>(
    () => [
      { label: t('settings.options.language.zhCN'), value: 'zh-CN' },
      { label: t('settings.options.language.enUS'), value: 'en-US' },
    ],
    [t],
  );

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
      options: themeOptions,
      value: preferences.themeMode,
      onValueChange: handleThemeModeChange,
    },
  };
}
