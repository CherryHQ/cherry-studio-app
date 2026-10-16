import type { AssistantProjection } from '@cherrystudio/remote-protocol/assistant';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopDomainLease, DesktopLeaseState } from '@/backend/services/desktopConnections';
import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';
import { RemoteFailureError } from '@/backend/services/desktopConnections/remoteErrors';
import {
  RemoteConversationError,
  type RemoteUploadFiles,
} from '@/backend/services/remoteConversation';
import type { RemoteSessionSnapshot } from '@/shared/contracts/remoteAgent';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAssistantScope } from '../RemoteAssistantScope';
import { checkpoint, projection } from './_checkpointFixture';

jest.mock('expo-file-system', () => ({
  File: class {
    size = 3;
    exists = true;
    open() {
      return { offset: 0, readBytes: () => new Uint8Array([1, 2, 3]), close() {} };
    }
  },
}));

const revision = 'a'.repeat(64);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const scopes: RemoteAssistantScope[] = [];
afterEach(async () => {
  for (const scope of scopes.splice(0)) {
    scope.dispose();
    await scope.drain();
  }
});
function setup(
  state: AssistantProjection = projection(),
  handlers: Record<string, (params: Record<string, unknown>) => unknown> = {},
  files?: RemoteUploadFiles,
) {
  let connectionState: DesktopLeaseState = { status: 'ready' };
  const states = new Set<() => void>();
  const notifications = new Set<(event: DesktopNotification) => void>();
  const data = new Map<string, string>();
  let subscription = 0;
  const request = jest.fn(async (method, params) => {
    if (handlers[method]) return handlers[method](params);
    switch (method) {
      case 'assistant.assistants.list':
        return {
          items: [
            {
              assistantId: 'assistant',
              name: 'Assistant',
              available: true,
              configurationRevision: revision,
              model: { modelId: 'm', providerId: 'p', name: 'Model' },
            },
          ],
          nextCursor: null,
        };
      case 'assistant.topics.subscribe':
        return {
          subscriptionId: `sub-${++subscription}`,
          mode: 'checkpoint',
          checkpoint: checkpoint(state).descriptor,
        };
      case 'assistant.checkpoints.read':
        return checkpoint(state).page;
      case 'assistant.subscriptions.activate':
        return { subscriptionId: params.subscriptionId, status: 'active' };
      case 'assistant.subscriptions.close':
        return { closed: true };
      case 'assistant.subscriptions.ack':
        return { acknowledged: params.cursor };
      case 'assistant.interactions.list':
        return { items: Object.values(state.interactions), nextCursor: null };
      case 'assistant.messages.send':
        return {
          commandId: params.commandId,
          method,
          status: 'rejected',
          topicId: 'topic',
          admittedAt: '2026-10-14T00:00:00Z',
          error: { reason: 'CONFLICT', message: 'Desktop branch changed' },
        };
      case 'assistant.interactions.respond':
      case 'assistant.executions.cancel':
        return {
          commandId: params.commandId,
          method,
          status: 'applied',
          topicId: 'topic',
          admittedAt: '2026-10-14T00:00:00Z',
        };
      default:
        throw new Error(method);
    }
  });
  const session = {
    uploadsVersion: undefined as number | undefined,
    sendUploadChunk: jest.fn(),
    request,
    onNotification: (listener: (event: DesktopNotification) => void) => {
      notifications.add(listener);
      return () => {
        notifications.delete(listener);
      };
    },
  };
  const lease = {
    connectionId: 'pc',
    grantId: 'grant',
    scope: 'assistant-grant',
    signal: new AbortController().signal,
    getSnapshot: () => connectionState,
    subscribe: (listener: () => void) => {
      states.add(listener);
      return () => {
        states.delete(listener);
      };
    },
    ready: async () => session,
    setBackgroundRequired: jest.fn(),
    release: jest.fn(),
  } as unknown as DesktopDomainLease;
  const reply = { updateContent: jest.fn(), finish: jest.fn(), retire: jest.fn() };
  const background = {
    replies: { startTurn: jest.fn(() => reply) },
    keepAlive: { acquire: jest.fn(() => ({ release: jest.fn() })) },
    translate: (key: string) => key,
  };
  const scope = new RemoteAssistantScope(
    lease,
    { retain: jest.fn(), revoke: jest.fn(), subscribeInvalidation: () => () => {} },
    new RemoteAgentCommandJournal({
      getString: (key) => data.get(key),
      set: (key, value) => {
        data.set(key, value as string);
      },
      getAllKeys: () => [...data.keys()],
      remove: (key) => data.delete(key),
    }),
    background as never,
    files,
  );
  scopes.push(scope);
  let latest: RemoteSessionSnapshot | undefined;
  const release = scope.observe('topic', (snapshot) => {
    latest = snapshot;
  });
  return {
    scope,
    session,
    request,
    lease,
    reply,
    background,
    release,
    latest: () => latest!,
    changeConnection: (next: DesktopLeaseState) => {
      connectionState = next;
      for (const listener of states) listener();
    },
    notify: (events: unknown[]) => {
      for (const listener of notifications)
        listener({
          method: 'assistant.events',
          params: {
            subscriptionId: `sub-${subscription}`,
            topicId: 'topic',
            streamEpoch: 'epoch',
            events,
          },
        } as DesktopNotification);
    },
  };
}

