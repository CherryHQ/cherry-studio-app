import { DefaultPreferences } from './preferenceSchemas';
import type {
  PermissionPreferenceKey,
  PreferenceDefaultScopeType,
  PreferenceKeyType,
} from './preferenceTypes';

/**
 * Type guard: narrow a string to DB-backed preference keys.
 * Use in generic methods (get/set) where the true branch needs PreferenceKeyType narrowing.
 */
export function isPreferenceKey(key: string): key is PreferenceKeyType {
  return key in DefaultPreferences.default;
}

export function isPermissionPreferenceKey(key: string): key is PermissionPreferenceKey {
  return isPreferenceKey(key) && key.startsWith('permissions.');
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
