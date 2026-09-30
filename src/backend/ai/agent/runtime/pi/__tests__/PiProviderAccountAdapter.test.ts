import { xaiOAuth, type OAuthCredential } from '@earendil-works/pi-ai/native-oauth';

import { HttpError } from '@/backend/services/http';
import {
  providerAccountStorage,
  type StoredPiAccount,
} from '@/backend/services/providers/account/providerAccountStorage';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

import { resolvePiCopilotAuto, type PiCopilotAutoModel } from '../piCopilotAuto';
import { PiProviderAccountAdapter } from '../PiProviderAccountAdapter';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../piCopilotAuto', () => ({
  ...jest.requireActual('../piCopilotAuto'),
  resolvePiCopilotAuto: jest.fn(),
}));
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
  return { ...actual, configureOAuthPlatform: jest.fn(), xaiOAuth: flow, githubCopilotOAuth: flow };
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

it('cancels Auto resolution on logout and discards its late session token', async () => {
  adapter.configure({
    get: async (id) => ({ id, presetProviderId: 'copilot', name: id, createdAt }),
  });
  await login('first');
  const started = deferred<void>();
  const finish = deferred<PiCopilotAutoModel>();
  jest
    .mocked(resolvePiCopilotAuto)
    .mockImplementationOnce(async (_auth, _input, _fetch, signal) => {
      started.resolve();
      const result = await finish.promise;
      expect(signal.aborted).toBe(true);
      return result;
    });
  const request = adapter
    .resolveCopilotAuto({ id: 'first', presetProviderId: 'copilot' }, 'session-1', {
      input: [{ type: 'text', text: 'Hello' }],
      history: [],
    })
    .catch((error: unknown) => error);
  await started.promise;
  const logout = adapter.logout('first');
  finish.resolve({} as PiCopilotAutoModel);
  expect(await request).toEqual(new ProviderAccountError('cancelled'));
  await logout;
  expect(accounts.has('first')).toBe(false);
});

it('reuses Auto within a conversation and clears it when the account changes', async () => {
  adapter.configure({
    get: async (id) => ({ id, presetProviderId: 'copilot', name: id, createdAt }),
  });
  await login('first');
  const autoModel: PiCopilotAutoModel = {
    expiresAt: Date.now() + 3600000,
    supportsTools: true,
    model: {
      id: 'served-model',
      name: 'Served model',
      api: 'openai-completions',
      provider: 'github-copilot',
      baseUrl: 'https://api.individual.githubcopilot.com',
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 8192,
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      headers: { 'Copilot-Session-Token': 'auto-token' },
    },
  };
  jest.mocked(resolvePiCopilotAuto).mockResolvedValue(autoModel);
  const provider = { id: 'first', presetProviderId: 'copilot' };
  const request = { input: [{ type: 'text' as const, text: 'Hello' }], history: [] };
  await adapter.resolveCopilotAuto(provider, 'session-1', request);
  await adapter.resolveCopilotAuto(provider, 'session-1', request);
  expect(resolvePiCopilotAuto).toHaveBeenCalledTimes(1);
  await adapter.resolveCopilotAuto(provider, 'session-2', request);
  expect(resolvePiCopilotAuto).toHaveBeenCalledTimes(2);
  autoModel.expiresAt = 0;
  jest.mocked(resolvePiCopilotAuto).mockResolvedValueOnce({
    ...autoModel,
    expiresAt: Date.now() + 3600000,
  });
  await adapter.resolveCopilotAuto(provider, 'session-1', request);
  expect(resolvePiCopilotAuto).toHaveBeenCalledTimes(3);
  autoModel.expiresAt = Date.now() + 3600000;
  await login('first');
  await adapter.resolveCopilotAuto(provider, 'session-1', request);
  expect(resolvePiCopilotAuto).toHaveBeenCalledTimes(4);
});
