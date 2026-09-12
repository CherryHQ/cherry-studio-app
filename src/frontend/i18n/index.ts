import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { defaultLanguage } from '@/frontend/utils/constants';
import type { LanguageVarious } from '@/shared/data/preference';

import enUS from './locales/en-us.json';
import zhCN from './locales/zh-cn.json';

const resources = Object.fromEntries(
  [
    ['en-US', enUS],
    ['zh-CN', zhCN],
  ].map(([locale, translation]) => [locale, { translation }]),
);

const i18n = createInstance();
let initializationPromise: Promise<unknown> | null = null;

export function resolveLanguage(preferenceLanguage?: LanguageVarious | null) {
  if (preferenceLanguage) {
    return preferenceLanguage;
  }

  if (getLocales()[0]?.languageCode === 'zh') {
    return 'zh-CN';
  }

  return defaultLanguage;
}

export async function initI18n(language?: LanguageVarious | null) {
  const nextLanguage = resolveLanguage(language);

  if (!i18n.isInitialized) {
    initializationPromise ??= i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: nextLanguage,
        fallbackLng: defaultLanguage,
        keySeparator: false,
        interpolation: {
          escapeValue: false,
        },
        saveMissing: __DEV__,
        missingKeyHandler: (_languages, _namespace, key) => {
          console.warn(`[i18n] Missing key: ${key}`);
        },
      })
      .catch((error: unknown) => {
        initializationPromise = null;
        throw error;
      });

    await initializationPromise;
  }

  if (i18n.language !== nextLanguage) {
    await i18n.changeLanguage(nextLanguage);
  }
}

export default i18n;
