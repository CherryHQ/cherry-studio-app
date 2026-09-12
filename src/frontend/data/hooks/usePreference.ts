import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { usePreferenceClient } from '@/frontend/data/PreferenceProvider';
import type {
  PreferenceSchema,
  PreferenceKeyType,
  PreferenceUpdateOptions,
} from '@/shared/data/preference';
import { getDefaultValue } from '@/shared/data/preference';

type PreferenceSetter<K extends PreferenceKeyType> = (
  value: PreferenceSchema[K],
  options?: PreferenceUpdateOptions,
) => Promise<void>;

type MultiplePreferenceMapping = Record<string, PreferenceKeyType>;
type MultiplePreferenceValues<T extends MultiplePreferenceMapping> = {
  [P in keyof T]: PreferenceSchema[T[P]];
};
type MultiplePreferenceUpdates<T extends MultiplePreferenceMapping> = Partial<
  MultiplePreferenceValues<T>
>;
type MultiplePreferenceSetter<T extends MultiplePreferenceMapping> = (
  values: MultiplePreferenceUpdates<T>,
  options?: PreferenceUpdateOptions,
) => Promise<void>;
type SnapshotState<T extends MultiplePreferenceMapping> = {
  names: (keyof T)[];
  values: MultiplePreferenceValues<T>;
};

export function usePreference<K extends PreferenceKeyType>(
  key: K,
): [PreferenceSchema[K], PreferenceSetter<K>] {
  const preferences = usePreferenceClient();

  const value = useSyncExternalStore(
    useCallback((listener) => preferences.subscribeChange(key)(listener), [key, preferences]),
    () => preferences.getCachedValue(key) ?? getDefaultValue(key),
    () => getDefaultValue(key),
  );

  const setValue = useCallback<PreferenceSetter<K>>(
    (nextValue, options) => preferences.set(key, nextValue, options),
    [key, preferences],
  );

  return [value, setValue];
}

export function useMultiplePreferences<T extends MultiplePreferenceMapping>(
  mapping: T,
): [MultiplePreferenceValues<T>, MultiplePreferenceSetter<T>] {
  const preferences = usePreferenceClient();
  const entries = useMemo(() => Object.entries(mapping) as [keyof T, T[keyof T]][], [mapping]);
  const keys = useMemo(() => entries.map(([, key]) => key), [entries]);
  const snapshotRef = useRef<SnapshotState<T> | null>(null);

  const readSnapshot = useCallback(() => {
    const previousState = snapshotRef.current;
    const nextSnapshot = preferences.getMultipleCached(mapping);
    let changed =
      previousState === null ||
      previousState.names.length !== entries.length ||
      previousState.names.some((name, index) => name !== entries[index]?.[0]);

    for (const [name] of entries) {
      if (!changed && previousState && previousState.values[name] !== nextSnapshot[name]) {
        changed = true;
      }
    }

    if (!changed && previousState) {
      return previousState.values;
    }

    snapshotRef.current = {
      names: entries.map(([name]) => name),
      values: nextSnapshot,
    };
    return nextSnapshot;
  }, [entries, mapping, preferences]);

  const values = useSyncExternalStore(
    useCallback(
      (listener) => {
        const unsubscribers = keys.map((key) => preferences.subscribeChange(key)(listener));

        return () => {
          for (const unsubscribe of unsubscribers) {
            unsubscribe();
          }
        };
      },
      [keys, preferences],
    ),
    readSnapshot,
    () => {
      const result = {} as MultiplePreferenceValues<T>;

      for (const [name, key] of entries) {
        result[name] = getDefaultValue(key);
      }

      return result;
    },
  );

  const setValues = useCallback<MultiplePreferenceSetter<T>>(
    (nextValues, options) => {
      const updates: Partial<PreferenceSchema> = {};

      for (const [name, key] of entries) {
        if (name in nextValues) {
          updates[key] = nextValues[name];
        }
      }

      return preferences.setMultiple(updates, options);
    },
    [entries, preferences],
  );

  return [values, setValues];
}
