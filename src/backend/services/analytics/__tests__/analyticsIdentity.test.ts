import type { PreferenceClient } from '@/shared/data/preference';

import { isAnalyticsClientId, resolveClientId } from '../analyticsIdentity';

const GENERATED_UUID = '11111111-2222-4333-8444-555555555555';

jest.mock('expo-crypto', () => ({ randomUUID: () => GENERATED_UUID }));

function createPreference(stored: string) {
  const set = jest.fn(async () => undefined);
  const preference = {
    getCachedValue: jest.fn(() => stored),
    set,
  } as unknown as PreferenceClient;
  return { preference, set };
}

it('reuses a stored identity without writing to storage', async () => {
  const existing = '99999999-8888-4777-8666-555555555555';
  const { preference, set } = createPreference(existing);

  await expect(resolveClientId(preference)).resolves.toBe(existing);
  expect(set).not.toHaveBeenCalled();
});

it('generates and persists an identity on first use', async () => {
  const { preference, set } = createPreference('');

  await expect(resolveClientId(preference)).resolves.toBe(GENERATED_UUID);
  expect(set).toHaveBeenCalledWith('app.user.id', GENERATED_UUID);
});

it('replaces a stored value that is not a UUID', async () => {
  const { preference, set } = createPreference('not-a-uuid');

  await expect(resolveClientId(preference)).resolves.toBe(GENERATED_UUID);
  expect(set).toHaveBeenCalledWith('app.user.id', GENERATED_UUID);
});

it('rejects identities the analytics service cannot use', () => {
  expect(isAnalyticsClientId('99999999-8888-4777-8666-555555555555')).toBe(true);
  expect(isAnalyticsClientId('')).toBe(false);
  expect(isAnalyticsClientId('cherry-studio')).toBe(false);
});
