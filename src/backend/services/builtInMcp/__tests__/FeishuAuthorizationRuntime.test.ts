import * as SecureStore from 'expo-secure-store';

import { PluginError } from '@/shared/contracts/plugins';

import { FeishuAuthorizationRuntime } from '../FeishuAuthorizationRuntime';
import { FEISHU_USER_SCOPES, feishuOauth } from '../feishuOauth';

let mockNextId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockNextId).padStart(12, '0')}`,
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));
jest.mock('../feishuOauth', () => ({
  ...jest.requireActual('../feishuOauth'),
  feishuOauth: {
    beginRegistration: jest.fn(),
    beginUser: jest.fn(),
    pollRegistration: jest.fn(),
    pollUser: jest.fn(),
    refresh: jest.fn(),
    getAccountLabel: jest.fn(),
  },
}));

const application = { appId: 'cli_cherry', appSecret: 'private-secret' };
const tokens = {
  accessToken: 'private-access',
  refreshToken: 'private-refresh',
  expiresAt: 3600000,
  refreshExpiresAt: 86400000,
  scope: FEISHU_USER_SCOPES.join(' '),
};
const challenge = {
  deviceCode: 'private-device',
  userCode: 'user-code',
  verificationUrl: 'https://open.feishu.cn/page/cli?user_code=user-code',
  expiresAt: 601000,
  nextPollAt: 6000,
  intervalMs: 5000,
};
let stored: string | null;
let committedCredential: string | undefined;
let now: jest.SpyInstance;
const runtimes: FeishuAuthorizationRuntime[] = [];
function createRuntime() {
  const runtime = new FeishuAuthorizationRuntime(async () => committedCredential);
  runtimes.push(runtime);
  return runtime;
}
beforeEach(() => {
  jest.resetAllMocks();
  mockNextId = 0;
  stored = null;
  committedCredential = undefined;
  now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, text) => {
    stored = text;
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => {
    stored = null;
  });
  jest.mocked(feishuOauth.beginRegistration).mockResolvedValue(challenge);
  jest.mocked(feishuOauth.beginUser).mockResolvedValue(challenge);
  jest.mocked(feishuOauth.pollRegistration).mockResolvedValue({ status: 'approved', application });
  jest.mocked(feishuOauth.pollUser).mockResolvedValue({ status: 'approved', tokens });
  jest.mocked(feishuOauth.getAccountLabel).mockResolvedValue('Cherry (ou_cherry)');
});
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
  jest.restoreAllMocks();
});

async function registered(runtime: FeishuAuthorizationRuntime) {
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected registration');
  now.mockReturnValue(6000);
  await runtime.poll(state.attemptId);
}
async function authorized(runtime: FeishuAuthorizationRuntime) {
  await registered(runtime);
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected user authorization');
  await runtime.poll(state.attemptId);
  return state.attemptId;
}

it('recovers registration after route/process interruption without exposing device codes or secrets', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  expect(JSON.stringify(state)).not.toMatch(/private-device|private-secret|private-access/);
  await runtime.stop();
  expect(await createRuntime().getState()).toEqual(state);
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(1);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    keychainAccessible: 'device-only',
  });
});

it('retains the registered app across user authorization failure and cancellation', async () => {
  const runtime = createRuntime();
  await registered(runtime);
  expect(await runtime.getState()).toEqual({ status: 'application-ready' });
  jest.mocked(feishuOauth.beginUser).mockRejectedValueOnce(new PluginError('network', 'safe'));
  await expect(runtime.begin()).rejects.toMatchObject({ reason: 'network' });
  await runtime.cancel();
  const next = await runtime.begin();
  expect(next).toMatchObject({ status: 'waiting', stage: 'user' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(1);
});

it('enforces persisted intervals, slow_down, and an absolute expiry that removes device codes', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected registration');
  await runtime.poll(state.attemptId);
  expect(feishuOauth.pollRegistration).not.toHaveBeenCalled();
  now.mockReturnValue(6000);
  jest.mocked(feishuOauth.pollRegistration).mockResolvedValue({ status: 'slow-down' });
  expect(await runtime.poll(state.attemptId)).toMatchObject({
    nextPollAt: 16000,
    expiresAt: 601000,
  });
  now.mockReturnValue(601000);
  expect(await createRuntime().getState()).toEqual({
    status: 'expired',
    attemptId: state.attemptId,
  });
  expect(stored).not.toContain('private-device');
});

it('does not apply a late registration result after explicit cancellation', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected registration');
  now.mockReturnValue(6000);
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    jest.mocked(feishuOauth.pollRegistration).mockImplementationOnce(async () => {
      resolve();
      await new Promise<void>((settle) => {
        release = settle;
      });
      return { status: 'approved', application };
    });
  });
  const poll = runtime.poll(state.attemptId);
  const rejected = expect(poll).rejects.toThrow();
  await started;
  const cancel = runtime.cancel();
  release();
  await rejected;
  expect(await cancel).toEqual({ status: 'idle' });
  expect(stored).not.toContain('private-secret');
});

it('skips a queued background poll without cancelling its durable authorization attempt', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected registration');
  now.mockReturnValue(6000);
  const observation = new AbortController();
  const poll = runtime.poll(state.attemptId, observation.signal);
  observation.abort();
  expect(await poll).toEqual(state);
  expect(feishuOauth.pollRegistration).not.toHaveBeenCalled();
  expect(await runtime.poll(state.attemptId)).toEqual({ status: 'application-ready' });
});

it('saves an already issued result when only the observing route goes away', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected registration');
  now.mockReturnValue(6000);
  const observation = new AbortController();
  jest.mocked(feishuOauth.pollRegistration).mockImplementationOnce(async () => {
    observation.abort();
    return { status: 'approved', application };
  });
  expect(await runtime.poll(state.attemptId, observation.signal)).toEqual({
    status: 'application-ready',
  });
  expect(stored).toContain('private-secret');
});

it('keeps a one-time token result in backend memory until a failed secure write can be retried', async () => {
  const runtime = createRuntime();
  await registered(runtime);
  const waiting = await runtime.begin();
  if (waiting.status !== 'waiting') throw new Error('Expected user authorization');
  jest.mocked(feishuOauth.pollUser).mockImplementationOnce(async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Keychain unavailable'));
    return { status: 'approved', tokens };
  });
  await expect(runtime.poll(waiting.attemptId)).rejects.toMatchObject({ reason: 'storage' });
  expect(await runtime.getState()).toEqual({ status: 'ready', attemptId: waiting.attemptId });
  expect(feishuOauth.pollUser).toHaveBeenCalledTimes(1);
});

it('does not commit partial scopes, and preserves the app for another user authorization', async () => {
  const runtime = createRuntime();
  jest.mocked(feishuOauth.pollUser).mockResolvedValue({
    status: 'approved',
    tokens: { ...tokens, scope: 'docx:document:readonly' },
  });
  const id = await authorized(runtime);
  await expect(runtime.prepare(id)).rejects.toMatchObject({ reason: 'access' });
  expect(await runtime.cancel()).toEqual({ status: 'application-ready' });
});

it('resolves a securely saved candidate before DB commit and preserves it when DB commit fails', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  expect(prepared.credential).toBe(`feishu-user:${id}`);
  expect(prepared.accountLabel).toBe('Cherry (ou_cherry)');
  const commit = jest.fn(async () => {
    throw new Error('SQLite failed');
  });
  await expect(runtime.commit(id, prepared.signal, commit)).rejects.toThrow('SQLite failed');
  expect(await createRuntime().getUserToken(prepared.credential)).toBe(tokens.accessToken);
  expect(await runtime.getState()).toEqual({ status: 'ready', attemptId: id });
});

it('deduplicates refresh, stores the rotated credential, and never changes the DB reference', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  await runtime.commit(id, prepared.signal, async () => {
    committedCredential = prepared.credential;
    return 'connected';
  });
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockResolvedValue({
    ...tokens,
    accessToken: 'rotated-access',
    refreshToken: 'rotated-refresh',
    expiresAt: 7200000,
  });
  expect(
    await Promise.all([
      runtime.getUserToken(prepared.credential),
      runtime.getUserToken(prepared.credential),
    ]),
  ).toEqual(['rotated-access', 'rotated-access']);
  expect(feishuOauth.refresh).toHaveBeenCalledTimes(1);
  expect(stored).toContain('rotated-refresh');
  expect(await createRuntime().getUserToken(prepared.credential)).toBe('rotated-access');
});

it('reconciles a DB commit interrupted before candidate promotion, so cancel cannot delete the live grant', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  await expect(
    runtime.commit(id, prepared.signal, async () => {
      committedCredential = prepared.credential;
      jest
        .mocked(SecureStore.setItemAsync)
        .mockRejectedValueOnce(new Error('Keychain unavailable'));
      return 'connected';
    }),
  ).resolves.toBe('connected');
  // Simulate process death: discard the in-memory write retry; keep both durable stores.
  await runtime.stop();
  const restarted = createRuntime();
  await restarted.cancel();
  expect(await restarted.getUserToken(prepared.credential)).toBe(tokens.accessToken);
  expect(JSON.parse(stored!).pending).toBeUndefined();
});

it('finishes secure cleanup if the process stopped after DB disconnect', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  await runtime.commit(id, prepared.signal, async () => {
    committedCredential = prepared.credential;
  });
  committedCredential = undefined;
  expect(await createRuntime().getState()).toEqual({ status: 'idle' });
  expect(stored).not.toMatch(/private-secret|private-access|private-refresh/);
});

it('can explicitly replace an unusable application without dropping a working connection', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  await runtime.commit(id, prepared.signal, async () => {
    committedCredential = prepared.credential;
  });
  expect(await runtime.resetApplication()).toEqual({ status: 'idle' });
  expect(await runtime.getUserToken(prepared.credential)).toBe(tokens.accessToken);
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'registration' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(2);
});

it('preserves credentials on transient refresh failure and clears them only on explicit disconnect', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const { credential } = await runtime.prepare(id);
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockRejectedValue(new PluginError('network', 'safe'));
  await expect(runtime.getUserToken(credential)).rejects.toMatchObject({ reason: 'network' });
  expect(stored).toContain('private-refresh');
  runtime.interrupt();
  await runtime.clear();
  await expect(runtime.getUserToken(credential)).rejects.toMatchObject({ reason: 'authorization' });
  expect(stored).toBeNull();
});
