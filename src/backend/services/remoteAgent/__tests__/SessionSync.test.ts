import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import type { AgentRequest } from '../remoteContent';
import { SessionSync } from '../SessionSync';
import { createCheckpointFixture } from './_checkpointFixture';

const projection = (): AgentProjection => ({
  cursor: { sessionId: 's', streamEpoch: 'epoch', seq: '0' },
  session: {
    sessionId: 's',
    agentId: 'a',
    workspaceId: 'w',
    title: 'Session',
    updatedAt: '2026-09-22T00:00:00.000Z',
    historyRevision: '1',
    idleRevision: '1',
  },
  messages: {},
  parts: {},
  executions: {},
  interactions: {},
  tombstones: [],
});
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const executionFailure = {
  message: 'Subscription required',
  retryable: false,
  failure: {
    version: 1 as const,
    reasonCode: 'permission' as const,
    source: { layer: 'provider' as const },
  },
};
function setup(state = projection()) {
  const { page, descriptor } = createCheckpointFixture(state);
  let subscription = 0;
  let notify: (notification: DesktopNotification) => void = () => {};
  const order: string[] = [];
  const request = jest.fn(async (method: string, params: any) => {
    order.push(method);
    switch (method) {
      case 'agent.sessions.subscribe':
        return {
          subscriptionId: `sub-${++subscription}`,
          mode: 'checkpoint',
          reason: 'initial',
          checkpoint: descriptor,
        };
      case 'agent.checkpoints.read':
        return page;
      case 'agent.subscriptions.activate':
        return { subscriptionId: params.subscriptionId, status: 'active' };
      case 'agent.subscriptions.ack':
        return { acknowledged: params.cursor };
      case 'agent.subscriptions.close':
        return { closed: true };
      case 'agent.interactions.list':
        return { items: [], nextCursor: null };
      default:
        throw new Error(method);
    }
  });
  const publish = jest.fn((value: AgentProjection, current: boolean) => {
    order.push(`publish:${value.cursor.seq}:${current}`);
  });
  const failed = jest.fn();
  const sync = new SessionSync(
    's',
    {
      request: request as AgentRequest,
      onNotification: (listener) => {
        notify = listener;
        return () => {
          notify = () => {};
        };
      },
    },
    publish,
    failed,
  );
  return {
    sync,
    request,
    publish,
    failed,
    order,
    page,
    notify: (value: DesktopNotification) => notify(value),
    descriptor,
  };
}
function batch(seq = '1', subscriptionId = 'sub-1', streamEpoch = 'epoch') {
  return {
    method: 'agent.events',
    params: {
      sessionId: 's',
      streamEpoch,
      subscriptionId,
      events: [
        {
          seq,
          kind: 'message.created',
          payload: {
            messageId: 'm',
            revision: '1',
            role: 'assistant',
            status: 'pending',
            partIds: [],
          },
        },
      ],
    },
  };
}

it('installs a desktop checkpoint before activating and applies events before ACK', async () => {
  const test = setup();
  await test.sync.start();
  expect(test.request).toHaveBeenCalledWith(
    'agent.sessions.subscribe',
    { sessionId: 's' },
    expect.anything(),
  );
  expect(test.order.indexOf('publish:0:false')).toBeLessThan(
    test.order.indexOf('agent.subscriptions.activate'),
  );
  expect(test.order.indexOf('agent.subscriptions.activate')).toBeLessThan(
    test.order.indexOf('publish:0:true'),
  );
  test.notify(batch());
  await settle();
  expect(test.sync.current?.cursor.seq).toBe('1');
  expect(test.order.indexOf('publish:1:true')).toBeLessThan(
    test.order.indexOf('agent.subscriptions.ack'),
  );
  expect(test.publish.mock.calls.at(-1)![0].messages.m).toMatchObject({ messageId: 'm' });
  expect(test.failed).not.toHaveBeenCalled();
  test.sync.stop();
  await test.sync.drain();
});

it('applies events arriving during activation after installing the checkpoint', async () => {
  const test = setup();
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.subscriptions.activate') test.notify(batch());
    return request(method, params);
  });
  await test.sync.start();
  await settle();
  expect(test.sync.current?.cursor.seq).toBe('1');
  expect(test.publish.mock.calls.at(-1)).toMatchObject([
    { messages: { m: { messageId: 'm' } } },
    true,
  ]);
  expect(test.request).toHaveBeenCalledWith(
    'agent.subscriptions.ack',
    { subscriptionId: 'sub-1', cursor: { sessionId: 's', streamEpoch: 'epoch', seq: '1' } },
    expect.anything(),
  );
  test.sync.stop();
  await test.sync.drain();
});

it('rebuilds after restart from the latest desktop checkpoint including terminal failures', async () => {
  const first = setup();
  await first.sync.start();
  first.notify(batch());
  await settle();
  expect(first.sync.current?.messages.m).toBeDefined();
  first.sync.stop();
  await first.sync.drain();

  // The desktop changed while the phone was away: its latest snapshot replaces all old state.
  const state = projection();
  state.cursor = { ...state.cursor, streamEpoch: 'new-epoch', seq: '8' };
  state.session.title = 'Changed on PC';
  state.executions.e = {
    executionId: 'e',
    status: 'failed',
    messageId: 'm',
    durable: true,
    failure: executionFailure,
    history: { historyRevision: '1', messageRevision: '1' },
  };
  const restarted = setup(state);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = restarted.request.getMockImplementation()!;
  restarted.request.mockImplementation(async (method, params) => {
    if (method === 'agent.checkpoints.read') await wait;
    return request(method, params);
  });
  const starting = restarted.sync.start();
  await settle();
  expect(restarted.publish).not.toHaveBeenCalled();
  release();
  await starting;
  expect(restarted.request).toHaveBeenCalledWith(
    'agent.sessions.subscribe',
    { sessionId: 's' },
    expect.anything(),
  );
  expect(restarted.sync.current).toMatchObject({
    cursor: state.cursor,
    session: { title: 'Changed on PC' },
    messages: {},
    executions: { e: { status: 'failed', failure: executionFailure } },
  });
  expect(restarted.publish.mock.calls.at(-1)![1]).toBe(true);
  restarted.sync.stop();
  await restarted.sync.drain();
});

