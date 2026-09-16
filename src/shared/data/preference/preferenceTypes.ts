/**
 * Value types for the preference keys in `preferenceSchema.ts`. The web-search
 * provider vocabulary some keys are written in lives in
 * `@/shared/data/types/webSearch`, below this module in the layering.
 */

import type { AppLanguage } from '@/shared/utils/languages';

export type PreferenceUpdateOptions = {
  optimistic: boolean;
};

export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  system = 'system',
}

export type LanguageVarious = AppLanguage;
