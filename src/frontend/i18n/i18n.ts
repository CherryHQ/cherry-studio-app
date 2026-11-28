import 'intl-pluralrules';
import { getLocales } from 'expo-localization';
import { createInstance, type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { LanguageVarious } from '@/shared/data/preference';
import {
  APP_LANGUAGES,
  type AppLanguage,
  DEFAULT_APP_LANGUAGE,
  resolveAppLanguage,
} from '@/shared/utils/languages';

import { loadLocaleCatalog } from './resources';

const i18n = createInstance();
let updatePromise: Promise<void> = Promise.resolve();

function createInitialResources(language: AppLanguage): Resource {
  const resources: Resource = {
    [DEFAULT_APP_LANGUAGE]: { translation: loadLocaleCatalog(DEFAULT_APP_LANGUAGE) },
  };
  if (language !== DEFAULT_APP_LANGUAGE) {
    resources[language] = { translation: loadLocaleCatalog(language) };
  }
  return resources;
}

export function resolveLanguage(preferenceLanguage?: LanguageVarious | null) {
  return resolveAppLanguage(
    preferenceLanguage,
    getLocales().map((locale) => locale.languageTag),
  );
}

export function initI18n(language?: LanguageVarious | null): Promise<void> {
  const nextLanguage = resolveLanguage(language);
  const update = updatePromise.then(async () => {
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: createInitialResources(nextLanguage),
        lng: nextLanguage,
        fallbackLng: DEFAULT_APP_LANGUAGE,
        supportedLngs: APP_LANGUAGES.map(({ value }) => value),
        load: 'currentOnly',
        keySeparator: false,
        interpolation: {
          escapeValue: false,
        },
        saveMissing: __DEV__,
        missingKeyHandler: (_languages, _namespace, key) => {
          console.warn(`[i18n] Missing key: ${key}`);
        },
      });
    } else if (i18n.language !== nextLanguage) {
      if (!i18n.hasResourceBundle(nextLanguage, 'translation')) {
        i18n.addResourceBundle(
          nextLanguage,
          'translation',
          loadLocaleCatalog(nextLanguage),
          true,
          true,
        );
      }
      await i18n.changeLanguage(nextLanguage);
    }
  });
  updatePromise = update.catch(() => {});
  return update;
}

export default i18n;