it('pins sends to the observed branch, retains rejected text, and withdraws stale actions during reconnect', async () => {
  const test = setup();
  await settle();
  const target = test.latest().sendTarget!;
  expect(target).toBeDefined();
  await expect(test.scope.send(target, 'Keep this text')).resolves.toMatchObject({
    status: 'rejected',
    text: 'Keep this text',
    error: 'CONFLICT',
  });
  const sent = test.request.mock.calls.find(([method]) => method === 'assistant.messages.send')![1];
  expect(sent).toMatchObject({
    topicId: 'topic',
    assistantId: 'assistant',
    expectedAssistantRevision: revision,
    expectedHistoryRevision: '0',
    parentAnchorId: null,
    text: 'Keep this text',
  });
  expect(sent).not.toHaveProperty('workspaceId');
  await settle();
  test.changeConnection({ status: 'offline' });
  expect(test.latest()).toMatchObject({ current: false, sendTarget: undefined });
  await expect(test.scope.send(target, 'Do not submit')).rejects.toThrow('CONFLICT');
  expect(
    test.request.mock.calls.filter(([method]) => method === 'assistant.messages.send'),
  ).toHaveLength(1);
  expect(test.scope.getCommands()[0].text).toBe('Keep this text');
});

it('exposes ordinary approval but leaves desktop-only interactions on the desktop', async () => {
  const state = projection();
  const interaction = {
    interactionId: 'approval',
    revision: '1',
    executionId: 'execution',
    toolCallId: 'tool',
    status: 'pending' as const,
    summary: 'Allow tool',
    inputDigest: 'b'.repeat(64),
    input: { text: '{}' },
    messageId: 'answer',
    configurationRevision: revision,
    respondable: true,
    desktopRequired: false,
  };
  state.interactions = {
    approval: interaction,
    oauth: { ...interaction, interactionId: 'oauth', desktopRequired: true, respondable: false },
  };
  const test = setup(state);
  await settle();
  const [approval, oauth] = test.latest().interactions;
  expect(approval.respondTarget).toBeDefined();
  expect(oauth.desktopRequired).toBe(true);
  expect(oauth.respondTarget).toBeUndefined();
  await test.scope.respond(approval.respondTarget!, { kind: 'approve' });
  expect(
    test.request.mock.calls.find(([method]) => method === 'assistant.interactions.respond')![1],
  ).toMatchObject({
    topicId: 'topic',
    interactionId: 'approval',
    messageId: 'answer',
    expectedRevision: '1',
    expectedExecutionId: 'execution',
    expectedAssistantRevision: revision,
    inputDigest: 'b'.repeat(64),
    decision: 'approve',
  });
});

