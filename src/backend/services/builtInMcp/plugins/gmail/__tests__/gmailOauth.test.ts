import { getGmailAuthorization } from '../../../../../../../modules/gmail-authorization';
import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { GmailAuthorizationRuntime } from '../GmailAuthorizationRuntime';
import { GMAIL_READ_SCOPE, type GmailUserCredential } from '../gmailCredentials';
import { gmailOauth } from '../gmailOauth';

jest.mock('../../../../../../../modules/gmail-authorization', () => ({
  getGmailAuthorization: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
  isHttpError: () => false,
}));
const native = { authorize: jest.fn(), revoke: jest.fn(), clearToken: jest.fn() };
const signal = new AbortController().signal;
const account = { id: 'owner@example.com', label: 'owner@example.com' };
const credential: GmailUserCredential = {
  version: 1,
  account,
  tokens: { accessToken: 'access', scope: GMAIL_READ_SCOPE },
};
const authorized = (accessToken = 'access') => ({ accessToken, grantedScopes: [GMAIL_READ_SCOPE] });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getGmailAuthorization).mockReturnValue(native);
  native.authorize.mockReset().mockResolvedValue(authorized());
  native.revoke.mockReset().mockResolvedValue(undefined);
  native.clearToken.mockReset().mockResolvedValue(undefined);
  mockRequest.mockReset().mockResolvedValue({ data: { emailAddress: account.label } });
});

it('accepts Gmail readonly with the basic identity scopes added by Google Sign-In', async () => {
  native.authorize.mockResolvedValue({
    ...authorized(),
    grantedScopes: [GMAIL_READ_SCOPE, 'openid', 'https://www.googleapis.com/auth/userinfo.email'],
  });
  expect(await gmailOauth.authorize(null, true, signal)).toEqual(credential.tokens);
  expect(native.authorize).toHaveBeenCalledWith(null, true);
});

it.each([
  ['openid'],
  [GMAIL_READ_SCOPE, 'https://www.googleapis.com/auth/gmail.send'],
  [GMAIL_READ_SCOPE, 'https://www.googleapis.com/auth/drive'],
])('rejects missing read access or unrelated data access: %s', async (...scopes) => {
  native.authorize.mockResolvedValue({ ...authorized(), grantedScopes: scopes });
  await expect(gmailOauth.authorize(null, true, signal)).rejects.toMatchObject({
    reason: 'access',
  });
});

