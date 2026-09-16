/** Supported UI languages and their names in the language itself. */
export const APP_LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'el-GR', label: 'Ελληνικά' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'pt-PT', label: 'Português' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'tr-TR', label: 'Türkçe' },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['value'];
export const DEFAULT_APP_LANGUAGE: AppLanguage = 'en-US';

/** Resolve presentation without rewriting a saved preference. Null follows the device. */
export function resolveAppLanguage(
  preference: string | null | undefined,
  deviceLanguages: readonly string[] = [],
): AppLanguage {
  if (preference != null) return matchAppLanguage(preference) ?? DEFAULT_APP_LANGUAGE;

  for (const language of deviceLanguages) {
    const matched = matchAppLanguage(language);
    if (matched) return matched;
  }

  return DEFAULT_APP_LANGUAGE;
}

function matchAppLanguage(language: string): AppLanguage | undefined {
  const tag = language.trim().replaceAll('_', '-').toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return undefined;

  const parts = tag.split('-');
  if (parts[0] === 'zh') {
    // An explicit script takes precedence over the region (for example zh-Hans-HK).
    if (parts.includes('hans')) return 'zh-CN';
    if (parts.includes('hant') || parts.some((part) => ['tw', 'hk', 'mo'].includes(part))) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  return APP_LANGUAGES.find(({ value }) => value.toLowerCase().split('-')[0] === parts[0])?.value;
}
