import { PluginError } from '@/shared/contracts/plugins';

import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import type { PluginCredential } from '../../../authorization/pluginCredential';
import { enrichDingtalkAccount } from '../dingtalkAccount';
import { DingtalkAuthorizationRuntime } from '../DingtalkAuthorizationRuntime';
import type { DingtalkUserCredential } from '../dingtalkCredentials';
import { dingtalkOauth } from '../dingtalkOauth';

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('../dingtalkAccount');
jest.mock('../dingtalkOauth', () => ({
  ...jest.requireActual('../dingtalkOauth'),
  dingtalkOauth: {
    begin: jest.fn(),
    poll: jest.fn(),
    exchange: jest.fn(),
    checkAccess: jest.fn(),
    refresh: jest.fn(),
    revoke: jest.fn(),
  },
}));
const credential: DingtalkUserCredential = {
  version: 1,
  clientId: 'managed-client',
  account: { corpId: 'org-1', userId: 'user-1', userName: 'Cherry' },
  tokens: {
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: 3601000,
    refreshExpiresAt: 86401000,
  },
};
const secret = (value: DingtalkUserCredential): PluginCredential =>
  JSON.parse(JSON.stringify(value));
const challenge = {
  verificationUrl: 'https://login.dingtalk.com/confirm',
  deviceCode: 'private-device',
  userCode: 'confirm-code',
  flowId: 'private-flow',
  expiresAt: 901000,
  intervalMs: 5000,
  nextPollAt: 6000,
};
let fixture: ReturnType<typeof authorizationStoreFixture>;
let runtime: DingtalkAuthorizationRuntime;
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  fixture = authorizationStoreFixture();
  runtime = new DingtalkAuthorizationRuntime(fixture.store);
  jest
    .mocked(dingtalkOauth.begin)
    .mockResolvedValue({ clientId: credential.clientId, clientSecret: undefined, challenge });
  jest
    .mocked(dingtalkOauth.poll)
    .mockResolvedValue({ status: 'approved', authCode: 'private-code' });
  jest.mocked(dingtalkOauth.exchange).mockResolvedValue(credential);
  jest.mocked(enrichDingtalkAccount).mockImplementation(async (value) => value);
  jest.mocked(dingtalkOauth.refresh).mockResolvedValue({
    ...credential,
    tokens: {
      ...credential.tokens,
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    },
  });
});
afterEach(async () => {
  await runtime.stop();
  jest.restoreAllMocks();
});
async function begin() {
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected waiting state');
  return state;
}
function connect(value = credential) {
  fixture.data.grant = { id: 'grant-1', credential: secret(value) };
}

it('keeps device credentials private and commits only after account confirmation', async () => {
  const state = await begin();
  expect(JSON.stringify(state)).not.toMatch(/private-device|private-flow|private-refresh/);
  expect(await runtime.poll(state.attemptId)).toMatchObject({ status: 'waiting' });
  expect(dingtalkOauth.poll).not.toHaveBeenCalled();
  jest.mocked(Date.now).mockReturnValue(6000);
  expect(await runtime.poll(state.attemptId)).toMatchObject({
    status: 'review',
    accountLabel: 'Cherry · org-1',
    requiresDisconnect: false,
  });
  expect(fixture.store.commit).not.toHaveBeenCalled();
  expect(await runtime.confirm(state.attemptId)).toMatchObject({ status: 'ready' });
  const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
  await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
  expect(fixture.store.commit).toHaveBeenCalledWith(
    secret(credential),
    'Cherry · org-1',
    prepared.signal,
    { authorizationId: undefined },
  );
});

it('consumes one code even when observers poll concurrently', async () => {
  const state = await begin();
  jest.mocked(Date.now).mockReturnValue(6000);
  expect(
    (await Promise.all([runtime.poll(state.attemptId), runtime.poll(state.attemptId)])).map(
      (value) => value.status,
    ),
  ).toEqual(['review', 'review']);
  expect(dingtalkOauth.exchange).toHaveBeenCalledTimes(1);
});

it('drops ambiguous exchanges and requires a fresh attempt', async () => {
  const state = await begin();
  jest.mocked(Date.now).mockReturnValue(6000);
  jest.mocked(dingtalkOauth.exchange).mockRejectedValueOnce(new PluginError('network', 'safe'));
  await expect(runtime.poll(state.attemptId)).rejects.toMatchObject({ reason: 'network' });
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  expect((await begin()).attemptId).not.toBe(state.attemptId);
});

it.each([
  { corpId: 'other-org', userId: 'user-1' },
  { corpId: 'org-1', userId: 'other-user' },
  { corpId: 'org-1' },
])('requires disconnect when fresh identity differs or cannot be proven: %j', async (account) => {
  connect();
  jest.mocked(dingtalkOauth.exchange).mockResolvedValue({ ...credential, account });
  const state = await begin();
  jest.mocked(Date.now).mockReturnValue(6000);
  expect(await runtime.poll(state.attemptId)).toMatchObject({
    status: 'review',
    requiresDisconnect: true,
  });
  expect(await runtime.confirm(state.attemptId)).toMatchObject({ status: 'review' });
  await expect(runtime.prepare(state.attemptId, runtime.attemptSignal)).rejects.toMatchObject({
    reason: 'requires-disconnect',
  });
});

