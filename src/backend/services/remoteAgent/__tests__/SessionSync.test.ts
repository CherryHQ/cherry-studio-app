import {
  encodeAgentCheckpointPage,
  type AgentCheckpointPage,
  type AgentProjection,
} from '@cherrystudio/remote-protocol/agent';

import type { SessionProjectionStore } from '@/backend/data/services/RemoteSessionProjectionStore';
import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import { integrity, type AgentRequest } from '../remoteContent';
import { SessionSync } from '../SessionSync';

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
function fixture() {
  const state = projection();
  const page: AgentCheckpointPage = {
    checkpointId: 'checkpoint',
    pageIndex: 0,
    items: [{ kind: 'session', value: state.session }],
    nextCursor: null,
    pageDigest: '0'.repeat(64),
  };
  page.pageDigest = integrity.sha256(encodeAgentCheckpointPage(page));
  const bytes = encodeAgentCheckpointPage(page);
  return {
    page,
    descriptor: {
      checkpointId: 'checkpoint',
      cursor: state.cursor,
      historyRevision: '1',
      pageCount: 1,
      byteLength: String(bytes.length),
      sha256: integrity.sha256(bytes),
      expiresAt: '2026-09-22T00:10:00.000Z',
    },
  };
}
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
function setup(initial?: AgentProjection) {
  const { page, descriptor } = fixture();
  let stored = initial;
  let subscription = 0;
  let notify: (notification: DesktopNotification) => void = () => {};
  const order: string[] = [];
  const store: SessionProjectionStore = {
    read: jest.fn(async () => stored),
    write: jest.fn(async (_connectionId, _grantId, value) => {
      stored = value;
      order.push(`write:${value.cursor.seq}`);
    }),
  };
  const request = jest.fn(async (method: string, params: any) => {
    order.push(method);
    switch (method) {
      case 'agent.sessions.subscribe':
        return params.cursor
          ? {
              subscriptionId: `sub-${++subscription}`,
              mode: 'replay',
              fromCursor: params.cursor,
              highWatermark: params.cursor,
              leaseExpiresAt: descriptor.expiresAt,
            }
          : {
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
  const publish = jest.fn();
  const failed = jest.fn();
  const sync = new SessionSync(
    'pc',
    'grant',
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
    store,
    publish,
    failed,
  );
  return {
    sync,
    request,
    store,
    publish,
    failed,
    order,
    page,
    notify: (value: DesktopNotification) => notify(value),
    stored: () => stored,
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

it('installs the shared checkpoint fixture durably before activating, then writes events before ACK', async () => {
  const test = setup();
  await test.sync.start();
  expect(test.order.indexOf('write:0')).toBeLessThan(
    test.order.indexOf('agent.subscriptions.activate'),
  );
  test.notify(batch());
  await settle();
  expect(test.stored()?.cursor.seq).toBe('1');
  expect(test.order.indexOf('write:1')).toBeLessThan(test.order.indexOf('agent.subscriptions.ack'));
  expect(test.publish.mock.calls.at(-1)[0].messages.m).toMatchObject({ messageId: 'm' });
  expect(test.failed).not.toHaveBeenCalled();
  test.sync.stop();
  await test.sync.drain();
});

it('persists a failed execution before ACK and recovers it without a live message after restart and replay', async () => {
  const test = setup();
  await test.sync.start();
  const notification = {
    method: 'agent.events',
    params: {
      subscriptionId: 'sub-1',
      sessionId: 's',
      streamEpoch: 'epoch',
      events: [
        {
          seq: '1',
          kind: 'execution.updated',
          payload: {
            executionId: 'e',
            status: 'failed',
            messageId: 'm',
            durable: true,
            failure: executionFailure,
            history: { historyRevision: '1', messageRevision: '1' },
          },
        },
      ],
    },
  };
  test.notify(notification);
  await settle();
  expect(test.order.indexOf('write:1')).toBeLessThan(test.order.indexOf('agent.subscriptions.ack'));
  expect(test.stored()?.executions.e.failure).toEqual(executionFailure);
  expect(test.stored()?.messages).toEqual({});
  test.sync.stop();
  await test.sync.drain();
  const restarted = setup(JSON.parse(JSON.stringify(test.stored())));
  await restarted.sync.start();
  restarted.notify(notification);
  await settle();
  expect(restarted.stored()?.cursor.seq).toBe('1');
  expect(Object.values(restarted.stored()!.executions)).toHaveLength(1);
  expect(restarted.publish.mock.calls.at(-1)[0].executions.e).toMatchObject({
    status: 'failed',
    failure: executionFailure,
  });
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
    true,
  ]);
  release();
  await started;
  expect(test.failed).not.toHaveBeenCalled();
  expect(test.publish.mock.calls.at(-1)[0].messages.m).toMatchObject({
    status: 'error',
    failure: executionFailure,
  });
  test.sync.stop();
  await test.sync.drain();
});

it('resumes from the persisted cursor and ignores duplicate and retired-subscription events', async () => {
  const state = projection();
  state.cursor.seq = '1';
  const test = setup(state);
  await test.sync.start();
  expect(test.request).toHaveBeenCalledWith(
    'agent.sessions.subscribe',
    { sessionId: 's', cursor: state.cursor },
    expect.anything(),
  );
  test.notify(batch('1'));
  test.notify(batch('2', 'old-subscription'));
  await settle();
  expect(test.stored()?.cursor.seq).toBe('1');
  expect(test.stored()?.messages).toEqual({});
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
  expect(test.stored()?.cursor.seq).toBe('0');
  test.sync.stop();
  await test.sync.drain();
});

it('does not ACK a batch whose durable transaction failed', async () => {
  const test = setup(projection());
  await test.sync.start();
  jest.mocked(test.store.write).mockRejectedValueOnce(new Error('disk full'));
  test.notify(batch());
  await settle();
  expect(test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.ack')).toBe(
    false,
  );
  expect(test.stored()?.cursor.seq).toBe('0');
  expect(test.failed).toHaveBeenCalled();
  test.sync.stop();
  await test.sync.drain();
});

it('does not activate or persist a corrupted checkpoint', async () => {
  const test = setup();
  test.page.pageDigest = 'f'.repeat(64);
  await expect(test.sync.start()).rejects.toThrow('PROTOCOL_ERROR');
  expect(test.store.write).not.toHaveBeenCalled();
  expect(
    test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.activate'),
  ).toBe(false);
  test.sync.stop();
  await test.sync.drain();
});

it('suspension suppresses late persistence and ACK without cancelling desktop execution', async () => {
  const test = setup(projection());
  await test.sync.start();
  test.notify(batch());
  test.sync.stop();
  await test.sync.drain();
  expect(test.store.write).not.toHaveBeenCalled();
  expect(
    test.request.mock.calls.some(
      ([method]) => method === 'agent.executions.cancel' || method === 'agent.subscriptions.ack',
    ),
  ).toBe(false);
});
