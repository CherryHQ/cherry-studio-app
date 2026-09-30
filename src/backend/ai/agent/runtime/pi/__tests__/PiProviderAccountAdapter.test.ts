import { xaiOAuth, type OAuthCredential } from '@earendil-works/pi-ai/native-oauth';

import {
  providerAccountStorage,
  type StoredPiAccount,
} from '@/backend/services/providers/account/providerAccountStorage';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

import { PiProviderAccountAdapter } from '../PiProviderAccountAdapter';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/backend/services/providers/account/providerAccountStorage', () => ({
  providerAccountStorage: { readPiAccount: jest.fn(), writePiAccount: jest.fn() },
}));
jest.mock('@earendil-works/pi-ai/native-oauth', () => {
  const actual = jest.requireActual('@earendil-works/pi-ai/native-oauth');
  const flow = {
    name: 'Fixture',
    login: jest.fn(),
    refresh: jest.fn(),
    toAuth: async (credential: OAuthCredential) => ({ apiKey: credential.access }),
  };
  return { ...actual, configureOAuthPlatform: jest.fn(), xaiOAuth: flow };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const credential: OAuthCredential = {
  type: 'oauth',
  access: 'access-fixture',
  refresh: 'refresh-fixture',
  expires: Date.now() + 3_600_000,
};
let accounts: Map<string, StoredPiAccount>;
let adapter: PiProviderAccountAdapter;
let createdAt: number;

beforeEach(() => {
  jest.clearAllMocks();
  accounts = new Map();
  createdAt = 100;
  jest
    .mocked(providerAccountStorage.readPiAccount)
    .mockImplementation(async (id) => accounts.get(id) ?? null);
  jest.mocked(providerAccountStorage.writePiAccount).mockImplementation(async (id, account) => {
    if (account) accounts.set(id, account);
    else accounts.delete(id);
  });
  jest.mocked(xaiOAuth.login).mockImplementation(async () => ({ ...credential }));
  jest
    .mocked(xaiOAuth.refresh)
    .mockResolvedValue({ ...credential, access: 'rotated-access', refresh: 'rotated-refresh' });
  adapter = new PiProviderAccountAdapter();
  adapter.configure({ get: async (id) => ({ id, presetProviderId: 'grok', name: id, createdAt }) });
});

async function login(id: string, signal = new AbortController().signal) {
  await adapter.signIn(id, { signal, notify: jest.fn(), prompt: jest.fn() });
}

it('keeps two instances of the same provider independently signed in', async () => {
  await login('first');
  await login('second');
  await adapter.logout('first');
  expect((await adapter.getStatus('first')).signedIn).toBe(false);
  expect((await adapter.getStatus('second')).signedIn).toBe(true);
  expect((await adapter.resolveAuth({ id: 'second', presetProviderId: 'grok' }))?.auth.apiKey).toBe(
    'access-fixture',
  );
});

it('uses Pi double-checked locking to refresh a rotated token once across concurrent requests', async () => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  const started = deferred<void>();
  const finish = deferred<void>();
  jest.mocked(xaiOAuth.refresh).mockImplementationOnce(async () => {
    started.resolve();
    await finish.promise;
    return { ...credential, access: 'rotated-access', refresh: 'rotated-refresh' };
  });
  const requests = [
    adapter.resolveAuth({ id: 'first', presetProviderId: 'grok' }),
    adapter.resolveAuth({ id: 'first', presetProviderId: 'grok' }),
  ];
  await started.promise;
  finish.resolve();
  expect((await Promise.all(requests)).map((value) => value?.auth.apiKey)).toEqual([
    'rotated-access',
    'rotated-access',
  ]);
  expect(xaiOAuth.refresh).toHaveBeenCalledTimes(1);
  expect(accounts.get('first')?.credential.refresh).toBe('rotated-refresh');
});

it('preserves stored credentials and hides upstream secrets when refresh fails', async () => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  jest
    .mocked(xaiOAuth.refresh)
    .mockRejectedValueOnce(new Error('invalid_grant secret-server-response'));
  await expect(adapter.resolveAuth({ id: 'first', presetProviderId: 'grok' })).rejects.toEqual(
    new ProviderAccountError('authorization'),
  );
  expect(accounts.get('first')?.credential.refresh).toBe('refresh-fixture');
});

it('does not save a late login result after the user cancels', async () => {
  const finish = deferred<OAuthCredential>();
  const started = deferred<void>();
  jest.mocked(xaiOAuth.login).mockImplementationOnce(() => {
    started.resolve();
    return finish.promise;
  });
  const controller = new AbortController();
  const attempt = login('first', controller.signal);
  await started.promise;
  controller.abort();
  finish.resolve(credential);
  await expect(attempt).rejects.toEqual(new ProviderAccountError('cancelled'));
  expect(accounts.has('first')).toBe(false);
});

it('serializes logout behind refresh and prevents its late result from restoring credentials', async () => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  const started = deferred<void>();
  const finish = deferred<void>();
  jest.mocked(xaiOAuth.refresh).mockImplementationOnce(async () => {
    started.resolve();
    await finish.promise;
    return { ...credential, access: 'late-rotated-access' };
  });
  const request = adapter
    .resolveAuth({ id: 'first', presetProviderId: 'grok' })
    .catch((error: unknown) => error);
  await started.promise;
  const logout = adapter.logout('first');
  finish.resolve();
  expect(await request).toEqual(new ProviderAccountError('cancelled'));
  await logout;
  expect(accounts.has('first')).toBe(false);
});

it('discards credentials after a provider row is recreated with the same id', async () => {
  await login('first');
  createdAt = 101;
  expect((await adapter.getStatus('first')).signedIn).toBe(false);
  expect(accounts.has('first')).toBe(false);
});
