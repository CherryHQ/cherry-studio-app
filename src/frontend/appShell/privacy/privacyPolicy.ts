import type { AppLanguage } from '@/shared/utils/languages';

/**
 * Locale segments the policy is actually published under. Every other language
 * reads the English page, which is the site's own fallback.
 */
const PUBLISHED_LOCALES: Partial<Record<AppLanguage, string>> = {
  'fr-FR': 'fr',
  'ja-JP': 'ja',
  'ru-RU': 'ru',
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
};

/**
 * The published privacy policy, in the language the app is being read in.
 *
 * A source constant rather than build configuration: it is one public page
 * shared by every build, and it has to follow the reader's language — something
 * a single build-time value cannot do. The consent sheet carries its own summary
 * anyway, so it stays a complete notice when the device is offline.
 */
export function getPrivacyPolicyUrl(language: string): string {
  return `https://cherryai.com.cn/docs/${PUBLISHED_LOCALES[language as AppLanguage] ?? 'en'}/about/privacypolicy/`;
}
