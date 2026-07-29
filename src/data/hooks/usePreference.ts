import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type {
  PreferenceDefaultScopeType,
  PreferenceKeyType,
  PreferenceUpdateOptions,
} from '@/data/preference';
import { getDefaultValue } from '@/data/preference';
import { useDataServices } from '@/data/runtime';

type PreferenceSetter<K extends PreferenceKeyType> = (
  value: PreferenceDefaultScopeType[K],
  options?: PreferenceUpdateOptions,
) => Promise<void>;

type MultiplePreferenceMapping = Record<string, PreferenceKeyType>;
type MultiplePreferenceValues<T extends MultiplePreferenceMapping> = {
  [P in keyof T]: PreferenceDefaultScopeType[T[P]];
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
): [PreferenceDefaultScopeType[K], PreferenceSetter<K>] {
  const service = useDataServices().preference;

  const value = useSyncExternalStore(
    service.subscribeChange(key),
    () => service.getCachedValue(key) ?? getDefaultValue(key),
    () => getDefaultValue(key),
  );

  const setValue = useCallback<PreferenceSetter<K>>(
    (nextValue, options) => service.set(key, nextValue, options),
    [key, service],
  );

  return [value, setValue];
}

export function useMultiplePreferences<T extends MultiplePreferenceMapping>(
  mapping: T,
): [MultiplePreferenceValues<T>, MultiplePreferenceSetter<T>] {
  const service = useDataServices().preference;
  const entries = useMemo(() => Object.entries(mapping) as [keyof T, T[keyof T]][], [mapping]);
  const keys = useMemo(() => entries.map(([, key]) => key), [entries]);
  const snapshotRef = useRef<SnapshotState<T> | null>(null);

  const readSnapshot = useCallback(() => {
    const previousState = snapshotRef.current;
    const nextSnapshot = service.getMultipleCached(mapping);
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
  }, [entries, mapping, service]);

  const values = useSyncExternalStore(
    useCallback(
      (listener) => {
        const unsubscribers = keys.map((key) => service.subscribeChange(key)(listener));

        return () => {
          for (const unsubscribe of unsubscribers) {
            unsubscribe();
          }
        };
      },
      [keys, service],
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
      const updates: Partial<PreferenceDefaultScopeType> = {};

      for (const [name, key] of entries) {
        if (name in nextValues) {
          updates[key] = nextValues[name];
        }
      }

      return service.setMultiple(updates, options);
    },
    [entries, service],
  );

  return [values, setValues];
}
