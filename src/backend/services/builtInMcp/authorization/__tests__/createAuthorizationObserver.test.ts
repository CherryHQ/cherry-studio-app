import {
  PluginError,
  type PluginAuthorizationObservation,
  type PluginAuthorizationState,
} from '@/shared/contracts/plugins';

import { createAuthorizationObserver } from '../createAuthorizationObserver';

const connection = {
  pluginId: 'feishu',
  serverId: 'server-1',
  accountLabel: 'Cherry',
  connectedAt: '2026-09-10T00:00:00.000Z',
};
const waiting = (nextPollAt: number): PluginAuthorizationState => ({
  status: 'waiting',
  attemptId: 'attempt-1',
  stage: 'user',
  verificationUrl: 'https://accounts.feishu.cn/confirm',
  userCode: 'code',
  expiresAt: 600_000,
  nextPollAt,
});
/** Fake timers own setImmediate too; advancing by zero drains microtasks and due timers. */
const flush = () => jest.advanceTimersByTimeAsync(0);

let state: PluginAuthorizationState;
const flow = {
  getState: jest.fn<Promise<PluginAuthorizationState>, []>(),
  poll: jest.fn<Promise<PluginAuthorizationState>, [string]>(),
  complete: jest.fn<Promise<typeof connection>, [string]>(),
};
let observers: ReturnType<typeof createAuthorizationObserver>[] = [];
function observe() {
  const observer = createAuthorizationObserver(flow);
  observers.push(observer);
  const seen: PluginAuthorizationObservation[] = [];
  const detach = observer.observe((observation) => seen.push(observation));
  return { observer, seen, detach };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  jest.resetAllMocks();
  state = { status: 'idle' };
  flow.getState.mockImplementation(async () => state);
  flow.poll.mockImplementation(async () => state);
  flow.complete.mockResolvedValue(connection);
});
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.stop());
  jest.useRealTimers();
});

it('polls at the server interval only while observed and stops scheduling on detach', async () => {
  state = waiting(6000);
  flow.poll.mockImplementation(async () => {
    state = waiting(Date.now() + 5000);
    return state;
  });
  const { seen, detach } = observe();
  await flush();
  expect(flow.getState).toHaveBeenCalledTimes(1);
  expect(flow.poll).not.toHaveBeenCalled();
  expect(seen.at(-1)).toEqual({ state: waiting(6000), busy: false, error: undefined });
  await jest.advanceTimersByTimeAsync(5000);
  expect(flow.poll).toHaveBeenCalledWith('attempt-1');
  detach();
  await jest.advanceTimersByTimeAsync(60_000);
  expect(flow.poll).toHaveBeenCalledTimes(1);
});

it('completes an approved attempt once and reports the connection', async () => {
  state = { status: 'ready', attemptId: 'attempt-1' };
  flow.complete.mockImplementation(async () => {
    state = { status: 'application-ready', applicationId: 'cli_cherry' };
    return connection;
  });
  const { observer, seen } = observe();
  observer.check();
  observer.check();
  await flush();
  expect(flow.complete).toHaveBeenCalledTimes(1);
  expect(seen.at(-1)).toEqual({
    state: { status: 'application-ready', applicationId: 'cli_cherry' },
    busy: false,
    error: undefined,
    connection,
  });
});

it('does not repeat a failed completion until a new attempt is authorized', async () => {
  state = { status: 'ready', attemptId: 'attempt-1' };
  flow.complete.mockRejectedValueOnce(new PluginError('storage', 'safe'));
  const { observer, seen } = observe();
  await flush();
  expect(seen.at(-1)).toMatchObject({ busy: false, error: 'storage' });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(flow.complete).toHaveBeenCalledTimes(1);
  observer.check();
  await flush();
  expect(flow.complete).toHaveBeenCalledTimes(1);
  state = { status: 'ready', attemptId: 'attempt-2' };
  flow.complete.mockResolvedValueOnce(connection);
  observer.check();
  await flush();
  expect(flow.complete).toHaveBeenCalledTimes(2);
  expect(seen.at(-1)).toMatchObject({ error: undefined, connection });
});

it('drops session progress when the last observer detaches so a later visit starts clean', async () => {
  state = { status: 'ready', attemptId: 'attempt-1' };
  const { observer, detach } = observe();
  await flush();
  detach();
  const seen: PluginAuthorizationObservation[] = [];
  observer.observe((observation) => seen.push(observation));
  expect(seen[0]).toEqual({ state: { status: 'ready', attemptId: 'attempt-1' }, busy: false });
  expect(seen[0]).not.toHaveProperty('connection');
});

it('does not complete a detached method when its browser return requests a late check', async () => {
  state = { status: 'ready', attemptId: 'attempt-1' };
  const { observer, detach } = observe();
  detach();
  await flush();
  observer.check();
  await flush();
  expect(flow.complete).not.toHaveBeenCalled();
  const seen: PluginAuthorizationObservation[] = [];
  observer.observe((observation) => seen.push(observation));
  await flush();
  expect(flow.complete).toHaveBeenCalledTimes(1);
  expect(seen.at(-1)).toMatchObject({ connection });
});

it('waits for callback expiry without polling and never commits the review state', async () => {
  state = {
    status: 'callback',
    attemptId: 'callback-1',
    stage: 'user',
    authorizationUrl: 'https://example.com/authorize',
    redirectUrl: 'cherrystudio://plugins/future/callback',
    expiresAt: 600_000,
  };
  const { observer } = observe();
  await flush();
  await jest.advanceTimersByTimeAsync(60_000);
  expect(flow.poll).not.toHaveBeenCalled();
  expect(flow.complete).not.toHaveBeenCalled();
  state = {
    status: 'review',
    attemptId: 'callback-1',
    accountLabel: 'Cherry',
    requiresDisconnect: false,
  };
  observer.check();
  await flush();
  expect(flow.complete).not.toHaveBeenCalled();
  state = { status: 'ready', attemptId: 'callback-1' };
  observer.check();
  await flush();
  expect(flow.complete).toHaveBeenCalledTimes(1);
});