it('publishes a failure before deferred text finishes and keeps it visible if that resource cannot be read', async () => {
  const state = projection();
  state.executions.e = {
    executionId: 'e',
    status: 'failed',
    messageId: 'm',
    durable: false,
    failure: executionFailure,
    persistenceFailure: executionFailure,
  };
  state.messages.m = {
    messageId: 'm',
    revision: '1',
    role: 'assistant',
    partIds: ['p'],
    status: 'error',
    failure: executionFailure,
  };
  state.parts.p = {
    partId: 'p',
    revision: '1',
    kind: 'text',
    state: 'completed',
    content: {
      ref: {
        contentId: 'p',
        revision: '1',
        byteLength: '3',
        mediaType: 'text/plain',
        sha256: 'a'.repeat(64),
      },
    },
  };
  const test = setup(state);
  const original = test.request.getMockImplementation()!;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.content.read') {
      await wait;
      throw new Error('Resource expired');
    }
    return original(method, params);
  });
  const started = test.sync.start();
  await settle();
  expect(test.publish.mock.calls.at(-1)).toMatchObject([
    { executions: { e: { failure: executionFailure } } },
    false,
  ]);
  release();
  await started;
  expect(test.failed).not.toHaveBeenCalled();
  expect(test.publish.mock.calls.at(-1)![0].messages.m).toMatchObject({
    status: 'error',
    failure: executionFailure,
  });
  test.sync.stop();
  await test.sync.drain();
});

it('uses the desktop checkpoint cursor and ignores duplicate and retired-subscription events', async () => {
  const state = projection();
  state.cursor.seq = '1';
  const test = setup(state);
  await test.sync.start();
  expect(test.request).toHaveBeenCalledWith(
    'agent.sessions.subscribe',
    { sessionId: 's' },
    expect.anything(),
  );
  test.notify(batch('1'));
  test.notify(batch('2', 'old-subscription'));
  await settle();
  expect(test.sync.current?.cursor.seq).toBe('1');
  expect(test.sync.current?.messages).toEqual({});
  test.sync.stop();
  await test.sync.drain();
});

it.each(['gap', 'epoch', 'reset'])('re-prepares without a cursor after %s', async (reason) => {
  const test = setup(projection());
  await test.sync.start();
  test.notify(
    reason === 'reset'
      ? {
          method: 'agent.subscriptions.resetRequired',
          params: { subscriptionId: 'sub-1', reason: 'RESET_REQUIRED' },
        }
      : batch(reason === 'gap' ? '3' : '1', 'sub-1', reason === 'epoch' ? 'another' : 'epoch'),
  );
  await settle();
  expect(
    test.request.mock.calls.findLast(([method]) => method === 'agent.sessions.subscribe')?.[1],
  ).toEqual({ sessionId: 's' });
  expect(test.request).toHaveBeenCalledWith(
    'agent.subscriptions.close',
    { subscriptionId: 'sub-1' },
    expect.anything(),
  );
  expect(test.sync.current?.cursor.seq).toBe('0');
  test.sync.stop();
  await test.sync.drain();
});

it('rejects replay without a local baseline instead of granting current actions', async () => {
  const test = setup();
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.sessions.subscribe')
      return {
        subscriptionId: 'sub-1',
        mode: 'replay',
        fromCursor: projection().cursor,
        highWatermark: projection().cursor,
        leaseExpiresAt: test.descriptor.expiresAt,
      } as never;
    return request(method, params);
  });
  await expect(test.sync.start()).rejects.toThrow('PROTOCOL_ERROR');
  expect(test.publish).not.toHaveBeenCalled();
  expect(
    test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.activate'),
  ).toBe(false);
  test.sync.stop();
  await test.sync.drain();
});

it('does not activate or install a corrupted checkpoint', async () => {
  const test = setup();
  test.page.pageDigest = 'f'.repeat(64);
  await expect(test.sync.start()).rejects.toThrow('PROTOCOL_ERROR');
  expect(test.sync.current).toBeUndefined();
  expect(
    test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.activate'),
  ).toBe(false);
  test.sync.stop();
  await test.sync.drain();
});

it('suspension suppresses late events and ACK without cancelling desktop execution', async () => {
  const test = setup(projection());
  await test.sync.start();
  test.notify(batch());
  test.sync.stop();
  await test.sync.drain();
  expect(test.sync.current?.cursor.seq).toBe('0');
  expect(
    test.request.mock.calls.some(
      ([method]) => method === 'agent.executions.cancel' || method === 'agent.subscriptions.ack',
    ),
  ).toBe(false);
});

it('does not install or activate a checkpoint that finishes after suspension', async () => {
  const test = setup();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.checkpoints.read') await wait;
    return request(method, params);
  });
  const started = test.sync.start();
  await settle();
  test.sync.stop();
  release();
  await expect(started).rejects.toMatchObject({ name: 'AbortError' });
  await test.sync.drain();
  expect(test.sync.current).toBeUndefined();
  expect(test.publish).not.toHaveBeenCalled();
  expect(
    test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.activate'),
  ).toBe(false);
});
