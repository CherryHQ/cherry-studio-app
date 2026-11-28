import type { AppLanguage } from '@/shared/utils/languages';

export type TranslationCatalog = Record<string, string>;

// Lazy require keeps every supported language bundled offline in Metro while
// avoiding parsing unused locale JSON catalogs during startup.
const localeLoaders: Record<AppLanguage, () => TranslationCatalog> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'de-DE': () => require('./locales/de-de.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'el-GR': () => require('./locales/el-gr.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'en-US': () => require('./locales/en-us.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'es-ES': () => require('./locales/es-es.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'fr-FR': () => require('./locales/fr-fr.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'ja-JP': () => require('./locales/ja-jp.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'pt-PT': () => require('./locales/pt-pt.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'ro-RO': () => require('./locales/ro-ro.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'ru-RU': () => require('./locales/ru-ru.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'tr-TR': () => require('./locales/tr-tr.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'vi-VN': () => require('./locales/vi-vn.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'zh-CN': () => require('./locales/zh-cn.json') as TranslationCatalog,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy offline bundle loading
  'zh-TW': () => require('./locales/zh-tw.json') as TranslationCatalog,
};

export function loadLocaleCatalog(language: AppLanguage): TranslationCatalog {
  return localeLoaders[language]();
}
