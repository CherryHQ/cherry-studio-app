import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import type {
  PreferenceClient,
  PreferenceKeyType,
  PreferenceMappedValues,
  PreferenceMapping,
  PreferenceSchema,
} from '@/shared/data/preference';
import { getDefaultValue } from '@/shared/data/preference';
import { LATEST_PRIVACY_POLICY_VERSION } from '@/shared/utils/privacyConsent';

import { usePrivacyConsent } from '../usePrivacyConsent';

type PreferenceValue = PreferenceSchema[PreferenceKeyType];
type Consent = ReturnType<typeof usePrivacyConsent>;

async function mountConsent(client: PreferenceClient) {
  let consent: Consent | undefined;

  function Probe() {
    const value = usePrivacyConsent();
    useEffect(() => {
      consent = value;
    }, [value]);
    return null;
  }

  await act(async () => {
    create(
      <PreferenceProvider preference={client}>
        <Probe />
      </PreferenceProvider>,
    );
  });

  return () => consent as Consent;
}

it('asks on a fresh install and stops asking once a choice is recorded', async () => {
  const client = createPreferenceClient();
  const consent = await mountConsent(client);

  expect(consent().isPending).toBe(true);

  await act(async () => {
    await consent().accept();
  });

  expect(consent().isPending).toBe(false);
  expect(client.setMultiple).toHaveBeenCalledWith(
    {
      'app.privacy.data_collection.enabled': true,
      'app.privacy.policy_version': LATEST_PRIVACY_POLICY_VERSION,
    },
    { optimistic: false },
  );
});

it('records the disclosure when declining, so the settings switch can take over', async () => {
  const client = createPreferenceClient();
  const consent = await mountConsent(client);

  await act(async () => {
    await consent().decline();
  });

  // Without the version, nothing would ever write it: the switch in settings
  // would turn collection on without satisfying the consent predicate.
  expect(client.setMultiple).toHaveBeenCalledWith(
    {
      'app.privacy.data_collection.enabled': false,
      'app.privacy.policy_version': LATEST_PRIVACY_POLICY_VERSION,
    },
    { optimistic: false },
  );
  expect(consent().isPending).toBe(false);
});

it('asks again after a policy change, and accepting undoes an earlier decline', async () => {
  const client = createPreferenceClient({
    'app.privacy.data_collection.enabled': false,
    'app.privacy.policy_version': '20200101',
  });
  const consent = await mountConsent(client);

  expect(consent().isPending).toBe(true);

  await act(async () => {
    await consent().accept();
  });

  expect(client.setMultiple).toHaveBeenCalledWith(
    expect.objectContaining({ 'app.privacy.data_collection.enabled': true }),
    { optimistic: false },
  );
});

it('keeps asking when the choice could not be stored', async () => {
  const client = createPreferenceClient();
  jest.mocked(client.setMultiple).mockRejectedValueOnce(new Error('database busy'));
  const consent = await mountConsent(client);

  let saved: boolean | undefined;
  await act(async () => {
    saved = await consent().accept();
  });

  expect(saved).toBe(false);
  expect(consent().isPending).toBe(true);
  expect(consent().isSaving).toBe(false);
});

function createPreferenceClient(initial: Partial<PreferenceSchema> = {}) {
  const values = new Map<PreferenceKeyType, PreferenceValue>(
    Object.entries(initial) as [PreferenceKeyType, PreferenceValue][],
  );
  const listeners = new Map<PreferenceKeyType, Set<() => void>>();

  const getMultipleCached = <T extends PreferenceMapping>(mapping: T) => {
    const result = {} as { [P in keyof T]: PreferenceSchema[T[P]] };
    for (const name of Object.keys(mapping) as (keyof T)[]) {
      const key = mapping[name];
      result[name] = (values.get(key) ??
        getDefaultValue(key)) as PreferenceMappedValues<T>[typeof name];
    }
    return result;
  };

  return {
    getCachedValue: jest.fn(<K extends PreferenceKeyType>(key: K) => values.get(key)),
    getMultipleCached: jest.fn(getMultipleCached),
    set: jest.fn(async () => undefined),
    setMultiple: jest.fn(async (updates: Partial<PreferenceSchema>) => {
      for (const [key, value] of Object.entries(updates) as [
        PreferenceKeyType,
        PreferenceValue,
      ][]) {
        values.set(key, value);
        for (const listener of listeners.get(key) ?? []) listener();
      }
    }),
    subscribeChange: jest.fn((key: PreferenceKeyType) => (listener: () => void) => {
      const keyListeners = listeners.get(key) ?? new Set();
      keyListeners.add(listener);
      listeners.set(key, keyListeners);
      return () => keyListeners.delete(listener);
    }),
  } as unknown as PreferenceClient;
}
