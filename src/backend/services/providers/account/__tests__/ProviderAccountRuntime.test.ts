import { ProviderAccountError } from '@/shared/contracts';

import type { ProviderAccountDefinition } from '../providerAccountDefinition';
import { ProviderAccountRuntime } from '../ProviderAccountRuntime';
import { providerAccountStorage, type StoredProviderAccount } from '../providerAccountStorage';

jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({}),
  isHttpError: () => false,
}));
jest.mock('../providerAccountStorage', () => ({
  providerAccountStorage: {
    readAccount: jest.fn(),
    writeAccount: jest.fn(),
  },
}));
const oauth = { challenge: jest.fn(), exchange: jest.fn(), refresh: jest.fn(), revoke: jest.fn() };
const definition = {
  id: 'fixture',
  oauth,
  application: { clientId: 'public-client', redirectUrl: 'cherrystudio://oauth/callback' },
  getApiKeys: jest.fn(),
  getBalance: jest.fn(),
  getProfile: jest.fn(),
} satisfies ProviderAccountDefinition;

const providerId = 'installed-provider';
const state = 'a'.repeat(43);
const callback = `cherrystudio://oauth/callback?state=${state}&code=one-use-code`;
let account: StoredProviderAccount | null;
let runtime: ProviderAccountRuntime;
let store: { get: jest.Mock; replaceKeys: jest.Mock };

beforeEach(() => {
  jest.resetAllMocks();
  account = null;
  jest.mocked(providerAccountStorage.readAccount).mockImplementation(async () => account);
  jest.mocked(providerAccountStorage.writeAccount).mockImplementation(async (_id, value) => {
    account = value;
  });
  jest.mocked(oauth.challenge).mockResolvedValue({
    state,
    verifier: 'verifier',
    authorizationUrl: 'https://auth.provider.test/authorize',
  });
  jest.mocked(oauth.exchange).mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3600000,
  });
  jest.mocked(definition.getApiKeys).mockResolvedValue(['model-key']);
  jest.mocked(oauth.refresh).mockResolvedValue({
    accessToken: 'rotated-access',
    refreshToken: 'rotated-refresh',
    expiresAt: Date.now() + 3600000,
  });
  jest.mocked(definition.getBalance).mockResolvedValue({ amount: 12.5, currency: 'EUR' });
  jest.mocked(definition.getProfile).mockResolvedValue({ displayName: 'Account', email: null });
  store = {
    get: jest.fn(async (id: string) => ({
      id,
      presetProviderId: 'fixture',
      name: 'Fixture',
      createdAt: 100,
    })),
    replaceKeys: jest.fn(async () => true),
  };
  runtime = new ProviderAccountRuntime();
  runtime.configure(store, [definition]);
});
afterEach(async () => {
  await runtime._doStop();
  jest.restoreAllMocks();
});

it('rejects wrong state, another callback and duplicate codes without consuming a legitimate attempt', async () => {
  await runtime.begin(providerId);
  for (const url of [
    callback.replace(state, 'b'.repeat(43)),
    callback.replace('cherrystudio:', 'cherrystudio-dev:'),
    callback.replace('oauth/callback', 'oauth/other'),
    `${callback}&code=second`,
  ]) {
    await expect(runtime.receiveRedirect(url)).rejects.toMatchObject({ reason: 'callback' });
  }
  expect(oauth.exchange).not.toHaveBeenCalled();
  await expect(runtime.receiveRedirect(callback)).resolves.toBe(providerId);
});

it('completes an attempt once when browser and router both deliver it', async () => {
  await runtime.begin(providerId);
  const first = runtime.receiveRedirect(callback);
  expect(runtime.receiveRedirect(callback)).toBe(first);
  await expect(first).resolves.toBe(providerId);
  expect(oauth.exchange).toHaveBeenCalledTimes(1);
  expect(await runtime.getStatus(providerId)).toMatchObject({ signedIn: true });
});

it('does not complete an attempt started before the app restarted', async () => {
  await runtime.begin(providerId);
  const restarted = new ProviderAccountRuntime();
  restarted.configure(store, [definition]);
  await expect(restarted.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'callback' });
  expect(oauth.exchange).not.toHaveBeenCalled();
  await restarted._doStop();
});

it('keeps the previous account when model key retrieval or the database write fails', async () => {
  await runtime.begin(providerId);
  await runtime.receiveRedirect(callback);
  const previous = account;
  await runtime.begin(providerId);
  jest.mocked(definition.getApiKeys).mockRejectedValueOnce(new ProviderAccountError('no-keys'));
  await expect(runtime.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'no-keys' });
  expect(account).toBe(previous);
  await runtime.begin(providerId);
  store.replaceKeys.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(runtime.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'request' });
  expect(account).toBe(previous);
});

