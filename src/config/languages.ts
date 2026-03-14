import type { LanguageVarious } from '@/types'

export const languagesOptions: { value: LanguageVarious; label: string; flag: string }[] = [
  { value: 'zh-Hans-CN', label: '中文', flag: '🇨🇳' },
  { value: 'zh-Hans-TW', label: '中文（繁体）', flag: '🇭🇰' },
  { value: 'en-US', label: 'English', flag: '🇺🇸' },
  { value: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { value: 'ru-RU', label: 'Русский', flag: '🇷🇺' }
  // { value: 'ko-KR', label: 'Korean', flag: '🇰🇷' },
  // { value: 'es-ES', label: 'Español', flag: '🇪🇸' },
  // { value: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  // { value: 'fr-FR', label: 'Français', flag: '🇫🇷' },
  // { value: 'id-ID', label: 'Indonesia', flag: '🇮🇩' }
]

export const defaultLanguage = 'en-US'
