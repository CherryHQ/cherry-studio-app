import type {
  PreferenceDefaultScopeType,
  PreferenceKeyType,
  PreferenceUpdateOptions,
} from '@/shared/domain/preferences';

export type PreferenceMapping = Record<string, PreferenceKeyType>;
export type PreferenceMappedValues<T extends PreferenceMapping> = {
  [P in keyof T]: PreferenceDefaultScopeType[T[P]];
};
export type PreferenceUpdates<K extends PreferenceKeyType = PreferenceKeyType> = Partial<
  Pick<PreferenceDefaultScopeType, K>
>;

export interface PreferencesBackend {
  readCached<K extends PreferenceKeyType>(key: K): PreferenceDefaultScopeType[K];
  readManyCached<T extends PreferenceMapping>(mapping: T): PreferenceMappedValues<T>;
  set<K extends PreferenceKeyType>(
    key: K,
    value: PreferenceDefaultScopeType[K],
    options?: PreferenceUpdateOptions,
  ): Promise<void>;
  setMany<K extends PreferenceKeyType>(
    updates: PreferenceUpdates<K>,
    options?: PreferenceUpdateOptions,
  ): Promise<void>;
  subscribe<K extends PreferenceKeyType>(key: K, listener: () => void): () => void;
}
