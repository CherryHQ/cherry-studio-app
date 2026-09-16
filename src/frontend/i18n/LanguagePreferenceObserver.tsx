import { useLocales } from 'expo-localization';
import { useEffect } from 'react';

import { usePreference } from '@/frontend/data/hooks';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { resolveAppLanguage } from '@/shared/utils/languages';

import { initI18n } from './i18n';

const logger = loggerService.withContext('I18n');

/** Keep committed preferences and device-language changes in sync after bootstrap. */
export function LanguagePreferenceObserver() {
  const [preference] = usePreference('app.language');
  const locales = useLocales();
  const language = resolveAppLanguage(
    preference,
    locales.map((locale) => locale.languageTag),
  );

  useEffect(() => {
    void initI18n(language).catch((error: unknown) => {
      logger.error('Failed to apply app language', error instanceof Error ? error : { error });
    });
  }, [language]);

  return null;
}