it('normalizes chronological Assistant pages to newest-first conversation history without changing cursors', async () => {
  const test = setup(projection(), {
    'assistant.messages.list': ({ cursor }) => ({
      items: (cursor ? ['user-1', 'answer-1'] : ['user-2', 'answer-2']).map((id) => ({
        messageId: id,
        parentId: null,
        revision: '0',
        role: id.startsWith('user') ? 'user' : 'assistant',
        status: 'success',
        partIds: [],
        partCount: 0,
      })),
      nextCursor: cursor ? null : 'older',
    }),
    'assistant.parts.list': () => ({ items: [], nextCursor: null }),
  });
  await settle();
  const signal = new AbortController().signal;
  const version = test.latest().session.historyVersion;
  const latest = await test.scope.history('topic', version, undefined, signal);
  expect(latest.items.map((item) => item.id)).toEqual(['answer-2', 'user-2']);
  expect(latest.next).toBe('older');
  const older = await test.scope.history('topic', version, latest.next, signal);
  expect(older.items.map((item) => item.id)).toEqual(['answer-1', 'user-1']);
  expect(older.next).toBeUndefined();
});

it('drains an in-flight subscription before opening its replacement on the same connection', async () => {
  let deliver!: (value: unknown) => void;
  let subscribed = 0;
  const state = projection();
  const test = setup(state, {
    'assistant.topics.subscribe': () =>
      ++subscribed === 1
        ? new Promise((resolve) => {
            deliver = resolve;
          })
        : {
            subscriptionId: 'replacement',
            mode: 'checkpoint',
            checkpoint: checkpoint(state).descriptor,
          },
  });
  await settle();
  test.changeConnection({ status: 'offline' });
  test.changeConnection({ status: 'ready' });
  await settle();
  const beforeDelivery = test.request.mock.calls.filter(
    ([method]) => method === 'assistant.topics.subscribe',
  ).length;
  deliver({ subscriptionId: 'late', mode: 'checkpoint', checkpoint: checkpoint(state).descriptor });
  await settle();
  expect(beforeDelivery).toBe(1);
  const calls = test.request.mock.calls;
  const closed = calls.findIndex(
    ([method, params]) =>
      method === 'assistant.subscriptions.close' && params.subscriptionId === 'late',
  );
  const reopened = calls.findLastIndex(([method]) => method === 'assistant.topics.subscribe');
  expect(closed).toBeGreaterThan(-1);
  expect(reopened).toBeGreaterThan(closed);
  expect(test.latest().current).toBe(true);
  test.scope.dispose();
  await test.scope.drain();
  expect(test.request).toHaveBeenCalledWith(
    'assistant.subscriptions.close',
    { subscriptionId: 'replacement' },
    undefined,
  );
});

it('waits for an abandoned route subscription before reopening the same topic', async () => {
  let deliver!: (value: unknown) => void;
  let subscribed = 0;
  const state = projection();
  const test = setup(state, {
    'assistant.topics.subscribe': () =>
      ++subscribed === 1
        ? new Promise((resolve) => {
            deliver = resolve;
          })
        : {
            subscriptionId: 'reopened',
            mode: 'checkpoint',
            checkpoint: checkpoint(state).descriptor,
          },
  });
  await settle();
  test.release();
  const listener = jest.fn();
  const release = test.scope.observe('topic', listener);
  await settle();
  const beforeDelivery = subscribed;
  deliver({
    subscriptionId: 'abandoned',
    mode: 'checkpoint',
    checkpoint: checkpoint(state).descriptor,
  });
  await settle();
  expect(beforeDelivery).toBe(1);
  const calls = test.request.mock.calls;
  expect(
    calls.findIndex(
      ([method, params]) =>
        method === 'assistant.subscriptions.close' && params.subscriptionId === 'abandoned',
    ),
  ).toBeLessThan(calls.findLastIndex(([method]) => method === 'assistant.topics.subscribe'));
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ current: true }));
  release();
});