it('reports an unavailable build without attempting a browser or token exchange', async () => {
  jest.mocked(getGmailAuthorization).mockReturnValue(null);
  await expect(gmailOauth.authorize(null, true, signal)).rejects.toMatchObject({
    reason: 'unavailable',
  });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('keeps tokens out of review state and saves only after account confirmation', async () => {
  const { store } = authorizationStoreFixture();
  const runtime = new GmailAuthorizationRuntime(store);
  const state = await runtime.begin();
  expect(state).toMatchObject({
    status: 'review',
    accountLabel: account.label,
    requiresDisconnect: false,
  });
  if (state.status !== 'review') throw new Error('Expected review');
  expect(JSON.stringify(state)).not.toContain('accessToken');
  expect(store.commit).not.toHaveBeenCalled();
  await expect(runtime.prepare(state.attemptId, signal)).rejects.toMatchObject({
    reason: 'requires-disconnect',
  });
  await runtime.confirm(state.attemptId);
  const prepared = await runtime.prepare(state.attemptId, signal);
  expect(prepared.credential).toEqual(credential);
  await runtime.commit(state.attemptId, account.label, signal);
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.writeApplication).not.toHaveBeenCalled();
  await runtime.stop();
});

it('treats dismissal of Google consent as cancellation without saving a connection', async () => {
  native.authorize.mockRejectedValue({ code: 'E_GMAIL_CANCELLED', message: 'private SDK detail' });
  const { store } = authorizationStoreFixture();
  const runtime = new GmailAuthorizationRuntime(store);
  expect(await runtime.begin()).toEqual({ status: 'idle' });
  expect(store.commit).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  await runtime.stop();
});

it('discards a late native result after interruption', async () => {
  let finish!: (value: ReturnType<typeof authorized>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  native.authorize.mockImplementation(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { store } = authorizationStoreFixture();
  const runtime = new GmailAuthorizationRuntime(store);
  const beginning = runtime.begin();
  await started;
  runtime.interrupt();
  await expect(beginning).rejects.toMatchObject({ reason: 'cancelled' });
  finish(authorized());
  expect(await runtime.getState()).toEqual({ status: 'idle' });
  expect(store.commit).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  await runtime.stop();
});

it('does not refresh credentials while projecting the plugin list', async () => {
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  const runtime = new GmailAuthorizationRuntime(store);
  expect(await runtime.describeConnection('grant')).toMatchObject({ status: 'connected' });
  expect(native.authorize).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
  await runtime.stop();
});

it('shares silent renewal while allowing one caller to cancel its own wait', async () => {
  let finish!: (value: ReturnType<typeof authorized>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  native.authorize.mockImplementation(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  const runtime = new GmailAuthorizationRuntime(store);
  const caller = new AbortController();
  const first = runtime.resolveCredential('grant', caller.signal);
  const second = runtime.resolveCredential('grant');
  await started;
  caller.abort();
  await expect(first).rejects.toMatchObject({ reason: 'cancelled' });
  finish(authorized('renewed-access'));
  expect(await second).toMatchObject({ tokens: { accessToken: 'renewed-access' } });
  expect(native.authorize.mock.calls).toEqual([[account.id, false]]);
  expect(store.updateCredential).toHaveBeenCalledTimes(1);
  await runtime.stop();
});

it('refuses to replace a connected mailbox with another account during renewal', async () => {
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  native.authorize.mockResolvedValue(authorized('other-account-token'));
  mockRequest.mockResolvedValue({ data: { emailAddress: 'other@example.com' } });
  const runtime = new GmailAuthorizationRuntime(store);
  await expect(runtime.resolveCredential('grant')).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(data.grant?.credential).toMatchObject({ ...credential, rejected: true });
  expect(await runtime.describeConnection('grant')).toMatchObject({
    status: 'needs-reauthorization',
  });
  await runtime.stop();
});

it('requires reconnect when silent authorization needs consent and never opens interactive UI', async () => {
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  native.authorize.mockRejectedValue({ code: 'E_GMAIL_AUTHORIZATION' });
  const runtime = new GmailAuthorizationRuntime(store);
  await expect(runtime.resolveCredential('grant')).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(native.authorize.mock.calls).toEqual([[account.id, false]]);
  expect(data.grant?.credential).toMatchObject({ rejected: true });
  await runtime.stop();
});

it('allows another silent attempt after a transient network failure', async () => {
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  native.authorize.mockRejectedValueOnce({ code: 'E_GMAIL_NETWORK' });
  const runtime = new GmailAuthorizationRuntime(store);
  await expect(runtime.resolveCredential('grant')).rejects.toMatchObject({ reason: 'network' });
  expect(data.grant?.credential).toEqual(credential);
  expect(await runtime.resolveCredential('grant')).toEqual(credential);
  expect(await runtime.describeConnection('grant')).toMatchObject({ status: 'connected' });
  await runtime.stop();
});

it('invalidates the rejected token and revokes the bound account through Google', async () => {
  const { data, store } = authorizationStoreFixture();
  data.grant = { id: 'grant', credential };
  const runtime = new GmailAuthorizationRuntime(store);
  await runtime.rejectCredential('grant', credential);
  expect(native.clearToken).toHaveBeenCalledWith('access');
  expect(data.grant?.credential).toMatchObject({ rejected: true });
  const revocation = await runtime.prepareRevocation('grant');
  await revocation.revoke(signal);
  expect(native.revoke).toHaveBeenCalledWith(account.id);
  await runtime.stop();
});