it('persists rotated credentials before a balance failure and coalesces concurrent refreshes', async () => {
  await runtime.begin(providerId);
  await runtime.receiveRedirect(callback);
  account!.tokens.expiresAt = Date.now() - 1;
  jest.mocked(definition.getBalance).mockImplementationOnce(async () => {
    expect(account?.tokens.refreshToken).toBe('rotated-refresh');
    throw new ProviderAccountError('network');
  });
  const first = runtime.refresh(providerId);
  expect(runtime.refresh(providerId)).toBe(first);
  await expect(first).rejects.toMatchObject({ reason: 'network' });
  expect(account?.authorized).toBe(true);
  expect(oauth.refresh).toHaveBeenCalledTimes(1);
  await expect(runtime.refresh(providerId)).resolves.toMatchObject({
    signedIn: true,
    balance: { amount: 12.5, currency: 'EUR' },
  });
  expect(oauth.refresh).toHaveBeenCalledTimes(1);
});

it('retries an unauthorized balance once, then requires sign-in without retrying a rejected grant forever', async () => {
  await runtime.begin(providerId);
  await runtime.receiveRedirect(callback);
  jest.mocked(definition.getBalance).mockRejectedValue(new ProviderAccountError('authorization'));
  await expect(runtime.refresh(providerId)).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(definition.getBalance).toHaveBeenCalledTimes(2);
  expect(oauth.refresh).toHaveBeenCalledTimes(1);
  await expect(runtime.refresh(providerId)).resolves.toMatchObject({ signedIn: false });
  expect(definition.getBalance).toHaveBeenCalledTimes(2);
});

it('prevents an in-flight login from restoring an account after logout', async () => {
  await runtime.begin(providerId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest.mocked(oauth.exchange).mockImplementationOnce(async () => {
    entered();
    await gate;
    return { accessToken: 'late-access' };
  });
  const login = runtime.receiveRedirect(callback);
  const rejected = expect(login).rejects.toMatchObject({ reason: 'cancelled' });
  await started;
  const logout = runtime.logout(providerId);
  release();
  await rejected;
  await logout;
  expect(account).toBeNull();
  expect(store.replaceKeys).not.toHaveBeenCalled();
});

it('discards expired or cancelled attempts without exchanging a code', async () => {
  const attempt = await runtime.begin(providerId);
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 10 * 60_000 + 1);
  await expect(runtime.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'callback' });
  clock.mockRestore();
  await expect(runtime.receiveRedirect(`${callback}&iss=retry`)).rejects.toMatchObject({
    reason: 'callback',
  });
  await runtime.begin(providerId);
  await runtime.cancel(attempt.attemptId);
  await expect(runtime.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'callback' });
  expect(oauth.exchange).not.toHaveBeenCalled();
});

it('clears local account keys even when remote revocation is unavailable', async () => {
  await runtime.begin(providerId);
  await runtime.receiveRedirect(callback);
  const ownedKeys = account!.ownedKeys;
  jest.mocked(oauth.revoke).mockRejectedValueOnce(new ProviderAccountError('network'));
  await runtime.logout(providerId);
  expect(account).toBeNull();
  expect(store.replaceKeys).toHaveBeenLastCalledWith(providerId, 100, ownedKeys, []);
  expect(await runtime.getStatus(providerId)).toMatchObject({ signedIn: false });
});

it('derives capabilities from the registered adapter and resolves installed copies by preset identity', () => {
  expect(runtime.getCapabilities({ id: providerId, presetProviderId: 'fixture' })).toEqual({
    signIn: true,
    apiKeys: true,
    balance: true,
  });
  expect(runtime.getCapabilities({ id: 'unregistered' })).toEqual({
    signIn: false,
    apiKeys: false,
    balance: false,
  });
  runtime.configure(store, [{ ...definition, getApiKeys: undefined, getBalance: undefined }]);
  expect(runtime.getCapabilities({ id: 'fixture' })).toEqual({
    signIn: true,
    apiKeys: false,
    balance: false,
  });
});

it('does not dispatch an authorization code to a different adapter after the provider changes', async () => {
  await runtime.begin(providerId);
  runtime.configure(store, [definition, { ...definition, id: 'replacement' }]);
  store.get.mockResolvedValue({
    id: providerId,
    presetProviderId: 'replacement',
    name: 'Replacement',
    createdAt: 100,
  });
  await expect(runtime.receiveRedirect(callback)).rejects.toMatchObject({ reason: 'callback' });
  expect(oauth.exchange).not.toHaveBeenCalled();
  expect(account).toBeNull();
});

it('supports profile-only accounts without model keys or balance and renews their rejected token', async () => {
  runtime.configure(store, [{ ...definition, getApiKeys: undefined, getBalance: undefined }]);
  await runtime.begin(providerId);
  await runtime.receiveRedirect(callback);
  expect(account?.ownedKeys).toEqual([]);
  expect(definition.getApiKeys).not.toHaveBeenCalled();
  definition.getProfile.mockRejectedValueOnce(new ProviderAccountError('authorization'));
  await expect(runtime.refresh(providerId)).resolves.toMatchObject({
    signedIn: true,
    balance: null,
    displayName: 'Account',
  });
  expect(oauth.refresh).toHaveBeenCalledTimes(1);
  expect(definition.getProfile).toHaveBeenLastCalledWith('rotated-access', expect.any(AbortSignal));
  expect(definition.getBalance).not.toHaveBeenCalled();
});