it('allows same-user reconnection but rejects a grant changed while the review was open', async () => {
  connect();
  const state = await begin();
  jest.mocked(Date.now).mockReturnValue(6000);
  expect(await runtime.poll(state.attemptId)).toMatchObject({ requiresDisconnect: false });
  fixture.data.grant = { id: 'grant-2', credential: secret(credential) };
  expect(await runtime.confirm(state.attemptId)).toMatchObject({ requiresDisconnect: true });
});

it('shares renewal and blocks uncertain rotation instead of reusing the refresh token', async () => {
  connect({ ...credential, tokens: { ...credential.tokens, expiresAt: 999 } });
  jest.mocked(dingtalkOauth.refresh).mockRejectedValueOnce(new PluginError('network', 'safe'));
  const results = await Promise.allSettled([
    runtime.resolveCredential('grant-1'),
    runtime.resolveCredential('grant-1'),
  ]);
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(dingtalkOauth.refresh).toHaveBeenCalledTimes(1);
  await expect(runtime.resolveCredential('grant-1')).rejects.toMatchObject({ reason: 'network' });
  expect(dingtalkOauth.refresh).toHaveBeenCalledTimes(1);
  expect(fixture.data.grant?.credential.rejected).toBe(true);
});

it('cancels one waiter without cancelling shared renewal and ignores a late rejection of the old token', async () => {
  connect({ ...credential, tokens: { ...credential.tokens, expiresAt: 999 } });
  const controller = new AbortController();
  const first = runtime.resolveCredential('grant-1', controller.signal);
  const second = runtime.resolveCredential('grant-1');
  controller.abort();
  await expect(first).rejects.toMatchObject({ reason: 'cancelled' });
  await expect(second).resolves.toMatchObject({ tokens: { accessToken: 'rotated-access' } });
  await runtime.rejectCredential('grant-1', secret(credential));
  expect(await runtime.describeConnection('grant-1')).toMatchObject({ status: 'connected' });
});

it('holds behavior authorization privately, approves the same grant, and never invokes the failed tool', async () => {
  connect();
  await runtime.requestAuthorization('grant-1', {
    code: 'PAT_NO_PERMISSION',
    flowId: 'flow-2',
    uri: 'https://open-dev.dingtalk.com/fe/old#%2FpersonalAuthorization?flowId=flow-2&userCode=confirm-code',
  });
  expect(await runtime.describeConnection('grant-1')).toMatchObject({
    status: 'needs-reauthorization',
    reason: 'access',
  });
  const state = await begin();
  expect(state.stage).toBe('permission');
  expect(dingtalkOauth.begin).not.toHaveBeenCalled();
  jest.mocked(Date.now).mockReturnValue(6000);
  jest.mocked(dingtalkOauth.poll).mockResolvedValue({ status: 'approved' });
  expect(await runtime.poll(state.attemptId)).toMatchObject({
    status: 'review',
    requiresDisconnect: false,
  });
  expect(dingtalkOauth.exchange).not.toHaveBeenCalled();
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

it('does not adopt a server-issued application before an approved code and identity review', async () => {
  connect();
  await runtime.requestAuthorization('grant-1', {
    code: 'AGENT_CODE_NOT_EXISTS',
    clientId: 'new-client',
    clientSecret: 'private-secret',
    flowId: 'flow-2',
    uri: 'https://open-dev.dingtalk.com/fe/old#/personalAuthorization?flowId=flow-2&userCode=code',
  });
  const state = await begin();
  expect(JSON.stringify(state)).not.toContain('private-secret');
  expect(fixture.data.grant?.credential.clientId).toBe('managed-client');
  jest.mocked(Date.now).mockReturnValue(6000);
  jest
    .mocked(dingtalkOauth.exchange)
    .mockResolvedValue({ ...credential, clientId: 'new-client', clientSecret: 'private-secret' });
  expect(await runtime.poll(state.attemptId)).toMatchObject({ status: 'review' });
  expect(dingtalkOauth.exchange).toHaveBeenCalledWith(
    { clientId: 'new-client', clientSecret: 'private-secret' },
    'private-code',
    expect.any(AbortSignal),
  );
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

it('honors organization denials without opening another consent flow', async () => {
  connect();
  await runtime.requestAuthorization('grant-1', { code: 'PAT_ORG_POLICY_DENIED' });
  expect(await runtime.begin()).toMatchObject({ status: 'unsupported-account' });
  expect(dingtalkOauth.begin).not.toHaveBeenCalled();
});

it('restarts account authorization for gateway authentication failures', async () => {
  connect();
  await runtime.requestAuthorization('grant-1', { code: 'DWS_SERVICE_UNAUTHORIZED' });
  expect(await runtime.describeConnection('grant-1')).toMatchObject({ reason: 'authorization' });
  expect(await runtime.begin()).toMatchObject({ status: 'waiting', stage: 'user' });
  expect(dingtalkOauth.begin).toHaveBeenCalledTimes(1);
});

it('restarts with explicitly requested missing scope and discards it on cancellation', async () => {
  connect();
  await runtime.requestAuthorization('grant-1', {
    code: 'PAT_SCOPE_AUTH_REQUIRED',
    missingScope: 'Contact.User.Read',
  });
  await begin();
  expect(dingtalkOauth.begin).toHaveBeenCalledWith(
    expect.any(AbortSignal),
    credential,
    'Contact.User.Read',
  );
  await runtime.cancel();
  await begin();
  expect(dingtalkOauth.begin).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    undefined,
    undefined,
  );
});
