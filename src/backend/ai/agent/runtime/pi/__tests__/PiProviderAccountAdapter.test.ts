import {
  openaiCodexOAuth,
  xaiOAuth,
  type OAuthCredential,
} from '@earendil-works/pi-ai/native-oauth';

import { HttpError } from '@/backend/services/http';
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
  return {
    ...actual,
    configureOAuthPlatform: jest.fn(),
    xaiOAuth: flow,
    openaiCodexOAuth: { ...flow, login: jest.fn(), refresh: jest.fn() },
  };
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

it('does not infer authorization failure from unstructured SDK error text', async () => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  jest
    .mocked(xaiOAuth.refresh)
    .mockRejectedValueOnce(new Error('invalid_grant secret-server-response'));
  await expect(adapter.resolveAuth({ id: 'first', presetProviderId: 'grok' })).rejects.toEqual(
    new ProviderAccountError('request'),
  );
  expect(accounts.get('first')?.credential.refresh).toBe('refresh-fixture');
});

it('clears an expired Codex grant on manual logout and permits a fresh login', async () => {
  adapter.configure({
    get: async (id) => ({ id, presetProviderId: 'openai-codex', name: id, createdAt }),
  });
  jest.mocked(openaiCodexOAuth.login).mockResolvedValueOnce({ ...credential, expires: 0 });
  jest
    .mocked(openaiCodexOAuth.refresh)
    .mockRejectedValueOnce(new Error('invalid_grant secret-server-response'));
  await login('first');
  await expect(adapter.refresh('first')).rejects.toEqual(new ProviderAccountError('request'));

  await adapter.logout('first');
  expect(accounts.has('first')).toBe(false);
  expect((await adapter.getStatus('first')).signedIn).toBe(false);
  const provider = { id: 'first', presetProviderId: 'openai-codex' };
  await expect(adapter.resolveAuth(provider)).resolves.toBeUndefined();

  jest.mocked(openaiCodexOAuth.login).mockImplementationOnce(async () => {
    expect(accounts.has('first')).toBe(false);
    return { ...credential, access: 'new-access', refresh: 'new-refresh' };
  });
  await login('first');
  expect((await adapter.getStatus('first')).signedIn).toBe(true);
  expect((await adapter.resolveAuth(provider))?.auth.apiKey).toBe('new-access');
  expect(openaiCodexOAuth.refresh).toHaveBeenCalledTimes(1);
});

it.each([
  [400, 'invalid_grant', 'authorization', false],
  [401, undefined, 'authorization', false],
  [401, 'invalid_client', 'configuration', true],
  [400, 'unauthorized_client', 'configuration', true],
  [429, undefined, 'network', true],
  [503, undefined, 'network', true],
] as const)(
  'invalidates only a confirmed rejected grant: %s %s',
  async (status, code, reason, retained) => {
    await login('first');
    await login('second');
    accounts.get('first')!.credential.expires = 0;
    jest.mocked(xaiOAuth.refresh).mockRejectedValueOnce(
      new Error('SDK wrapper', {
        cause: new HttpError('secret-server-response', { kind: 'http', status, code }),
      }),
    );
    await expect(adapter.refresh('first')).rejects.toEqual(new ProviderAccountError(reason));
    expect(accounts.has('first')).toBe(retained);
    expect((await adapter.getStatus('first')).signedIn).toBe(retained);
    expect((await adapter.getStatus('second')).signedIn).toBe(true);
    if (!retained) {
      await expect(adapter.refresh('first')).resolves.toMatchObject({ signedIn: false });
      expect(xaiOAuth.refresh).toHaveBeenCalledTimes(1);
      await login('first');
      expect((await adapter.getStatus('first')).signedIn).toBe(true);
    }
  },
);

it('retains the previous grant when a replacement login is rejected', async () => {
  await login('first');
  jest.mocked(xaiOAuth.login).mockRejectedValueOnce(
    new HttpError('Authorization code rejected.', {
      kind: 'http',
      status: 400,
      code: 'invalid_grant',
    }),
  );
  await expect(login('first')).rejects.toEqual(new ProviderAccountError('request'));
  expect(accounts.get('first')?.credential.access).toBe('access-fixture');
});

it('does not report an expired session when a fresh login is rejected without any stored grant', async () => {
  jest
    .mocked(xaiOAuth.login)
    .mockRejectedValueOnce(new HttpError('Authorization rejected.', { kind: 'http', status: 401 }));
  await expect(login('first')).rejects.toEqual(new ProviderAccountError('request'));
  expect((await adapter.getStatus('first')).signedIn).toBe(false);
});

it('serializes invalidation before a concurrent replacement login saves its new grant', async () => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  const started = deferred<void>();
  const finish = deferred<void>();
  jest.mocked(xaiOAuth.refresh).mockImplementationOnce(async () => {
    started.resolve();
    await finish.promise;
    throw new HttpError('Refresh rejected.', { kind: 'http', status: 400, code: 'invalid_grant' });
  });
  const request = adapter
    .resolveAuth({ id: 'first', presetProviderId: 'grok' })
    .catch((error: unknown) => error);
  await started.promise;
  jest.mocked(xaiOAuth.login).mockResolvedValueOnce({ ...credential, access: 'new-access' });
  const replacement = login('first');
  finish.resolve();
  await replacement;
  expect(await request).toEqual(new ProviderAccountError('cancelled'));
  expect(accounts.get('first')?.credential.access).toBe('new-access');
  expect((await adapter.getStatus('first')).signedIn).toBe(true);
});

it.each([
  ['network', 'network'],
  ['timeout', 'network'],
  ['invalid_response', 'request'],
  ['internal', 'configuration'],
] as const)('maps an app HTTP %s failure without exposing credentials', async (kind, reason) => {
  await login('first');
  accounts.get('first')!.credential.expires = 0;
  jest.mocked(xaiOAuth.refresh).mockRejectedValueOnce(
    new HttpError('private-response access-fixture', {
      kind,
      code: 'fixture',
    }),
  );
  await expect(adapter.resolveAuth({ id: 'first', presetProviderId: 'grok' })).rejects.toEqual(
    new ProviderAccountError(reason),
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
