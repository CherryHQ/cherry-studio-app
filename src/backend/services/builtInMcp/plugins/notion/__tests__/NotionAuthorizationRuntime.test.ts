import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { NotionAuthorizationRuntime } from '../NotionAuthorizationRuntime';
import type { NotionUserCredential } from '../notionCredentials';
import { notionOauth } from '../notionOauth';

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('../notionOauth', () => ({
  notionOauth: {
    getApplication: jest.fn(),
    challenge: jest.fn(),
    exchangeCode: jest.fn(),
    getAccount: jest.fn(),
    refresh: jest.fn(),
  },
}));

const credential: NotionUserCredential = {
  version: 1,
  application: {
    version: 1,
    clientId: 'public-client',
    authorizationEndpoint: 'https://mcp.notion.com/authorize',
    tokenEndpoint: 'https://mcp.notion.com/token',
    redirectUrl: 'cherrystudio-dev://plugins/notion/callback',
  },
  tokens: { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 3_601_000 },
  account: { id: 'workspace/user', label: 'Work · Member' },
};
const callback = `${credential.application.redirectUrl}?state=attempt-state&code=one-use-code`;
let fixture: ReturnType<typeof authorizationStoreFixture>;
let runtime: NotionAuthorizationRuntime;
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  fixture = authorizationStoreFixture();
  runtime = new NotionAuthorizationRuntime(fixture.store);
  jest.mocked(notionOauth.getApplication).mockResolvedValue(credential.application);
  jest.mocked(notionOauth.challenge).mockResolvedValue({
    state: 'attempt-state',
    verifier: 'private-proof',
    authorizationUrl: 'https://mcp.notion.com/authorize?state=attempt-state',
  });
  jest.mocked(notionOauth.exchangeCode).mockResolvedValue(credential.tokens);
  jest.mocked(notionOauth.getAccount).mockResolvedValue(credential.account);
});
afterEach(async () => {
  await runtime.stop();
  jest.restoreAllMocks();
});

async function begin() {
  const state = await runtime.begin();
  if (state.status !== 'callback') throw new Error('Expected browser authorization');
  return state;
}

it('consumes duplicate callbacks once and saves only after identity review and confirmation', async () => {
  const state = await begin();
  expect(JSON.stringify(state)).not.toMatch(/private-proof|access-secret|refresh-secret/);
  const results = await Promise.all([
    runtime.receiveCallback(state.attemptId, callback),
    runtime.receiveCallback(state.attemptId, callback),
  ]);
  expect(results.map((result) => result.status)).toEqual(['review', 'review']);
  expect(notionOauth.exchangeCode).toHaveBeenCalledTimes(1);
  expect(fixture.store.commit).not.toHaveBeenCalled();
  await runtime.confirm(state.attemptId);
  const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
  await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
  expect(fixture.data.grant?.credential).toEqual(credential);
});

it.each([
  callback.replace('attempt-state', 'wrong-state'),
  `${callback}&code=second`,
  `${callback}#fragment`,
  callback.replace('/callback', '/other'),
])('does not exchange a mismatched callback: %s', async (url) => {
  const state = await begin();
  await expect(runtime.receiveCallback(state.attemptId, url)).rejects.toMatchObject({
    reason: 'request',
  });
  expect(notionOauth.exchangeCode).not.toHaveBeenCalled();
});

it('requires disconnection before switching workspace or user', async () => {
  fixture.data.grant = {
    id: 'existing',
    credential: { ...credential, account: { id: 'another-workspace/user', label: 'Other' } },
  };
  const state = await begin();
  expect(await runtime.receiveCallback(state.attemptId, callback)).toMatchObject({
    status: 'review',
    requiresDisconnect: true,
  });
  expect(await runtime.confirm(state.attemptId)).toMatchObject({ status: 'review' });
  await expect(runtime.prepare(state.attemptId, runtime.attemptSignal)).rejects.toMatchObject({
    reason: 'requires-disconnect',
  });
});

it('does not retry an ambiguous refresh exchange for the same grant', async () => {
  fixture.data.grant = {
    id: 'existing',
    credential: { ...credential, tokens: { ...credential.tokens, expiresAt: 999 } },
  };
  jest.mocked(notionOauth.refresh).mockRejectedValue(new Error('Lost response'));
  await expect(runtime.resolveCredential('existing')).rejects.toBeDefined();
  await expect(runtime.resolveCredential('existing')).rejects.toBeDefined();
  expect(notionOauth.refresh).toHaveBeenCalledTimes(1);
  expect(fixture.data.grant.credential.tokens).toEqual({ ...credential.tokens, expiresAt: 999 });
});
