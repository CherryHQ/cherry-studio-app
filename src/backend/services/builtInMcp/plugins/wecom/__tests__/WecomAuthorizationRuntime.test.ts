import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { WecomAuthorizationRuntime } from '../WecomAuthorizationRuntime';
import { wecomBotApi } from '../wecomBotApi';

jest.mock('../wecomBotApi', () => ({
  ...jest.requireActual('../wecomBotApi'),
  wecomBotApi: { begin: jest.fn(), poll: jest.fn(), exchange: jest.fn() },
}));

const bot = { botId: 'bot-1', secret: 'private-secret' };
const credential = { version: 2 as const, ...bot, token: 'private-token' };
const challenge = {
  sessionCode: 'private-session',
  verificationUrl: 'https://work.weixin.qq.com/ai/qc/c?s=confirmation',
  expiresAt: 301000,
  nextPollAt: 4000,
};
let fixture: ReturnType<typeof authorizationStoreFixture>;
let runtime: WecomAuthorizationRuntime;
let now: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fixture = authorizationStoreFixture();
  runtime = new WecomAuthorizationRuntime(fixture.store);
  now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  jest.mocked(wecomBotApi.begin).mockResolvedValue(challenge);
  jest.mocked(wecomBotApi.poll).mockResolvedValue(bot);
  jest.mocked(wecomBotApi.exchange).mockResolvedValue(credential);
});
afterEach(async () => {
  await runtime.stop();
  jest.restoreAllMocks();
});

it('keeps the polling secret off the screen and saves only an approved, exchanged grant', async () => {
  const state = await runtime.begin();
  expect(state).toMatchObject({
    status: 'waiting',
    verificationAction: 'copy',
    verificationUrl: challenge.verificationUrl,
  });
  expect(JSON.stringify(state)).not.toMatch(/private-session|private-secret|private-token/);
  expect(fixture.data.grant).toBeUndefined();
  if (state.status !== 'waiting') throw new Error('Expected waiting');
  // Re-entering the page before the deadline resumes the same attempt.
  expect(await runtime.begin()).toEqual(state);
  now.mockReturnValue(4000);
  expect(await runtime.poll(state.attemptId)).toEqual({
    status: 'ready',
    attemptId: state.attemptId,
  });
  const prepared = await runtime.prepare(state.attemptId, runtime.attemptSignal);
  expect(fixture.data.grant).toBeUndefined();
  await runtime.commit(state.attemptId, prepared.accountLabel, prepared.signal);
  expect(fixture.data.grant?.credential).toEqual(credential);
  expect(fixture.store.commit).toHaveBeenCalledWith(
    credential,
    'WeCom bot bot-1',
    prepared.signal,
    { authorizationId: undefined },
  );
  expect(await runtime.getState()).toEqual({ status: 'idle' });
});

it('does not replace an existing connection or poll an expired attempt', async () => {
  fixture.data.grant = { id: 'existing', credential };
  await expect(runtime.begin()).rejects.toMatchObject({ reason: 'requires-disconnect' });
  expect(wecomBotApi.begin).not.toHaveBeenCalled();
  fixture.data.grant = undefined;
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected waiting');
  now.mockReturnValue(challenge.expiresAt);
  expect(await runtime.poll(state.attemptId)).toEqual({
    status: 'expired',
    attemptId: state.attemptId,
  });
  expect(wecomBotApi.poll).not.toHaveBeenCalled();
});

it('deduplicates renewal of a rejected token and preserves the bot identity', async () => {
  fixture.data.grant = { id: 'grant', credential };
  jest.mocked(wecomBotApi.exchange).mockResolvedValue({ ...credential, token: 'renewed' });
  await Promise.all([
    runtime.rejectCredential('grant', credential),
    runtime.rejectCredential('grant', credential),
  ]);
  expect(wecomBotApi.exchange).toHaveBeenCalledTimes(1);
  expect(await runtime.resolveCredential('grant')).toEqual({ ...credential, token: 'renewed' });
});

it('discards a late approval after cancellation', async () => {
  const state = await runtime.begin();
  if (state.status !== 'waiting') throw new Error('Expected waiting');
  let resolvePoll!: (value: typeof bot) => void;
  let started!: () => void;
  const polling = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest.mocked(wecomBotApi.poll).mockImplementation(() => {
    started();
    return new Promise((resolve) => {
      resolvePoll = resolve;
    });
  });
  now.mockReturnValue(4000);
  const result = runtime.poll(state.attemptId).catch(() => undefined);
  await polling;
  const cancelling = runtime.cancel();
  resolvePoll(bot);
  await result;
  expect(await cancelling).toEqual({ status: 'idle' });
  expect(fixture.data.grant).toBeUndefined();
  expect(wecomBotApi.exchange).not.toHaveBeenCalled();
});
