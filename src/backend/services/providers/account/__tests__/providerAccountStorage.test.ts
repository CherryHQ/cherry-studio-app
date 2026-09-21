import * as SecureStore from 'expo-secure-store';

import { providerAccountStorage, type StoredProviderAccount } from '../providerAccountStorage';

jest.mock('@/backend/services/http', () => ({ createHttpClient: () => ({}) }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (algorithm: string, value: string) =>
    jest.requireActual('node:crypto').createHash(algorithm).update(value).digest('hex'),
}));
const values = new Map<string, string>();
const account: StoredProviderAccount = {
  definitionId: 'fixture',
  application: { clientId: 'public-client', redirectUrl: 'cherrystudio-dev://oauth/callback' },
  tokens: { accessToken: 'account-access', refreshToken: 'account-refresh' },
  providerCreatedAt: 100,
  ownedKeys: [{ id: 'key', key: 'model-key', isEnabled: true }],
  authorized: true,
  balance: { amount: 1.25, currency: 'EUR' },
  displayName: null,
  email: null,
  updatedAt: 200,
};
beforeEach(() => {
  values.clear();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => values.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    values.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
});

it('round-trips account grants per provider and persists PKCE attempts for cold-start completion', async () => {
  await providerAccountStorage.writeAccount('provider', account);
  await providerAccountStorage.writeAccount('provider-copy', {
    ...account,
    balance: { amount: 2.5, currency: 'USD' },
  });
  const pending = {
    definitionId: account.definitionId,
    application: account.application,
    providerId: 'provider',
    providerCreatedAt: 100,
    state: 'state',
    verifier: 'verifier',
    expiresAt: 600000,
  };
  await providerAccountStorage.writePending(pending);
  expect(await providerAccountStorage.readPending()).toEqual(pending);
  expect(await providerAccountStorage.readAccount('provider')).toEqual(account);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    keychainAccessible: 'device-only',
  });
  await providerAccountStorage.writeAccount('provider', null);
  expect(await providerAccountStorage.readAccount('provider')).toBeNull();
  expect(await providerAccountStorage.readAccount('provider-copy')).toMatchObject({
    balance: { amount: 2.5, currency: 'USD' },
  });
});

it('reports corrupt stored credentials without exposing their contents', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue('{"tokens":{"accessToken":"private-stored-token"}}');
  const error = await providerAccountStorage
    .readAccount('provider')
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ reason: 'storage' });
  expect(String(error)).not.toContain('private-stored-token');
});