it('keeps active execution after the route leaves, then retires mobile protection on grant revocation without cancelling PC work', async () => {
  const state = projection();
  state.topic.activeExecutionIds = ['execution'];
  state.executions.execution = {
    executionId: 'execution',
    messageId: 'answer',
    status: 'running',
    durable: false,
  };
  const test = setup(state);
  await settle();
  expect(test.background.replies.startTurn).toHaveBeenCalledWith(
    expect.objectContaining({ domain: 'assistant', connectionId: 'pc', sessionId: 'topic' }),
  );
  test.release();
  expect(test.scope.hasPendingExecution()).toBe(true);
  expect(test.reply.retire).not.toHaveBeenCalled();
  test.changeConnection({ status: 'retired', reason: 'not-authorized' });
  expect(test.scope.hasPendingExecution()).toBe(false);
  expect(test.reply.retire).toHaveBeenCalledTimes(1);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  expect(test.request.mock.calls.some(([method]) => method === 'assistant.executions.cancel')).toBe(
    false,
  );
});

it('preserves unchanged message views during streaming and invalidates resources when the pinned history view changes', async () => {
  const state = projection();
  for (const id of ['settled', 'streaming']) {
    state.messages[id] = {
      messageId: id,
      parentId: null,
      revision: '1',
      role: 'assistant',
      status: 'pending',
      partIds: [id],
    };
    state.parts[id] = {
      partId: id,
      revision: '1',
      kind: 'text',
      state: 'streaming',
      content: { text: 'A' },
    };
  }
  const test = setup(state);
  await settle();
  const initial = test.latest().messages;
  test.notify([
    {
      kind: 'part.updated',
      seq: '1',
      messageId: 'streaming',
      afterPartId: null,
      part: { ...state.parts.streaming, revision: '2', content: { text: 'AB' } },
    },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(test.latest().messages[0]).toBe(initial[0]);
  expect(test.latest().messages[1]).not.toBe(initial[1]);
  test.notify([
    {
      kind: 'topic.updated',
      seq: '2',
      topic: { ...state.topic, historyRevision: '1', parentAnchorId: 'streaming' },
    },
  ]);
  await settle();
  expect(test.latest().messages[0]).not.toBe(initial[0]);
});

it('offers one topic-wide stop and finishes background protection only after every observed execution ends', async () => {
  const state = projection();
  state.topic.activeExecutionIds = ['first', 'second'];
  for (const id of state.topic.activeExecutionIds)
    state.executions[id] = { executionId: id, messageId: id, status: 'running', durable: false };
  const test = setup(state);
  await settle();
  const targets = test.latest().executions.flatMap((execution) => execution.cancelTarget ?? []);
  expect(targets).toHaveLength(1);
  expect(JSON.parse(targets[0]).params.expectedExecutionIds).toEqual(['first', 'second']);
  const completed = (id: string) => ({
    executionId: id,
    messageId: id,
    status: 'completed',
    durable: true,
    history: { historyRevision: '1', messageRevision: '1' },
  });
  test.notify([
    { kind: 'execution.updated', seq: '1', execution: completed('first') },
    {
      kind: 'topic.updated',
      seq: '2',
      topic: { ...state.topic, historyRevision: '1', activeExecutionIds: ['second'] },
    },
  ]);
  await settle();
  expect(test.reply.finish).not.toHaveBeenCalled();
  expect(test.background.replies.startTurn).toHaveBeenCalledTimes(1);
  test.notify([
    { kind: 'execution.updated', seq: '3', execution: completed('second') },
    {
      kind: 'topic.updated',
      seq: '4',
      topic: { ...state.topic, historyRevision: '1', activeExecutionIds: [] },
    },
  ]);
  await settle();
  expect(test.reply.finish).toHaveBeenCalledTimes(1);
  expect(test.reply.finish).toHaveBeenCalledWith('completed');
});

it('keeps observing finalization after leaving the route and reports a later persistence failure', async () => {
  const state = projection();
  state.topic.activeExecutionIds = ['execution'];
  state.executions.execution = {
    executionId: 'execution',
    messageId: 'answer',
    status: 'running',
    durable: false,
  };
  const test = setup(state);
  await settle();
  test.release();
  test.notify([
    {
      kind: 'execution.updated',
      seq: '1',
      execution: { ...state.executions.execution, status: 'finalizing' },
    },
    { kind: 'topic.updated', seq: '2', topic: { ...state.topic, activeExecutionIds: [] } },
  ]);
  await settle();
  expect(test.scope.hasPendingExecution()).toBe(true);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(true);
  expect(test.reply.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({ detail: 'remoteAgent.finalizing' }),
  );
  expect(test.reply.finish).not.toHaveBeenCalled();
  expect(
    test.request.mock.calls.some(([method]) => method === 'assistant.subscriptions.close'),
  ).toBe(false);
  test.notify([
    {
      kind: 'execution.updated',
      seq: '3',
      execution: {
        ...state.executions.execution,
        status: 'completed',
        persistenceFailure: {
          message: 'Could not save the reply',
          retryable: false,
          failure: { version: 1, reasonCode: 'internal', source: { layer: 'host' } },
        },
      },
    },
  ]);
  await settle();
  expect(test.reply.finish).toHaveBeenCalledTimes(1);
  expect(test.reply.finish).toHaveBeenCalledWith('failed');
  expect(test.scope.hasPendingExecution()).toBe(false);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  expect(test.request).toHaveBeenCalledWith(
    'assistant.subscriptions.close',
    { subscriptionId: 'sub-1' },
    undefined,
  );
});

it('keeps a background reply waiting for desktop approval and follows its continuation', async () => {
  const state = projection();
  state.topic.activeExecutionIds = ['execution'];
  state.executions.execution = {
    executionId: 'execution',
    messageId: 'answer',
    status: 'running',
    durable: false,
  };
  const test = setup(state);
  await settle();
  test.release();
  test.notify([
    {
      kind: 'execution.updated',
      seq: '1',
      execution: { ...state.executions.execution, status: 'finalizing' },
    },
    { kind: 'topic.updated', seq: '2', topic: { ...state.topic, activeExecutionIds: [] } },
  ]);
  await settle();
  state.interactions.approval = {
    interactionId: 'approval',
    revision: '1',
    executionId: 'approval:answer:1',
    messageId: 'answer',
    toolCallId: 'tool',
    status: 'pending',
    summary: 'Allow tool',
    inputDigest: 'b'.repeat(64),
    input: { text: '{}' },
    configurationRevision: revision,
    respondable: true,
    desktopRequired: false,
  };
  test.notify([
    {
      kind: 'execution.updated',
      seq: '3',
      execution: {
        ...state.executions.execution,
        status: 'completed',
        durable: true,
        history: { historyRevision: '1', messageRevision: '1' },
      },
    },
  ]);
  await settle();
  expect(test.scope.hasPendingExecution()).toBe(true);
  expect(test.reply.finish).not.toHaveBeenCalled();
  test.notify([
    { kind: 'interaction.updated', seq: '4', interaction: state.interactions.approval },
    {
      kind: 'topic.updated',
      seq: '5',
      topic: { ...state.topic, historyRevision: '1', activeExecutionIds: [] },
    },
  ]);
  await settle();
  expect(test.scope.hasPendingExecution()).toBe(true);
  expect(test.reply.finish).not.toHaveBeenCalled();
  expect(test.reply.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: 'awaiting-approval' }),
  );
  state.interactions.approval = {
    ...state.interactions.approval,
    status: 'approved',
    revision: '2',
  };
  test.notify([
    { kind: 'interaction.updated', seq: '6', interaction: state.interactions.approval },
    {
      kind: 'execution.updated',
      seq: '7',
      execution: {
        executionId: 'continuation',
        messageId: 'continued',
        status: 'running',
        durable: false,
      },
    },
    {
      kind: 'topic.updated',
      seq: '8',
      topic: { ...state.topic, historyRevision: '2', activeExecutionIds: ['continuation'] },
    },
  ]);
  await settle();
  expect(test.background.replies.startTurn).toHaveBeenCalledTimes(1);
  expect(test.reply.finish).not.toHaveBeenCalled();
  test.notify([
    {
      kind: 'execution.updated',
      seq: '9',
      execution: {
        executionId: 'continuation',
        messageId: 'continued',
        status: 'completed',
        durable: true,
        history: { historyRevision: '3', messageRevision: '3' },
      },
    },
    {
      kind: 'topic.updated',
      seq: '10',
      topic: { ...state.topic, historyRevision: '3', activeExecutionIds: [] },
    },
  ]);
  await settle();
  expect(test.scope.hasPendingExecution()).toBe(false);
  expect(test.reply.finish).toHaveBeenCalledTimes(1);
  expect(test.reply.finish).toHaveBeenCalledWith('completed');
});

