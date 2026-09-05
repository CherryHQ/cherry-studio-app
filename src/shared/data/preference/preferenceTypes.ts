/**
 * Value types for the preference keys in `preferenceSchema.ts`. The web-search
 * provider vocabulary some keys are written in lives in
 * `@/shared/data/types/webSearch`, below this module in the layering.
 */

export type PreferenceUpdateOptions = {
  optimistic: boolean;
};

export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  system = 'system',
}

/** 有限的UI语言 */
export type LanguageVarious =
  | 'zh-CN'
  | 'zh-TW'
  | 'de-DE'
  | 'el-GR'
  | 'en-US'
  | 'es-ES'
  | 'fr-FR'
  | 'ja-JP'
  | 'pt-PT'
  | 'ro-RO'
  | 'ru-RU'
  | 'vi-VN';
