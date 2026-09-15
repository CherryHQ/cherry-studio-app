import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import type { PluginCredential } from '../../../authorization/pluginCredential';
import { SlackAuthorizationRuntime } from '../SlackAuthorizationRuntime';
import { SLACK_REQUESTED_SCOPES, type SlackUserCredential } from '../slackCredentials';
import { getSlackApplication, slackOauth } from '../slackOauth';

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('../slackOauth', () => ({
  getSlackApplication: jest.fn(),
  slackOauth: {
    challenge: jest.fn(),
    exchangeCode: jest.fn(),
    getAccount: jest.fn(),
    revoke: jest.fn(),
    refresh: jest.fn(),
  },
}));

const application = {
  version: 1 as const,
  clientId: '123.456',
  redirectUrl: 'cherrystudio-dev://plugins/slack/callback' as const,
};
const tokens = {
  accessToken: 'private-access',
  refreshToken: 'private-refresh',
  expiresAt: 3_601_000,
  refreshExpiresAt: 86_401_000,
  scope: SLACK_REQUESTED_SCOPES.join(','),
};
const account = { id: 'T1:U1', label: 'Workspace · User' };
const credential: SlackUserCredential = { version: 1, application, tokens, account };
const saved = (value: SlackUserCredential): PluginCredential => JSON.parse(JSON.stringify(value));
const callback = `${application.redirectUrl}?code=private-code&state=private-state`;

let fixture: ReturnType<typeof authorizationStoreFixture>;
let runtime: SlackAuthorizationRuntime;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  fixture = authorizationStoreFixture();
  jest.mocked(getSlackApplication).mockReturnValue(application);
  runtime = new SlackAuthorizationRuntime(fixture.store);
  jest.mocked(slackOauth.challenge).mockResolvedValue({
    state: 'private-state',
    verifier: 'private-verifier',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize?state=private-state',
  });
  jest.mocked(slackOauth.exchangeCode).mockResolvedValue(tokens);
  jest.mocked(slackOauth.getAccount).mockResolvedValue(account);
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

it('opens publisher authorization directly even when a personal application was saved before', async () => {
  fixture.data.application = { ...application, clientId: '987.654' };
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  const state = await begin();
  expect(state).toMatchObject({ stage: 'user', redirectUrl: application.redirectUrl });
  expect(slackOauth.challenge).toHaveBeenCalledWith(application);
  expect(fixture.store.readApplication).not.toHaveBeenCalled();
  expect(fixture.store.writeApplication).not.toHaveBeenCalled();
});

it('leaves the existing grant intact when publisher authorization is not configured', async () => {
  jest.mocked(getSlackApplication).mockReturnValue(undefined);
  fixture.data.application = application;
  fixture.data.grant = { id: 'existing-grant', credential: saved(credential) };
  await expect(runtime.begin()).rejects.toMatchObject({ reason: 'unavailable' });
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  expect(slackOauth.challenge).not.toHaveBeenCalled();
  expect(fixture.data.grant).toEqual({ id: 'existing-grant', credential: saved(credential) });
});

it('refreshes existing grants with the application that issued them', async () => {
  const previous = {
    ...credential,
    application: { ...application, clientId: '987.654' },
    tokens: { ...tokens, expiresAt: 1000 },
  };
  fixture.data.grant = { id: 'existing-grant', credential: saved(previous) };
  jest.mocked(slackOauth.refresh).mockResolvedValue({
    ...tokens,
    accessToken: 'renewed-access',
    refreshToken: 'renewed-refresh',
  });
  const renewed = await runtime.resolveCredential('existing-grant');
  expect(slackOauth.refresh).toHaveBeenCalledWith(
    previous.application,
    previous.tokens,
    expect.any(AbortSignal),
  );
  expect(renewed).toMatchObject({
    application: previous.application,
    tokens: { accessToken: 'renewed-access', refreshToken: 'renewed-refresh' },
  });
  expect(fixture.data.grant?.credential).toEqual(renewed);
});

it.each([false, true])(
  'completes without another confirmation for an existing account: %s',
  async (existing) => {
    if (existing) {
      fixture.data.grant = {
        id: 'existing-grant',
        credential: saved({ ...credential, account: { ...account, label: 'Previous name' } }),
      };
    }
    const state = await begin();
    const next = await runtime.receiveCallback(state.attemptId, callback);
    expect(next).toEqual({ status: 'ready', attemptId: state.attemptId });
    expect(fixture.data.grant?.id).toBe(existing ? 'existing-grant' : undefined);
    const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
    await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
    expect(fixture.data.grant?.credential).toEqual(saved(credential));
    expect(fixture.store.commit).toHaveBeenCalledWith(
      saved(credential),
      account.label,
      prepared.signal,
      { authorizationId: existing ? 'existing-grant' : undefined },
    );
  },
);

it.each(['T2:U1', 'T1:U2'])(
  'keeps the existing connection when Slack returns another identity: %s',
  async (id) => {
    fixture.data.grant = { id: 'existing-grant', credential: saved(credential) };
    jest.mocked(slackOauth.getAccount).mockResolvedValue({ ...account, id });
    const state = await begin();
    expect(await runtime.receiveCallback(state.attemptId, callback)).toEqual({
      status: 'review',
      attemptId: state.attemptId,
      accountLabel: account.label,
      requiresDisconnect: true,
    });
    await expect(runtime.prepare(state.attemptId, runtime.attemptSignal)).rejects.toMatchObject({
      reason: 'requires-disconnect',
    });
    expect(fixture.data.grant).toEqual({ id: 'existing-grant', credential: saved(credential) });
  },
);

it('checks for a replaced connection before automatically completing authorization', async () => {
  const state = await begin();
  await runtime.receiveCallback(state.attemptId, callback);
  fixture.data.grant = { id: 'new-grant', credential: saved(credential) };
  await expect(runtime.prepare(state.attemptId, runtime.attemptSignal)).rejects.toMatchObject({
    reason: 'requires-disconnect',
  });
  expect(fixture.data.grant.id).toBe('new-grant');
});

it('consumes duplicate callbacks once before automatic completion', async () => {
  const state = await begin();
  const results = await Promise.all([
    runtime.receiveCallback(state.attemptId, callback),
    runtime.receiveCallback(state.attemptId, callback),
  ]);
  expect(results.map((result) => result.status)).toEqual(['ready', 'ready']);
  expect(slackOauth.exchangeCode).toHaveBeenCalledTimes(1);
});

it.each([
  'search:read',
  'search:read.public,search:read.private,search:read.im,search:read.mpim,search:read.files,search:read.users,channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,users:read,users:read.email,files:read',
])(
  'blocks outdated scope bundle %s while still allowing its token to be revoked',
  async (scope) => {
    fixture.data.grant = {
      id: 'legacy-grant',
      credential: saved({ ...credential, tokens: { ...tokens, scope } }),
    };
    expect(await runtime.describeConnection('legacy-grant')).toMatchObject({
      status: 'needs-reauthorization',
      reason: 'authorization',
    });
    await expect(runtime.resolveCredential('legacy-grant')).rejects.toMatchObject({
      reason: 'authorization',
    });
    const revocation = await runtime.prepareRevocation('legacy-grant');
    const signal = new AbortController().signal;
    await revocation.revoke(signal);
    expect(slackOauth.revoke).toHaveBeenCalledWith(tokens.accessToken, signal);
  },
);