it('retires an unconfirmed background reply when a new desktop checkpoint no longer contains its execution', async () => {
  const state = projection();
  state.topic.activeExecutionIds = ['execution'];
  state.executions.execution = {
    executionId: 'execution',
    messageId: 'answer',
    status: 'running',
    durable: false,
  };
  const test = setup(state);
  await settle();
  test.release();
  test.changeConnection({ status: 'offline' });
  state.cursor.streamEpoch = 'restarted';
  state.topic.activeExecutionIds = [];
  state.executions = {};
  test.changeConnection({ status: 'ready' });
  await settle();
  expect(test.reply.retire).toHaveBeenCalledTimes(1);
  expect(test.reply.finish).not.toHaveBeenCalled();
  expect(test.scope.hasPendingExecution()).toBe(false);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
});

it.each([
  ['NOT_FOUND', false],
  ['RATE_LIMITED', true],
  ['REVISION_EXPIRED', true],
] as const)(
  'handles %s after reconnect without retaining permanently missing topics',
  async (reason, retries) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const state = projection();
    state.topic.activeExecutionIds = ['execution'];
    state.executions.execution = {
      executionId: 'execution',
      messageId: 'answer',
      status: 'running',
      durable: false,
    };
    const test = setup(state);
    try {
      await settle();
      test.release();
      test.changeConnection({ status: 'offline' });
      const request = test.request.getMockImplementation()!;
      test.request.mockImplementation(async (method, params) => {
        if (method === 'assistant.topics.subscribe')
          throw new RemoteFailureError({ reason, message: 'Topic subscription failed' });
        return request(method, params);
      });
      test.changeConnection({ status: 'ready' });
      await settle();
      expect(test.scope.hasPendingExecution()).toBe(retries);
      expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(retries);
      if (retries) expect(test.reply.finish).not.toHaveBeenCalled();
      else expect(test.reply.finish).toHaveBeenCalledWith('failed');
      const subscriptions = () =>
        test.request.mock.calls.filter(([method]) => method === 'assistant.topics.subscribe')
          .length;
      expect(subscriptions()).toBe(2);
      await jest.advanceTimersByTimeAsync(4000);
      expect(subscriptions()).toBe(retries ? 4 : 2);
    } finally {
      test.scope.dispose();
      await test.scope.drain();
      jest.useRealTimers();
    }
  },
);

