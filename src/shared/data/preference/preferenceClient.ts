import type { PreferenceKeyType, PreferenceSchema } from './preferenceSchema';
import type { PreferenceUpdateOptions } from './preferenceTypes';

export type PreferenceMapping = Record<string, PreferenceKeyType>;
export type PreferenceMappedValues<T extends PreferenceMapping> = {
  [P in keyof T]: PreferenceSchema[T[P]];
};
export type PreferenceUpdates<K extends PreferenceKeyType = PreferenceKeyType> = Partial<
  Pick<PreferenceSchema, K>
>;

export interface PreferenceClient {
  getCachedValue<K extends PreferenceKeyType>(key: K): PreferenceSchema[K] | undefined;
  getMultipleCached<T extends PreferenceMapping>(mapping: T): PreferenceMappedValues<T>;
  set<K extends PreferenceKeyType>(
    key: K,
    value: PreferenceSchema[K],
    options?: PreferenceUpdateOptions,
  ): Promise<void>;
  setMultiple<K extends PreferenceKeyType>(
    updates: PreferenceUpdates<K>,
    options?: PreferenceUpdateOptions,
  ): Promise<void>;
  subscribeChange<K extends PreferenceKeyType>(key: K): (listener: () => void) => () => void;
}
