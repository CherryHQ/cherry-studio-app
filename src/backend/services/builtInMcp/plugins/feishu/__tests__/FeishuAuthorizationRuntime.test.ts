import { PluginError } from '@/shared/contracts/plugins';

import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { FeishuAuthorizationRuntime } from '../FeishuAuthorizationRuntime';
import { feishuOauth } from '../feishuOauth';
import { FEISHU_REQUESTED_TOOL_SCOPES } from '../feishuTools';

let mockNextId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockNextId).padStart(12, '0')}`,
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
  scope: FEISHU_REQUESTED_TOOL_SCOPES.join(' '),
};
const challenge = {
  deviceCode: 'private-device',
  userCode: 'user-code',
  verificationUrl: 'https://open.feishu.cn/page/cli?user_code=user-code',
  expiresAt: 601000,
  nextPollAt: 6000,
  intervalMs: 5000,
};
const applicationReady = { status: 'application-ready', applicationId: 'cli_cherry' };
let fixture: ReturnType<typeof authorizationStoreFixture>;
const stored = () => JSON.stringify(fixture.data);
let now: jest.SpyInstance;
const runtimes: FeishuAuthorizationRuntime[] = [];
function createRuntime() {
  const runtime = new FeishuAuthorizationRuntime(fixture.store);
  runtimes.push(runtime);
  return runtime;
}
beforeEach(() => {
  jest.resetAllMocks();
  mockNextId = 0;
  fixture = authorizationStoreFixture();
  now = jest.spyOn(Date, 'now').mockReturnValue(1000);
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

it('keeps attempt secrets in memory and starts over after a process interruption', async () => {
  const runtime = createRuntime();
  const state = await runtime.begin();
  expect(JSON.stringify(state)).not.toMatch(/private-device|private-secret|private-access/);
  expect(stored()).not.toContain('private-device');
  await runtime.stop();
  const restarted = createRuntime();
  expect(await restarted.getState()).toEqual({ status: 'idle' });
  expect(await restarted.begin()).not.toEqual(state);
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(2);
});

it('saves the complete grant and retains only the application after completion', async () => {
  const runtime = createRuntime();
  await connected(runtime);
  expect(fixture.data.grant?.credential).toEqual({ version: 1, application, tokens });
  expect(fixture.data.application).toEqual(application);
  expect(await runtime.getState()).toEqual(applicationReady);
});

it('authorizes with an existing application instead of registering, and reuses it after cancellation', async () => {
  const runtime = createRuntime();
  expect(await runtime.useApplication(application)).toEqual(applicationReady);
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'user' });
  expect(feishuOauth.beginRegistration).not.toHaveBeenCalled();
  expect(feishuOauth.beginUser).toHaveBeenCalledWith(application, expect.any(AbortSignal));
  expect(await runtime.cancel()).toEqual(applicationReady);
  await expect(
    runtime.useApplication({ appId: 'not-an-app-id', appSecret: 'x' }),
  ).rejects.toThrow();
});

it('retains the registered app across user authorization failure and cancellation', async () => {
  const runtime = createRuntime();
  await registered(runtime);
  expect(await runtime.getState()).toEqual(applicationReady);
  jest.mocked(feishuOauth.beginUser).mockRejectedValueOnce(new PluginError('network', 'safe'));
  await expect(runtime.begin()).rejects.toMatchObject({ reason: 'network' });
  await runtime.cancel();
  const next = await runtime.begin();
  expect(next).toMatchObject({ status: 'waiting', stage: 'user' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(1);
});

it('enforces polling intervals, slow_down, and an absolute expiry that removes device codes', async () => {
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
  expect(await runtime.getState()).toEqual({
    status: 'expired',
    attemptId: state.attemptId,
  });
  expect(stored()).not.toContain('private-device');
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
  expect(stored()).not.toContain('private-secret');
});

it('reports an application save failure so the user can start registration again', async () => {
  const runtime = createRuntime();
  fixture.store.writeApplication.mockRejectedValueOnce(new PluginError('storage', 'Save failed'));
  await expect(registered(runtime)).rejects.toMatchObject({ reason: 'storage' });
  expect(fixture.data.application).toBeUndefined();
  await runtime.cancel();
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'registration' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(2);
});

it('accepts partial tool permissions, requires renewal, and preserves the app for another authorization', async () => {
  const runtime = createRuntime();
  jest.mocked(feishuOauth.pollUser).mockResolvedValue({
    status: 'approved',
    tokens: { ...tokens, scope: 'calendar:calendar:read' },
  });
  const id = await authorized(runtime);
  await expect(runtime.prepare(id)).resolves.toMatchObject({
    credential: { tokens: { scope: 'calendar:calendar:read' } },
  });
  expect(await runtime.cancel()).toEqual(applicationReady);
  jest.mocked(feishuOauth.pollUser).mockResolvedValue({
    status: 'approved',
    tokens: { ...tokens, refreshToken: undefined, scope: `${tokens.scope} offline_access` },
  });
  const next = await runtime.begin();
  if (next.status !== 'waiting') throw new Error('Expected user authorization');
  await runtime.poll(next.attemptId);
  await expect(runtime.prepare(next.attemptId)).rejects.toMatchObject({
    reason: 'access',
    message: expect.stringContaining('offline access'),
  });
});

it('requires a fresh user authorization after a failed connection commit', async () => {
  const runtime = createRuntime();
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  fixture.store.commit.mockRejectedValueOnce(new Error('SQLite failed'));
  await expect(runtime.commit(id, prepared.accountLabel, prepared.signal)).rejects.toThrow(
    'SQLite failed',
  );
  expect(fixture.data.grant).toBeUndefined();
  expect(await runtime.getState()).toEqual(applicationReady);
  const restarted = createRuntime();
  expect(await restarted.getState()).toEqual(applicationReady);
  expect(await restarted.begin()).toMatchObject({ status: 'waiting', stage: 'user' });
});

it('deduplicates refresh and persists all rotated fields without changing the authorization identity', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockResolvedValue(rotatedTokens);
  const results = await Promise.all([
    runtime.resolveCredential(grant.id),
    runtime.resolveCredential(grant.id),
  ]);
  expect(results).toEqual([
    { version: 1, application, tokens: rotatedTokens },
    { version: 1, application, tokens: rotatedTokens },
  ]);
  expect(feishuOauth.refresh).toHaveBeenCalledTimes(1);
  expect(fixture.data.grant?.id).toBe(grant.id);
  expect(fixture.data.grant?.credential.tokens).toEqual(rotatedTokens);
  expect(await createRuntime().resolveCredential(grant.id)).toMatchObject({
    tokens: rotatedTokens,
  });
});

it('does not restore a grant removed from SQLite, while retaining the application for reconnecting', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  fixture.data.grant = undefined;
  const restarted = createRuntime();
  expect(await restarted.getState()).toEqual(applicationReady);
  await expect(restarted.resolveCredential(grant.id)).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(stored()).not.toMatch(/private-access|private-refresh/);
});

it('can explicitly replace an unusable application without dropping a working connection', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  expect(await runtime.resetApplication()).toEqual({ status: 'idle' });
  expect(await runtime.resolveCredential(grant.id)).toMatchObject({ tokens });
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'registration' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(2);
});

it('preserves credentials on transient refresh failure; disconnect removes the grant but keeps the application', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockRejectedValue(new PluginError('network', 'safe'));
  await expect(runtime.resolveCredential(grant.id)).rejects.toMatchObject({ reason: 'network' });
  expect(stored()).toContain('private-refresh');
  runtime.invalidateGrant();
  await runtime.cancel();
  fixture.data.grant = undefined;
  await expect(runtime.resolveCredential(grant.id)).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(stored()).not.toMatch(/private-access|private-refresh|private-device/);
  expect(await runtime.getState()).toEqual(applicationReady);
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'user' });
  expect(feishuOauth.beginRegistration).toHaveBeenCalledTimes(1);
});

const rotatedTokens = {
  ...tokens,
  accessToken: 'rotated-access',
  refreshToken: 'rotated-refresh',
  expiresAt: 7200000,
};
async function connected(runtime: FeishuAuthorizationRuntime) {
  const id = await authorized(runtime);
  const prepared = await runtime.prepare(id);
  await runtime.commit(id, prepared.accountLabel, prepared.signal);
  return fixture.data.grant!;
}

function pendingRefresh() {
  let release!: () => void;
  let signal!: AbortSignal;
  const started = new Promise<void>((resolve) => {
    jest
      .mocked(feishuOauth.refresh)
      .mockImplementationOnce(async (_application, _tokens, requestSignal) => {
        signal = requestSignal;
        resolve();
        await new Promise<void>((finish) => {
          release = finish;
        });
        return rotatedTokens;
      });
  });
  return { started, release: () => release(), signal: () => signal };
}

it('cancels only one caller wait while the shared refresh continues and is saved for the other caller', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  const refresh = pendingRefresh();
  const controller = new AbortController();
  const first = runtime.resolveCredential(grant.id, controller.signal);
  const cancelled = expect(first).rejects.toMatchObject({ reason: 'cancelled' });
  const second = runtime.resolveCredential(grant.id);
  await refresh.started;
  controller.abort();
  await cancelled;
  expect(refresh.signal().aborted).toBe(false);
  refresh.release();
  await expect(second).resolves.toMatchObject({ tokens: rotatedTokens });
  expect(fixture.data.grant?.credential.tokens).toEqual(rotatedTokens);
  expect(feishuOauth.refresh).toHaveBeenCalledTimes(1);
});

it('finishes persisting renewal even after its only caller stops waiting', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  const refresh = pendingRefresh();
  const controller = new AbortController();
  const result = runtime.resolveCredential(grant.id, controller.signal);
  const cancelled = expect(result).rejects.toMatchObject({ reason: 'cancelled' });
  await refresh.started;
  controller.abort();
  await cancelled;
  refresh.release();
  await runtime.getState();
  expect(fixture.data.grant?.credential.tokens).toEqual(rotatedTokens);
});

it('does not start renewal for an already cancelled caller', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  const controller = new AbortController();
  controller.abort();
  await expect(runtime.resolveCredential(grant.id, controller.signal)).rejects.toMatchObject({
    reason: 'cancelled',
  });
  expect(feishuOauth.refresh).not.toHaveBeenCalled();
});

it('shares a failed refresh without submitting another rotation for each queued caller', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockRejectedValue(new PluginError('network', 'safe'));
  const results = await Promise.allSettled([
    runtime.resolveCredential(grant.id),
    runtime.resolveCredential(grant.id),
  ]);
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(feishuOauth.refresh).toHaveBeenCalledTimes(1);
  expect(fixture.data.grant?.credential.tokens).toEqual(tokens);
});

it('reports a renewal save failure without retrying persistence on later state reads', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  jest.mocked(feishuOauth.refresh).mockResolvedValue(rotatedTokens);
  fixture.store.updateCredential.mockRejectedValueOnce(new Error('disk full'));
  await expect(runtime.resolveCredential(grant.id)).rejects.toMatchObject({ reason: 'storage' });
  expect(fixture.data.grant?.credential.tokens).toEqual(tokens);
  expect(await runtime.getState()).toEqual(applicationReady);
  expect(fixture.store.updateCredential).toHaveBeenCalledTimes(1);
  await runtime.cancel();
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'user' });
});

it.each(['disconnect', 'stop'] as const)(
  'aborts renewal on %s and discards a late successful response',
  async (action) => {
    const runtime = createRuntime();
    const grant = await connected(runtime);
    now.mockReturnValue(tokens.expiresAt);
    const refresh = pendingRefresh();
    const result = runtime.resolveCredential(grant.id);
    const cancelled = expect(result).rejects.toMatchObject({ reason: 'cancelled' });
    await refresh.started;
    if (action === 'disconnect') runtime.invalidateGrant();
    const closing = action === 'stop' ? runtime.stop() : runtime.cancel();
    if (action === 'disconnect') fixture.data.grant = undefined;
    expect(refresh.signal().aborted).toBe(true);
    refresh.release();
    await cancelled;
    await closing;
    expect(fixture.store.updateCredential).not.toHaveBeenCalled();
    if (action === 'disconnect') expect(await createRuntime().getState()).toEqual(applicationReady);
  },
);

it('does not overwrite a replacement grant when the old renewal finishes', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  const refresh = pendingRefresh();
  const result = runtime.resolveCredential(grant.id);
  const rejected = expect(result).rejects.toMatchObject({ reason: 'authorization' });
  await refresh.started;
  const replacement = {
    id: 'replacement-grant',
    credential: {
      version: 1,
      application,
      tokens: { ...rotatedTokens, accessToken: 'replacement' },
    },
  };
  fixture.data.grant = replacement;
  refresh.release();
  await rejected;
  expect(fixture.data.grant).toEqual(replacement);
});

it('saves rotated credentials and keeps the remaining permissions usable after a reduction', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  now.mockReturnValue(tokens.expiresAt);
  const reduced = { ...rotatedTokens, scope: 'calendar:calendar:read' };
  jest.mocked(feishuOauth.refresh).mockResolvedValue(reduced);
  await expect(runtime.resolveCredential(grant.id)).resolves.toMatchObject({ tokens: reduced });
  expect(fixture.data.grant?.credential.tokens).toEqual(reduced);
  await expect(runtime.resolveCredential(grant.id)).resolves.toMatchObject({ tokens: reduced });
  await expect(runtime.describeConnection(grant.id)).resolves.toEqual({ status: 'connected' });
  expect(feishuOauth.refresh).toHaveBeenCalledTimes(1);
});

it('reports expired or unusable grants locally without refreshing on the plugin screen', async () => {
  const runtime = createRuntime();
  const grant = await connected(runtime);
  await expect(runtime.describeConnection(grant.id)).resolves.toEqual({ status: 'connected' });
  now.mockReturnValue(tokens.refreshExpiresAt);
  await expect(runtime.describeConnection(grant.id)).resolves.toEqual({
    status: 'needs-reauthorization',
    reason: 'authorization',
  });
  now.mockReturnValue(1000);
  fixture.data.grant!.credential = {
    version: 1,
    application,
    tokens: { ...tokens, scope: 'offline_access' },
  };
  await expect(runtime.describeConnection(grant.id)).resolves.toEqual({
    status: 'needs-reauthorization',
    reason: 'access',
  });
  expect(feishuOauth.refresh).not.toHaveBeenCalled();
});