it('keeps recovering a created topic when first-send preparation repeatedly loses the connection', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  const readTopic = jest.fn(() => {
    throw new RemoteConversationError('CONNECTION_LOST', true);
  });
  const test = setup(projection(), {
    'assistant.topics.create': (params) => ({
      commandId: params.commandId,
      method: 'assistant.topics.create',
      status: 'applied',
      topicId: 'topic',
      admittedAt: '2026-10-14T00:00:00Z',
    }),
    'assistant.topics.get': readTopic,
  });
  try {
    await settle();
    await expect(
      test.scope.start({ agentId: 'assistant', draftId: 'draft', text: 'Recover me' }),
    ).resolves.toMatchObject({ status: 'pending', sessionId: 'topic' });
    expect(readTopic).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(5000);
    expect(readTopic).toHaveBeenCalledTimes(3);
    expect(test.scope.getStarts()).toMatchObject([
      { status: 'pending', text: 'Recover me', sessionId: 'topic' },
    ]);
    expect(
      test.request.mock.calls.filter(([method]) => method === 'assistant.topics.create'),
    ).toHaveLength(1);
  } finally {
    test.scope.dispose();
    await test.scope.drain();
    jest.useRealTimers();
  }
});

it.each(['first', 'continuation'] as const)(
  'uploads a file-only %s message under the Assistant grant without Agent access',
  async (kind) => {
    const file = {
      fileEntryId: FileEntryIdSchema.parse('12345678-1234-4234-8234-123456789abc'),
      name: 'data.bin',
      mediaType: 'application/octet-stream',
    };
    const resolved = {
      uri: 'file:///data.bin',
      entry: { id: file.fileEntryId, provenance: 'imported' },
    };
    const files = {
      resolve: async () => resolved,
      prepareUploadSource: async () => resolved,
      hashFile: jest.fn(),
    } as unknown as RemoteUploadFiles;
    let upload: Record<string, unknown> | undefined;
    const test = setup(
      projection(),
      {
        'assistant.topics.create': (params) => ({
          commandId: params.commandId,
          method: 'assistant.topics.create',
          status: 'applied',
          topicId: 'topic',
          admittedAt: '2026-10-14T00:00:00Z',
        }),
        'assistant.topics.get': () => ({ topic: projection().topic }),
        'assistant.attachments.present': () => ({ accepted: true }),
        'uploads.get': () => {
          if (!upload) throw new RemoteFailureError({ reason: 'NOT_FOUND', message: 'No upload' });
          return upload;
        },
        'uploads.prepare': (params) => {
          upload = {
            uploadId: params.uploadId,
            state: 'receiving',
            writerEpoch: '0',
            committedOffset: '0',
            expiresAt: '2099-01-01T00:00:00Z',
          };
          return upload;
        },
        'uploads.resume': () => (upload = { ...upload, writerEpoch: '1' }),
        'uploads.complete': () => (upload = { ...upload, state: 'ready' }),
      },
      files,
    );
    test.session.uploadsVersion = 1;
    test.session.sendUploadChunk.mockImplementation(async (input) => {
      expect(input.domain).toBe('assistant');
      expect([...input.bytes]).toEqual([1, 2, 3]);
      upload = { ...upload, committedOffset: '3' };
      return { ...upload, ok: true, requestId: 'chunk' };
    });
    await settle();
    expect(test.scope.getState()).toMatchObject({ attachments: true, preupload: true });
    const result =
      kind === 'first'
        ? await test.scope.start({
            draftId: 'files',
            agentId: 'assistant',
            text: '',
            attachments: [file],
          })
        : await test.scope.send(test.latest().sendTarget!, '', [file]);
    expect(result).toMatchObject({ status: 'rejected', attachments: [file] });
    const calls = test.request.mock.calls;
    expect(calls.some(([method]) => method.startsWith('agent.'))).toBe(false);
    const controls = calls.filter(([method]) => method.startsWith('uploads.'));
    expect(controls.length).toBeGreaterThan(0);
    for (const [, params] of controls) expect(params.domain).toBe('assistant');
    expect(calls.filter(([method]) => method === 'assistant.topics.create')).toHaveLength(
      kind === 'first' ? 1 : 0,
    );
    const sent = calls.find(([method]) => method === 'assistant.messages.send')![1];
    expect(sent).toMatchObject({
      text: '',
      attachments: [{ uploadId: upload!.uploadId }],
      selectionId: expect.any(String),
    });
    expect(test.scope.getState().attachmentDrafts).toEqual([]);
    test.session.uploadsVersion = undefined;
    test.changeConnection({ status: 'offline' });
    expect(test.scope.getState()).toMatchObject({ attachments: false, preupload: false });
    test.changeConnection({ status: 'ready' });
    await settle();
    expect(test.scope.getState()).toMatchObject({ attachments: false, preupload: false });
  },
);
