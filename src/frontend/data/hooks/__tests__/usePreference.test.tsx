import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import type {
  PreferenceClient,
  PreferenceSchema,
  PreferenceKeyType,
  PreferenceMappedValues,
  PreferenceMapping,
} from '@/shared/data/preference';
import { getDefaultValue, ThemeMode } from '@/shared/data/preference';

import { useMultiplePreferences, usePreference } from '../usePreference';

type PreferenceValue = PreferenceSchema[PreferenceKeyType];

describe('preference hooks', () => {
  test('reads, subscribes, and writes one preference through PreferenceClient', async () => {
    const client = createPreferenceClient();
    let observed: ReturnType<typeof usePreference<'ui.theme_mode'>> | undefined;

    function Probe() {
      const preference = usePreference('ui.theme_mode');
      useEffect(() => {
        observed = preference;
      }, [preference]);
      return null;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PreferenceProvider preference={client}>
          <Probe />
        </PreferenceProvider>,
      );
    });

    expect(observed?.[0]).toBe(getDefaultValue('ui.theme_mode'));

    await act(async () => {
      await observed?.[1](ThemeMode.dark, { optimistic: false });
    });

    expect(observed?.[0]).toBe('dark');
    expect(client.set).toHaveBeenCalledWith('ui.theme_mode', 'dark', { optimistic: false });

    await act(async () => {
      renderer.unmount();
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('maps batch reads and writes through desktop-compatible preference methods', async () => {
    const client = createPreferenceClient({
      'app.language': 'en-US',
      'ui.theme_mode': ThemeMode.dark,
    });
    const mapping = {
      language: 'app.language',
      theme: 'ui.theme_mode',
    } as const;
    let observed: ReturnType<typeof useMultiplePreferences<typeof mapping>> | undefined;

    function Probe() {
      const preferences = useMultiplePreferences(mapping);
      useEffect(() => {
        observed = preferences;
      }, [preferences]);
      return null;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <PreferenceProvider preference={client}>
          <Probe />
        </PreferenceProvider>,
      );
    });

    expect(observed?.[0]).toEqual({ language: 'en-US', theme: 'dark' });

    await act(async () => {
      await observed?.[1]({ language: 'zh-CN' });
    });

    expect(client.setMultiple).toHaveBeenCalledWith({ 'app.language': 'zh-CN' }, undefined);

    await act(async () => {
      renderer.unmount();
    });
    expect(client.unsubscribe).toHaveBeenCalledTimes(2);
  });
});

function createPreferenceClient(initial: Partial<PreferenceSchema> = {}) {
  const values = new Map<PreferenceKeyType, PreferenceValue>(
    Object.entries(initial) as [PreferenceKeyType, PreferenceValue][],
  );
  const listeners = new Map<PreferenceKeyType, Set<() => void>>();
  const unsubscribe = jest.fn();

  const getCachedValue = <K extends PreferenceKeyType>(key: K) =>
    values.get(key) as PreferenceSchema[K] | undefined;
  const getMultipleCached = <T extends PreferenceMapping>(mapping: T) => {
    const result = {} as { [P in keyof T]: PreferenceSchema[T[P]] };
    for (const name of Object.keys(mapping) as (keyof T)[]) {
      const key = mapping[name];
      result[name] = (values.get(key) ??
        getDefaultValue(key)) as PreferenceMappedValues<T>[typeof name];
    }
    return result;
  };
  const set = jest.fn(async <K extends PreferenceKeyType>(key: K, value: PreferenceSchema[K]) => {
    values.set(key, value);
    for (const listener of listeners.get(key) ?? []) {
      listener();
    }
  }) as PreferenceClient['set'];
  const setMultiple = jest.fn(async (updates: Partial<PreferenceSchema>) => {
    for (const [key, value] of Object.entries(updates) as [PreferenceKeyType, PreferenceValue][]) {
      values.set(key, value);
      for (const listener of listeners.get(key) ?? []) {
        listener();
      }
    }
  }) as PreferenceClient['setMultiple'];
  const subscribeChange = jest.fn((key: PreferenceKeyType) => (listener: () => void) => {
    const keyListeners = listeners.get(key) ?? new Set();
    keyListeners.add(listener);
    listeners.set(key, keyListeners);
    return () => {
      keyListeners.delete(listener);
      unsubscribe();
    };
  }) as PreferenceClient['subscribeChange'];
  const client: PreferenceClient & { unsubscribe: jest.Mock } = {
    getCachedValue: jest.fn(getCachedValue) as PreferenceClient['getCachedValue'],
    getMultipleCached: jest.fn(getMultipleCached) as PreferenceClient['getMultipleCached'],
    set,
    setMultiple,
    subscribeChange,
    unsubscribe,
  };

  return client;
}
