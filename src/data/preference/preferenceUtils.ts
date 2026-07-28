import { DefaultPreferences } from './preferenceSchemas';
import type {
  PreferenceAppKeyType,
  PreferenceAppScopeType,
  PreferenceDefaultScopeType,
  PreferenceKeyType,
} from './preferenceTypes';

export function isAppPreferenceKey(key: string): key is PreferenceAppKeyType {
  return key in DefaultPreferences.app;
}

export function getAppDefaultValue<K extends PreferenceAppKeyType>(
  key: K,
): PreferenceAppScopeType[K] {
  return DefaultPreferences.app[key];
}

export function getAppPreferenceKeys(): PreferenceAppKeyType[] {
  return Object.keys(DefaultPreferences.app) as PreferenceAppKeyType[];
}

/**
 * Type guard: narrow a string to DB-backed preference keys.
 * Use in generic methods (get/set) where the true branch needs PreferenceKeyType narrowing.
 */
export function isPreferenceKey(key: string): key is PreferenceKeyType {
  return key in DefaultPreferences.default;
}

/** Default value lookup for mobile DB-backed preferences. */
export function getDefaultValue<K extends PreferenceKeyType>(
  key: K,
): PreferenceDefaultScopeType[K] {
  return DefaultPreferences.default[key];
}

export function getPreferenceKeys(): PreferenceKeyType[] {
  return Object.keys(DefaultPreferences.default) as PreferenceKeyType[];
}
