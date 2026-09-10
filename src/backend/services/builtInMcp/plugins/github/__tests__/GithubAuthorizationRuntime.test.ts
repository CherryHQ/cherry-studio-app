import { PluginError } from '@/shared/contracts/plugins';

import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import type { PluginCredential } from '../../../authorization/pluginCredential';
import { GithubAuthorizationRuntime } from '../GithubAuthorizationRuntime';
import { type GithubUserCredential } from '../githubCredentials';
import { getGithubApplication, githubOauth } from '../githubOauth';

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('../githubOauth', () => {
  const actual = jest.requireActual('../githubOauth');
  return {
    ...actual,
    getGithubApplication: jest.fn(),
    githubOauth: {
      challenge: jest.fn(),
      exchangeCode: jest.fn(),
      getAccount: jest.fn(),
      refresh: jest.fn(),
      revoke: jest.fn(),
    },
  };
});

const application = {
  clientId: 'cherry-oauth-client',
  clientSecret: 'public-client-secret',
  redirectUrl: 'cherrystudio-dev://plugins/github/callback' as const,
};
const tokens = {
  accessToken: 'private-access',
  refreshToken: 'private-refresh',
  expiresAt: 3_601_000,
  refreshExpiresAt: 86_401_000,
};
const account = { id: '42', login: 'cherry' };
const credential: GithubUserCredential = {
  version: 1,
  application,
  tokens,
  account,
};
const secret = (value: GithubUserCredential): PluginCredential => JSON.parse(JSON.stringify(value));
const callback = `${application.redirectUrl}?code=private-code&state=private-state`;
const flush = () => new Promise((resolve) => setImmediate(resolve));

let fixture: ReturnType<typeof authorizationStoreFixture>;
let runtime: GithubAuthorizationRuntime;
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  fixture = authorizationStoreFixture();
  runtime = new GithubAuthorizationRuntime(fixture.store);
  jest.mocked(getGithubApplication).mockReturnValue(application);
  jest.mocked(githubOauth.challenge).mockResolvedValue({
    state: 'private-state',
    verifier: 'private-verifier',
    authorizationUrl: 'https://github.com/login/oauth/authorize?state=private-state',
  });
  jest.mocked(githubOauth.exchangeCode).mockResolvedValue(tokens);
  jest.mocked(githubOauth.getAccount).mockResolvedValue(account);
  jest.mocked(githubOauth.refresh).mockResolvedValue({
    ...tokens,
    accessToken: 'rotated-access',
    refreshToken: 'rotated-refresh',
  });
});
afterEach(async () => {
  await runtime.stop();
  jest.restoreAllMocks();
});

async function begin() {
  const state = await runtime.begin();
  if (state.status !== 'callback') throw new Error('Expected a callback challenge');
  return state;
}
async function review() {
  const state = await begin();
  return runtime.receiveCallback(state.attemptId, callback);
}
function expiredGrant() {
  fixture.data.grant = {
    id: 'grant-1',
    credential: secret({ ...credential, tokens: { ...tokens, expiresAt: 999 } }),
  };
  return 'grant-1';
}

it('keeps callbacks and issued credentials in memory until review, confirmation and commit', async () => {
  const state = await begin();
  expect(JSON.stringify(state)).not.toMatch(
    /private-verifier|public-client-secret|private-refresh/,
  );
  const next = await runtime.receiveCallback(state.attemptId, callback);
  expect(next).toMatchObject({
    status: 'review',
    accountLabel: 'cherry',
  });
  expect(fixture.store.commit).not.toHaveBeenCalled();
  expect(fixture.store.writeApplication).not.toHaveBeenCalled();
  expect(await runtime.confirm(state.attemptId)).toMatchObject({ status: 'ready' });
  const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
  await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
  expect(fixture.store.commit).toHaveBeenCalledWith(secret(credential), 'cherry', prepared.signal, {
    authorizationId: undefined,
  });
  expect(await runtime.getState()).toEqual({ status: 'idle' });
});

it('consumes a callback once even when the authentication session and route deliver it together', async () => {
  const state = await begin();
  const results = await Promise.all([
    runtime.receiveCallback(state.attemptId, callback),
    runtime.receiveCallback(state.attemptId, callback),
  ]);
  expect(results.map((value) => value.status)).toEqual(['review', 'review']);
  expect(githubOauth.exchangeCode).toHaveBeenCalledTimes(1);
  expect(githubOauth.exchangeCode).toHaveBeenCalledWith(
    application,
    'private-code',
    'private-verifier',
    expect.any(AbortSignal),
  );
});

it.each([
  callback.replace('cherrystudio-dev:', 'https:'),
  callback.replace('/callback', '/callback/other'),
  callback.replace('private-state', 'wrong-state'),
  `${callback}&state=private-state`,
  `${callback}&code=another-code`,
  `${callback}#fragment`,
])('rejects a callback that does not match the active challenge: %s', async (url) => {
  const state = await begin();
  await expect(runtime.receiveCallback(state.attemptId, url)).rejects.toMatchObject({
    reason: 'request',
  });
  expect(githubOauth.exchangeCode).not.toHaveBeenCalled();
});

