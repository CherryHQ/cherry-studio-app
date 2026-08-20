import type { PreferenceKeyType, PreferenceSchema } from './preferenceSchema';
import { PreferenceDefaults } from './preferenceSchema';

/**
 * Type guard: narrow a string to DB-backed preference keys.
 * Use in generic methods (get/set) where the true branch needs PreferenceKeyType narrowing.
 */
export function isPreferenceKey(key: string): key is PreferenceKeyType {
  return key in PreferenceDefaults;
}

/** Default value lookup for mobile DB-backed preferences. */
export function getDefaultValue<K extends PreferenceKeyType>(key: K): PreferenceSchema[K] {
  return PreferenceDefaults[key];
}

export function getPreferenceKeys(): PreferenceKeyType[] {
  return Object.keys(PreferenceDefaults) as PreferenceKeyType[];
}
