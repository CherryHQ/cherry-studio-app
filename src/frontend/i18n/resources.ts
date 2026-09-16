import type { AppLanguage } from '@/shared/utils/languages';

import deDE from './locales/de-de.json';
import elGR from './locales/el-gr.json';
import enUS from './locales/en-us.json';
import esES from './locales/es-es.json';
import frFR from './locales/fr-fr.json';
import jaJP from './locales/ja-jp.json';
import ptPT from './locales/pt-pt.json';
import roRO from './locales/ro-ro.json';
import ruRU from './locales/ru-ru.json';
import trTR from './locales/tr-tr.json';
import viVN from './locales/vi-vn.json';
import zhCN from './locales/zh-cn.json';
import zhTW from './locales/zh-tw.json';

// Static imports keep every supported language available offline in Metro.
export const resources = {
  'de-DE': { translation: deDE },
  'el-GR': { translation: elGR },
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'fr-FR': { translation: frFR },
  'ja-JP': { translation: jaJP },
  'pt-PT': { translation: ptPT },
  'ro-RO': { translation: roRO },
  'ru-RU': { translation: ruRU },
  'tr-TR': { translation: trTR },
  'vi-VN': { translation: viVN },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
} satisfies Record<AppLanguage, { translation: Record<string, string> }>;