it('expires a callback without consuming its code', async () => {
  const state = await begin();
  jest.mocked(Date.now).mockReturnValue(state.expiresAt);
  expect(await runtime.receiveCallback(state.attemptId, callback)).toMatchObject({
    status: 'expired',
  });
  expect(githubOauth.exchangeCode).not.toHaveBeenCalled();
});

it('discards a denied or failed exchange so retry starts with a fresh challenge', async () => {
  const first = await begin();
  expect(
    await runtime.receiveCallback(
      first.attemptId,
      `${application.redirectUrl}?error=access_denied&state=private-state`,
    ),
  ).toMatchObject({ status: 'denied' });
  const second = await begin();
  expect(second.attemptId).not.toBe(first.attemptId);
  jest.mocked(githubOauth.exchangeCode).mockRejectedValueOnce(new PluginError('network', 'safe'));
  await expect(runtime.receiveCallback(second.attemptId, callback)).rejects.toMatchObject({
    reason: 'network',
  });
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  await expect(runtime.receiveCallback(second.attemptId, callback)).rejects.toMatchObject({
    reason: 'cancelled',
  });
  expect(githubOauth.exchangeCode).toHaveBeenCalledTimes(1);
});

it('allows the same stable user ID to reconnect after a login rename', async () => {
  fixture.data.grant = {
    id: 'old-grant',
    credential: secret({ ...credential, account: { ...account, login: 'old-login' } }),
  };
  expect(await review()).toMatchObject({ requiresDisconnect: false });
});

it('connects and resolves a non-expiring OAuth grant using account identity without repository setup', async () => {
  jest.mocked(githubOauth.exchangeCode).mockResolvedValueOnce({ accessToken: 'long-lived-access' });
  const state = await begin();
  const next = await runtime.receiveCallback(state.attemptId, callback);
  expect(next).toEqual({
    status: 'review',
    attemptId: state.attemptId,
    accountLabel: account.login,
    requiresDisconnect: false,
  });
  await runtime.confirm(state.attemptId);
  const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
  await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
  const id = await fixture.store.getCurrentAuthorizationId();
  expect(id).toBeDefined();
  await expect(runtime.resolveCredential(id!)).resolves.toMatchObject({
    tokens: { accessToken: 'long-lived-access' },
    account,
  });
  expect(githubOauth.refresh).not.toHaveBeenCalled();
});

it('requires disconnection when a different user ID has the same display login', async () => {
  fixture.data.grant = {
    id: 'old-grant',
    credential: secret({ ...credential, account: { ...account, id: '99' } }),
  };
  expect(await review()).toMatchObject({ requiresDisconnect: true });
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

it('requires disconnection for another method or a changed grant during browser authorization', async () => {
  fixture.store.getCurrentAuthorizationId.mockResolvedValue('personal-grant');
  expect(await review()).toMatchObject({ requiresDisconnect: true });
  await runtime.cancel();
  fixture.store.getCurrentAuthorizationId.mockResolvedValue(undefined);
  const state = await begin();
  fixture.store.getCurrentAuthorizationId.mockResolvedValue('new-grant');
  expect(await runtime.receiveCallback(state.attemptId, callback)).toMatchObject({
    requiresDisconnect: true,
  });
});

it('does not restore pending tokens after a cold start or repeat a failed local commit', async () => {
  const state = await begin();
  await runtime.receiveCallback(state.attemptId, callback);
  const restarted = new GithubAuthorizationRuntime(fixture.store);
  expect(await restarted.getState()).toEqual({ status: 'idle' });
  await restarted.stop();
  await runtime.confirm(state.attemptId);
  fixture.store.commit.mockRejectedValueOnce(new PluginError('storage', 'safe'));
  await expect(
    runtime.commit(state.attemptId, 'cherry', runtime.attemptSignal),
  ).rejects.toMatchObject({ reason: 'storage' });
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  await expect(
    runtime.commit(state.attemptId, 'cherry', runtime.attemptSignal),
  ).rejects.toMatchObject({ reason: 'authorization' });
  expect(fixture.store.commit).toHaveBeenCalledTimes(1);
});

it('ignores a late browser dismissal after the callback has reached review', async () => {
  const state = await begin();
  await runtime.receiveCallback(state.attemptId, callback);
  expect(await runtime.cancel(state.attemptId)).toMatchObject({ status: 'review' });
  await runtime.cancel();
  const next = await begin();
  expect(await runtime.cancel(state.attemptId)).toMatchObject({
    status: 'callback',
    attemptId: next.attemptId,
  });
});

it('cancellation discards only the pending flow and preserves the saved connection', async () => {
  fixture.data.grant = { id: 'old-grant', credential: secret(credential) };
  await review();
  await runtime.cancel();
  expect(fixture.data.grant.id).toBe('old-grant');
  expect(fixture.store.updateCredential).not.toHaveBeenCalled();
  expect(await runtime.getState()).toEqual({ status: 'idle' });
});

it('shares a complete token rotation among concurrent callers and saves it before returning', async () => {
  const id = expiredGrant();
  const results = await Promise.all([runtime.resolveCredential(id), runtime.resolveCredential(id)]);
  expect(githubOauth.refresh).toHaveBeenCalledTimes(1);
  expect(fixture.store.updateCredential).toHaveBeenCalledTimes(1);
  expect(results[0]).toEqual(results[1]);
  expect(fixture.data.grant?.credential).toMatchObject({
    account,
    tokens: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' },
  });
});

it.each(['network', 'storage'] as const)(
  'shares a %s refresh failure and does not blindly retry it',
  async (reason) => {
    const id = expiredGrant();
    if (reason === 'network')
      jest.mocked(githubOauth.refresh).mockRejectedValueOnce(new PluginError(reason, 'safe'));
    else fixture.store.updateCredential.mockRejectedValueOnce(new PluginError(reason, 'safe'));
    const results = await Promise.allSettled([
      runtime.resolveCredential(id),
      runtime.resolveCredential(id),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ reason }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ reason }) }),
    ]);
    await expect(runtime.resolveCredential(id)).rejects.toMatchObject({ reason });
    expect(githubOauth.refresh).toHaveBeenCalledTimes(1);
    expect(await runtime.describeConnection(id)).toMatchObject({ status: 'unavailable', reason });
  },
);

