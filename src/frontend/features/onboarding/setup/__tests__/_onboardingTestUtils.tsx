import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import type {
  PreferenceClient,
  PreferenceKeyType,
  PreferenceMappedValues,
  PreferenceMapping,
  PreferenceSchema,
} from '@/shared/data/preference';
import { getDefaultValue } from '@/shared/data/preference';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createPreferenceClient(initial: Partial<PreferenceSchema> = {}) {
  const values: Partial<PreferenceSchema> = { ...initial };
  const listeners = new Map<PreferenceKeyType, Set<() => void>>();
  const getCachedValue: PreferenceClient['getCachedValue'] = (key) => values[key];
  const setMultiple = jest.fn<
    ReturnType<PreferenceClient['setMultiple']>,
    Parameters<PreferenceClient['setMultiple']>
  >(async (updates) => {
    Object.assign(values, updates);
    for (const key of Object.keys(updates) as PreferenceKeyType[]) {
      for (const listener of listeners.get(key) ?? []) listener();
    }
  });
  const client = {
    getCachedValue,
    getMultipleCached: <T extends PreferenceMapping>(mapping: T) =>
      Object.fromEntries(
        Object.entries(mapping).map(([name, key]) => [name, values[key] ?? getDefaultValue(key)]),
      ) as PreferenceMappedValues<T>,
    set: jest.fn<ReturnType<PreferenceClient['set']>, Parameters<PreferenceClient['set']>>(
      async (key, value) => setMultiple({ [key]: value }),
    ),
    setMultiple,
    subscribeChange: (key: PreferenceKeyType) => (listener: () => void) => {
      const group = listeners.get(key) ?? new Set<() => void>();
      listeners.set(key, group);
      group.add(listener);
      return () => {
        group.delete(listener);
      };
    },
  } satisfies PreferenceClient;
  return client;
}

export async function mountHook<T>(useHook: () => T, client = createPreferenceClient()) {
  let current!: T;
  function Probe() {
    const value = useHook();
    useEffect(() => {
      current = value;
    });
    return null;
  }
  const tree = () => (
    <PreferenceProvider preference={client}>
      <Probe />
    </PreferenceProvider>
  );
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(tree());
  });
  return {
    get current() {
      return current;
    },
    client,
    rerender: async () => {
      await act(async () => renderer.update(tree()));
    },
    unmount: async () => {
      await act(async () => renderer.unmount());
    },
  };
}