it('releases a cancelled caller immediately while another caller owns the shared renewal result', async () => {
  const id = expiredGrant();
  let finish!: (value: typeof tokens) => void;
  jest.mocked(githubOauth.refresh).mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const caller = new AbortController();
  const first = runtime.resolveCredential(id, caller.signal);
  const second = runtime.resolveCredential(id);
  await flush();
  caller.abort();
  await expect(first).rejects.toMatchObject({ reason: 'cancelled' });
  expect(jest.mocked(githubOauth.refresh).mock.calls[0][2].aborted).toBe(false);
  finish({ ...tokens, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
  await expect(second).resolves.toMatchObject({ tokens: { accessToken: 'rotated-access' } });
});

it('stops a renewal owned by a replaced grant even if the remote request resolves late', async () => {
  const id = expiredGrant();
  let finish!: (value: typeof tokens) => void;
  jest.mocked(githubOauth.refresh).mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const result = runtime.resolveCredential(id);
  await flush();
  runtime.invalidateGrant();
  finish(tokens);
  await expect(result).rejects.toMatchObject({ reason: 'cancelled' });
  expect(fixture.store.updateCredential).not.toHaveBeenCalled();
});

it('rejects a refresh whose grant disappeared before persistence', async () => {
  const id = expiredGrant();
  fixture.store.updateCredential.mockResolvedValueOnce(false);
  await expect(runtime.resolveCredential(id)).rejects.toMatchObject({ reason: 'cancelled' });
});

it('persists confirmed rejection and ignores a late 401 from an older token', async () => {
  fixture.data.grant = {
    id: 'grant-1',
    credential: secret({ ...credential, tokens: { ...tokens, accessToken: 'new-access' } }),
  };
  await runtime.rejectCredential('grant-1', secret(credential));
  expect(fixture.store.updateCredential).not.toHaveBeenCalled();
  await runtime.rejectCredential('grant-1', fixture.data.grant.credential);
  expect(await runtime.describeConnection('grant-1')).toMatchObject({
    status: 'needs-reauthorization',
    reason: 'authorization',
  });
  const restarted = new GithubAuthorizationRuntime(fixture.store);
  await expect(restarted.resolveCredential('grant-1')).rejects.toMatchObject({
    reason: 'authorization',
  });
  await restarted.stop();
});

it('projects local state without making network requests and captures only a bounded revocation closure', async () => {
  fixture.data.grant = { id: 'grant-1', credential: secret(credential) };
  const state = await runtime.describeConnection('grant-1');
  expect(state).toMatchObject({
    status: 'connected',
    managementUrl: `https://github.com/settings/connections/applications/${application.clientId}`,
  });
  expect(JSON.stringify(state)).not.toMatch(/private-access|private-refresh|public-client-secret/);
  expect(githubOauth.refresh).not.toHaveBeenCalled();
  const revocation = await runtime.prepareRevocation('grant-1');
  fixture.data.grant = undefined;
  const signal = new AbortController().signal;
  await revocation.revoke(signal);
  expect(githubOauth.revoke).toHaveBeenCalledWith(application, tokens.accessToken, signal);
});

it('notifies connection readers about missing native credentials without contacting GitHub', async () => {
  await expect(runtime.resolveCredential('missing-grant')).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(fixture.store.notifyChanged).toHaveBeenCalled();
  expect(githubOauth.refresh).not.toHaveBeenCalled();
  expect(await runtime.describeConnection('missing-grant')).toMatchObject({
    status: 'needs-reauthorization',
  });
});
