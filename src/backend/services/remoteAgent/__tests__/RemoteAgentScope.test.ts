import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopDomainLease, DesktopLeaseState } from '@/backend/services/desktopConnections';
import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';
import {
  RemoteFailureError,
  RemoteTransportError,
} from '@/backend/services/desktopConnections/remoteErrors';
import type { RemoteSessionSnapshot } from '@/shared/contracts/remoteAgent';

import { RemoteAgentScope, type RemoteBackgroundExecution } from '../RemoteAgentScope';
import { integrity } from '../remoteContent';
import { RemoteSessionReadCache } from '../RemoteSessionReadCache';
import { createCheckpointFixture } from './_checkpointFixture';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(cache = new RemoteSessionReadCache(), background?: RemoteBackgroundExecution) {
  let state: DesktopLeaseState = { status: 'ready' };
  const controller = new AbortController();
  const listeners = new Set<() => void>();
  const projection: AgentProjection = {
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
    interactions: {},
    executions: {},
    tombstones: [],
  };
  let checkpoint: ReturnType<typeof createCheckpointFixture>;
  const request = jest.fn(async (method: string, params: any) => {
    switch (method) {
      case 'agent.agents.list':
        return {
          items: [
            {
              agentId: 'a',
              name: 'Agent',
              emoji: '🧑🏽‍💻',
              model: { modelId: 'model', providerId: 'desktop', name: 'Current model' },
            },
          ],
          nextCursor: null,
        };
      case 'agent.sessions.subscribe':
        checkpoint = createCheckpointFixture(projection);
        return {
          subscriptionId: 'sub',
          mode: 'checkpoint',
          reason: 'initial',
          checkpoint: checkpoint.descriptor,
        };
      case 'agent.checkpoints.read':
        return checkpoint.page;
      case 'agent.subscriptions.activate':
        return { subscriptionId: 'sub', status: 'active' };
      case 'agent.interactions.list':
        return { items: [] };
      case 'agent.subscriptions.close':
        return { closed: true };
      case 'agent.subscriptions.ack':
        return { acknowledged: params.cursor };
      case 'agent.messages.send':
        return {
          commandId: params.commandId,
          method,
          status: 'accepted',
          admittedAt: '2026-09-22T00:00:00.000Z',
          sessionId: 's',
        };
      default:
        throw new Error(method);
    }
  });
  const notifications = new Set<(notification: DesktopNotification) => void>();
  const connection = {
    request,
    onNotification: (listener: (notification: DesktopNotification) => void) => {
      notifications.add(listener);
      return () => notifications.delete(listener);
    },
  };
  const lease: DesktopDomainLease = {
    scope: 'pairing-scope',
    connectionId: 'pc',
    grantId: 'grant',
    signal: controller.signal,
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ready: jest.fn(async () => connection as never),
    setBackgroundRequired: jest.fn(),
    release: jest.fn(),
  };
  const values = new Map<string, string>();
  const journal = new RemoteAgentCommandJournal({
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, String(value));
    },
    getAllKeys: () => [...values.keys()],
    remove: (key) => values.delete(key),
  });
  const source = new RemoteAgentScope(
    lease,
    { retain: jest.fn(), revoke: jest.fn(), subscribeInvalidation: () => () => undefined },
    journal,
    cache,
    background,
  );
  return {
    source,
    request,
    projection,
    lease,
    journal,
    notify(notification: DesktopNotification) {
      for (const listener of notifications) listener(notification);
    },
    setState(next: DesktopLeaseState) {
      state = next;
      for (const listener of listeners) listener();
      if (next.status === 'retired') controller.abort();
    },
  };
}

it('observes through its lease, suppresses stale command targets, and never owns socket close', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  const unobserve = test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  expect(snapshot?.current).toBe(true);
  const target = snapshot!.sendTarget!;
  test.setState({ status: 'suspended' });
  expect(snapshot?.current).toBe(false);
  expect(() => test.source.send(target, 'hello')).toThrow('CONFLICT');
  await settle();
  expect(test.request.mock.calls.some(([method]) => method === 'agent.executions.cancel')).toBe(
    false,
  );
  unobserve();
  test.source.dispose();
  await test.source.drain();
  expect(test.lease.release).toHaveBeenCalledTimes(1);
});

function backgroundFixture() {
  const turn = {
    updateContent: jest.fn(),
    update: jest.fn(),
    awaitApproval: jest.fn(),
    finish: jest.fn(),
  };
  const startTurn = jest.fn(
    (_input: Parameters<RemoteBackgroundExecution['replies']['startTurn']>[0]) => turn,
  );
  const background: RemoteBackgroundExecution = {
    replies: {
      startTurn,
      acquirePreparation: jest.fn(),
      clearSession: jest.fn(),
      updateSessionTitle: jest.fn(),
    },
    keepAlive: { acquire: jest.fn(() => ({ release: jest.fn() })) },
    translate: (key) => key,
  };
  const test = fixture(new RemoteSessionReadCache(), background);
  return { ...test, turn, startTurn, background };
}

it('retains an active desktop execution after its screen leaves and releases demand on a terminal checkpoint', async () => {
  const test = backgroundFixture();
  test.projection.executions.e = { executionId: 'e', status: 'running', durable: false };
  const unobserve = test.source.observe('s', () => {});
  await settle();
  expect(test.startTurn).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: 'pc', sessionId: 's' }),
  );
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(true);
  unobserve();
  await settle();
  expect(test.source.hasPendingExecution()).toBe(true);
  expect(test.request.mock.calls.some(([method]) => method === 'agent.subscriptions.close')).toBe(
    false,
  );
  test.projection.executions.e = {
    executionId: 'e',
    status: 'completed',
    durable: true,
    messageId: 'm',
    history: { historyRevision: '1', messageRevision: '1' },
  };
  test.setState({ status: 'ready' });
  await settle();
  expect(test.turn.finish).toHaveBeenCalledWith('completed');
  expect(test.source.hasPendingExecution()).toBe(false);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  test.source.dispose();
  await test.source.drain();
});

it('revocation of phone protection does not cancel or resubmit the desktop execution', async () => {
  const test = backgroundFixture();
  test.projection.executions.e = { executionId: 'e', status: 'awaiting-approval', durable: false };
  test.source.observe('s', () => {});
  await settle();
  expect(test.turn.updateContent).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'awaiting-approval' }),
  );
  test.startTurn.mock.calls[0]![0].onInterrupt?.(new Error('Service stopped'));
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  expect(
    test.request.mock.calls.some(([method]) =>
      ['agent.messages.send', 'agent.executions.cancel'].includes(method),
    ),
  ).toBe(false);
  expect(test.turn.finish).toHaveBeenCalledWith('cancelled');
  test.source.dispose();
  await test.source.drain();
});

it('settles a rejected send as failed instead of repeating the previous turn outcome', async () => {
  const test = backgroundFixture();
  test.projection.executions.e = {
    executionId: 'e',
    status: 'completed',
    durable: true,
    messageId: 'm',
    history: { historyRevision: '1', messageRevision: '1' },
  };
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.messages.send')
      throw new RemoteFailureError({ reason: 'INTERNAL', message: 'Rejected' });
    return request(method, params);
  });
  const command = await test.source.send(snapshot!.sendTarget!, 'hello');
  expect(command.status).toBe('rejected');
  expect(test.turn.finish).toHaveBeenCalledWith('failed');
  expect(test.source.hasPendingExecution()).toBe(false);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  test.source.dispose();
  await test.source.drain();
});

it('stops background demand when a tracked session can no longer be observed', async () => {
  const test = backgroundFixture();
  test.projection.executions.e = { executionId: 'e', status: 'running', durable: false };
  const unobserve = test.source.observe('s', () => {});
  await settle();
  unobserve();
  await settle();
  expect(test.source.hasPendingExecution()).toBe(true);
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.sessions.subscribe')
      throw new RemoteFailureError({ reason: 'NOT_FOUND', message: 'Session deleted' });
    return request(method, params);
  });
  test.setState({ status: 'ready' });
  await settle();
  await settle();
  expect(test.turn.finish).toHaveBeenCalledWith('failed');
  expect(test.source.hasPendingExecution()).toBe(false);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  test.source.dispose();
  await test.source.drain();
});

it('releases phone protection when background demand is suspended and resumes when ready', async () => {
  const test = backgroundFixture();
  test.projection.executions.e = { executionId: 'e', status: 'running', durable: false };
  const unobserve = test.source.observe('s', () => {});
  await settle();
  unobserve();
  await settle();
  test.setState({ status: 'suspended' });
  expect(test.turn.finish).toHaveBeenCalledWith('cancelled');
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(false);
  expect(
    test.request.mock.calls.some(([method]) =>
      ['agent.messages.send', 'agent.executions.cancel'].includes(method),
    ),
  ).toBe(false);
  test.setState({ status: 'ready' });
  await settle();
  await settle();
  expect(test.startTurn).toHaveBeenCalledTimes(2);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(true);
  test.source.dispose();
  await test.source.drain();
});

it('hands a recovered first send to execution observation before releasing command protection', async () => {
  const test = backgroundFixture();
  const methods = new Map<string, string>();
  let confirmed = false;
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.sessions.get') return { session: test.projection.session } as never;
    if (method === 'agent.sessions.create' || method === 'agent.messages.send') {
      methods.set(params.commandId, method);
      return {
        commandId: params.commandId,
        method,
        status: method === 'agent.sessions.create' ? 'applied' : 'accepted',
        admittedAt: '2026-09-22T00:00:00.000Z',
        sessionId: 's',
      } as never;
    }
    if (method === 'agent.commands.get')
      return {
        commandId: params.commandId,
        method: methods.get(params.commandId),
        status: confirmed ? 'applied' : 'accepted',
        admittedAt: '2026-09-22T00:00:00.000Z',
        sessionId: 's',
      } as never;
    return request(method, params);
  });
  const start = await test.source.start({
    draftId: 'draft',
    agentId: 'a',
    workspace: { kind: 'system' },
    text: 'hello',
  });
  expect(start.status).toBe('pending');
  confirmed = true;
  test.projection.executions.e = { executionId: 'e', status: 'running', durable: false };
  test.setState({ status: 'ready' });
  await settle();
  await settle();
  expect(test.startTurn).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's' }));
  expect(test.source.hasPendingExecution()).toBe(true);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(true);
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.messages.send'),
  ).toHaveLength(1);
  test.source.dispose();
  await test.source.drain();
});

it('resumes observation when a persisted uncertain send is confirmed after a source restart', async () => {
  const test = backgroundFixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const command = await test.source.send(snapshot!.sendTarget!, 'hello');
  expect(command.status).toBe('pending');
  test.source.dispose();
  await test.source.drain();
  test.projection.executions.e = { executionId: 'e', status: 'running', durable: false };
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.commands.get')
      return {
        commandId: params.commandId,
        method: 'agent.messages.send',
        status: 'applied',
        admittedAt: '2026-09-22T00:00:00.000Z',
        sessionId: 's',
      } as never;
    return request(method, params);
  });
  const restored = new RemoteAgentScope(
    test.lease,
    { retain: jest.fn(), revoke: jest.fn(), subscribeInvalidation: () => () => undefined },
    test.journal,
    new RemoteSessionReadCache(),
    test.background,
  );
  await settle();
  await settle();
  expect(restored.hasPendingExecution()).toBe(true);
  expect(test.lease.setBackgroundRequired).toHaveBeenLastCalledWith(true);
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.messages.send'),
  ).toHaveLength(1);
  restored.dispose();
  await restored.drain();
});

it('publishes live events without rewriting an unchanged session into the history preview', async () => {
  const test = fixture();
  const published: RemoteSessionSnapshot[] = [];
  test.source.observe('s', (value) => published.push(value));
  await settle();
  const reads = jest.fn();
  test.source.subscribeReads('s', reads);
  test.notify({
    method: 'agent.events',
    params: {
      sessionId: 's',
      streamEpoch: 'epoch',
      subscriptionId: 'sub',
      events: [
        {
          seq: '1',
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
  });
  await settle();
  expect(published.at(-1)).toMatchObject({ current: true, messages: [{ id: 'm' }] });
  expect(reads).not.toHaveBeenCalled();
  test.source.dispose();
  await test.source.drain();
});

it('replaces disconnected state with a fresh desktop checkpoint before re-enabling actions', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const previousTarget = snapshot!.sendTarget!;
  test.setState({ status: 'offline' });
  expect(snapshot?.current).toBe(false);
  test.projection.session = {
    ...test.projection.session,
    title: 'Changed on PC',
    idleRevision: '2',
  };
  test.projection.cursor = { ...test.projection.cursor, seq: '7' };
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.checkpoints.read') await wait;
    return request(method, params);
  });
  test.setState({ status: 'ready' });
  await settle();
  expect(snapshot?.current).toBe(false);
  expect(() => test.source.send(previousTarget, 'hello')).toThrow('CONFLICT');
  release();
  await settle();
  expect(snapshot).toMatchObject({ current: true, session: { title: 'Changed on PC' } });
  expect(snapshot!.sendTarget).not.toBe(previousTarget);
  expect(() => test.source.send(previousTarget, 'hello')).toThrow('CONFLICT');
  expect(
    test.request.mock.calls
      .filter(([method]) => method === 'agent.sessions.subscribe')
      .map(([, params]) => params),
  ).toEqual([{ sessionId: 's' }, { sessionId: 's' }]);
  test.source.dispose();
  await test.source.drain();
});

it('resubscribes after the desktop rejects a send for a stale idle revision', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const staleTarget = snapshot!.sendTarget!;
  // The desktop renamed the session without publishing session.updated.
  test.projection.session = {
    ...test.projection.session,
    title: 'Renamed on PC',
    idleRevision: '2',
  };
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) =>
    method === 'agent.messages.send' && params.expectedIdleRevision !== '2'
      ? {
          commandId: params.commandId,
          method,
          status: 'rejected',
          admittedAt: '2026-09-22T00:00:00.000Z',
          sessionId: 's',
          error: { reason: 'CONFLICT', message: 'Session is not idle at the expected revision' },
        }
      : request(method, params),
  );
  const rejected = await test.source.send(staleTarget, 'hello');
  expect(rejected).toMatchObject({ status: 'rejected', error: 'CONFLICT' });
  expect(snapshot?.current).toBe(false);
  expect(snapshot?.sendTarget).toBeUndefined();
  await settle();
  expect(snapshot).toMatchObject({ current: true, session: { title: 'Renamed on PC' } });
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.sessions.subscribe'),
  ).toHaveLength(2);
  await expect(test.source.send(snapshot!.sendTarget!, 'hello')).resolves.toMatchObject({
    status: 'pending',
  });
  test.source.dispose();
  await test.source.drain();
});

it('resyncs from storage when the desktop checkpoint still carries a stale idle revision', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  // The desktop renamed the session in storage, but its checkpoint cache still serves the old summary.
  const stored = {
    ...test.projection.session,
    title: 'Renamed on PC',
    updatedAt: '2026-09-22T00:00:05.000Z',
    historyRevision: '5',
    idleRevision: '5',
  };
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) =>
    method === 'agent.sessions.get'
      ? ({ session: stored } as never)
      : method === 'agent.messages.send' && params.expectedIdleRevision !== '5'
        ? ({
            commandId: params.commandId,
            method,
            status: 'rejected',
            admittedAt: '2026-09-22T00:00:00.000Z',
            sessionId: 's',
            error: { reason: 'CONFLICT', message: 'Session is not idle at the expected revision' },
          } as never)
        : request(method, params),
  );
  await test.source.send(snapshot!.sendTarget!, 'hello');
  expect(snapshot?.current).toBe(false);
  expect(snapshot?.sendTarget).toBeUndefined();
  await settle();
  expect(snapshot).toMatchObject({
    current: true,
    session: { title: 'Renamed on PC', historyVersion: '1' },
  });
  expect(JSON.parse(snapshot!.sendTarget!).params.expectedIdleRevision).toBe('5');
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.sessions.subscribe'),
  ).toHaveLength(2);
  test.source.dispose();
  await test.source.drain();
});

it('does not admit another send while the original command receipt is still uncertain', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const target = snapshot!.sendTarget!;
  const sent = await test.source.send(target, 'hello');
  expect(sent.status).toBe('pending');
  expect(() => test.source.send(target, 'again')).toThrow('CONFLICT');
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.messages.send'),
  ).toHaveLength(1);
  test.source.dispose();
  await test.source.drain();
});

it('retires an old scope without committing a late observation or reusing its exposed query scope', async () => {
  const first = fixture();
  const second = fixture();
  expect(first.source.scope).not.toBe(second.source.scope);
  const published: RemoteSessionSnapshot[] = [];
  first.source.observe('s', (value) => published.push(value));
  first.setState({ status: 'retired', reason: 'replaced' });
  await settle();
  expect(published.every((value) => !value.current)).toBe(true);
  expect(first.request).not.toHaveBeenCalled();
  first.source.dispose();
  second.source.dispose();
  await Promise.all([first.source.drain(), second.source.drain()]);
});

it('keeps inline tool payloads out of frontend references and rejects another scope reading them', async () => {
  const first = fixture();
  const other = fixture();
  first.projection.messages.m = {
    messageId: 'm',
    revision: '1',
    role: 'assistant',
    status: 'pending',
    partIds: ['input'],
  };
  first.projection.parts.input = {
    partId: 'input',
    revision: '1',
    kind: 'tool-input',
    toolName: 'read',
    toolCallId: 'call',
    content: { text: '{"secret":"private-input"}' },
    state: 'completed',
  };
  let snapshot: RemoteSessionSnapshot | undefined;
  first.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const tool = snapshot!.messages[0].parts[0];
  if (tool.kind !== 'tool') throw new Error('Expected tool summary');
  expect(tool.input).not.toContain('private-input');
  await expect(
    first.source.readResource(tool.input!, new AbortController().signal),
  ).resolves.toEqual({ kind: 'text', text: '{"secret":"private-input"}' });
  await expect(
    other.source.readResource(tool.input!, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'RESOURCE_UNAVAILABLE' });
  first.source.dispose();
  other.source.dispose();
  await Promise.all([first.source.drain(), other.source.drain()]);
});

it('materializes a question only from its bound input revision and preserves the response target', async () => {
  const test = fixture();
  const input = {
    questions: [
      { question: '目录？', options: [{ label: 'src' }, { label: 'docs' }], multiSelect: true },
    ],
  };
  const text = JSON.stringify(input);
  const interaction = {
    interactionId: 'question',
    executionId: 'e',
    toolCallId: 'call',
    revision: '1',
    status: 'pending' as const,
    kind: 'question' as const,
    summary: 'Choose',
    inputDigest: integrity.sha256(new TextEncoder().encode(text)),
  };
  test.projection.interactions.question = interaction;
  test.projection.executions.e = { executionId: 'e', status: 'awaiting-approval', durable: false };
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.interactions.get')
      return { interaction: { ...interaction, input: { text } } } as never;
    if (method === 'agent.interactions.respond')
      return {
        commandId: params.commandId,
        method,
        status: 'applied',
        admittedAt: '2026-09-22T00:00:00.000Z',
      } as never;
    return request(method, params);
  });
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const question = snapshot!.interactions[0];
  expect(question.kind).toBe('question');
  await expect(
    test.source.readResource(question.input, new AbortController().signal),
  ).resolves.toEqual({
    kind: 'question',
    questions: [
      {
        question: '目录？',
        options: input.questions[0].options,
        header: undefined,
        multiple: true,
      },
    ],
  });
  await test.source.respond(question.respondTarget!, {
    kind: 'answer',
    answers: { '目录？': 'src, docs' },
  });
  const body = test.request.mock.calls.find(
    ([method]) => method === 'agent.interactions.respond',
  )![1];
  expect(body).toMatchObject({
    expectedExecutionId: 'e',
    expectedRevision: '1',
    inputDigest: interaction.inputDigest,
    response: { kind: 'answer', answers: { '目录？': 'src, docs' } },
  });
  interaction.revision = '2';
  await expect(
    test.source.readResource(question.input, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'REVISION_EXPIRED' });
  test.source.dispose();
  await test.source.drain();
});

test('catalog preserves the desktop emoji without creating a session observation', async () => {
  const f = fixture();
  expect(await f.source.listAgents(undefined, new AbortController().signal)).toEqual({
    items: [
      {
        id: 'a',
        name: 'Agent',
        emoji: '🧑🏽‍💻',
        model: { modelId: 'model', providerId: 'desktop', name: 'Current model' },
      },
    ],
    next: undefined,
  });
  expect(f.request.mock.calls.some(([method]) => method === 'agent.sessions.subscribe')).toBe(
    false,
  );
  f.source.dispose();
  await f.source.drain();
});

it('returns cached history across scope disposal, rebinds resources and revalidates metadata without rereading parts', async () => {
  const cache = new RemoteSessionReadCache();
  const first = fixture(cache);
  const install = (test: ReturnType<typeof fixture>, tokens: number) => {
    const original = test.request.getMockImplementation()!;
    test.request.mockImplementation(async (method, params) => {
      if (method === 'agent.sessions.get') return { session: test.projection.session } as never;
      if (method === 'agent.messages.list')
        return {
          items: [
            {
              messageId: 'm',
              revision: '1',
              role: 'assistant',
              status: 'success',
              partIds: ['p'],
              usage: { totalTokens: tokens },
            },
          ],
        } as never;
      if (method === 'agent.parts.list')
        return {
          items: [
            {
              partId: 'p',
              revision: '1',
              kind: 'tool-input',
              toolName: 'read',
              toolCallId: 'call',
              content: { text: '{"path":"src"}' },
              state: 'completed',
            },
          ],
        } as never;
      return original(method, params);
    });
  };
  const signal = new AbortController().signal;
  install(first, 12);
  await first.source.readSession('s', signal);
  const old = await first.source.history('s', '1', undefined, signal);
  first.source.dispose();
  await first.source.drain();
  const second = fixture(cache);
  install(second, 25);
  const preview = second.source.peekSession('s')!;
  expect(second.request).not.toHaveBeenCalled();
  expect(preview.history?.items[0].usage?.totalTokens).toBe(12);
  const oldPart = old.items[0].parts[0];
  const newPart = preview.history!.items[0].parts[0];
  if (oldPart.kind !== 'tool' || newPart.kind !== 'tool') throw new Error('Expected tools');
  expect(newPart.input).not.toBe(oldPart.input);
  await expect(second.source.readResource(oldPart.input!, signal)).rejects.toMatchObject({
    code: 'RESOURCE_UNAVAILABLE',
  });
  await expect(second.source.readResource(newPart.input!, signal)).resolves.toMatchObject({
    text: '{"path":"src"}',
  });
  const fresh = await second.source.history('s', '1', undefined, signal);
  expect(fresh.items[0].usage?.totalTokens).toBe(25);
  expect(second.request.mock.calls.map(([method]) => method)).toEqual(['agent.messages.list']);
  second.source.dispose();
  await second.source.drain();
});

it('shares verified bodies across message revisions, publishes cold rows progressively, and replaces deleted membership', async () => {
  const cache = new RemoteSessionReadCache();
  const test = fixture(cache);
  const signal = new AbortController().signal;
  const text = 'body';
  const ref = {
    contentId: 'body',
    revision: '1',
    byteLength: '4',
    sha256: integrity.sha256(new TextEncoder().encode(text)),
    mediaType: 'text/plain',
  };
  let revision = '1';
  let ids = ['new', 'slow'];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  test.request.mockImplementation(async (method, params) => {
    if (method === 'agent.sessions.get') return { session: test.projection.session } as never;
    if (method === 'agent.messages.list')
      return {
        items: ids.map((id) => ({
          messageId: id,
          revision,
          role: 'assistant',
          status: 'success',
          partIds: [id],
        })),
      } as never;
    if (method === 'agent.parts.list') {
      if (params.messageId === 'slow' && revision === '1') await wait;
      return {
        items: [
          {
            partId: params.messageId,
            revision,
            kind: 'text',
            state: 'completed',
            content: { ref },
          },
        ],
      } as never;
    }
    if (method === 'agent.content.read')
      return { ...ref, offset: '0', nextOffset: '4', eof: true, dataBase64: 'Ym9keQ==' } as never;
    throw new Error(method);
  });
  await test.source.readSession('s', signal);
  const history = test.source.history('s', revision, undefined, signal);
  await settle();
  expect(test.source.peekSession('s')?.history).toMatchObject({
    complete: false,
    items: [{ id: 'new' }],
  });
  release();
  await history;
  expect(test.source.peekSession('s')?.history?.complete).toBe(true);
  revision = '2';
  ids = ['new'];
  await test.source.history('s', revision, undefined, signal);
  expect(test.source.peekSession('s')?.history?.items.map((item) => item.id)).toEqual(['new']);
  expect(
    test.request.mock.calls.filter(([method]) => method === 'agent.content.read'),
  ).toHaveLength(1);
  test.source.dispose();
  await test.source.drain();
});

it('removes a missing session preview instead of retaining it as normal offline history', async () => {
  const cache = new RemoteSessionReadCache();
  const test = fixture(cache);
  const entry = cache.entry('pc', test.lease.scope, test.lease.grantId, 's');
  cache.put(entry, 0, 'session', test.projection.session);
  expect(test.source.peekSession('s')).toBeDefined();
  test.request.mockRejectedValue(
    new RemoteFailureError({ reason: 'NOT_FOUND', message: 'Session deleted' }),
  );
  await expect(test.source.readSession('s', new AbortController().signal)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(test.source.peekSession('s')).toBeUndefined();
  cache.put(entry, 0, 'session', test.projection.session);
  expect(test.source.peekSession('s')).toBeUndefined();
  test.source.dispose();
  await test.source.drain();
});

it('keeps a command whose reply was lost in transit uncertain rather than failed', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  const unobserve = test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const target = snapshot!.sendTarget!;
  test.request.mockImplementationOnce(async () => {
    throw new RemoteTransportError('timeout', 'Request timeout');
  });
  const sent = await test.source.send(target, 'hello');
  expect(sent.status).toBe('pending');
  expect(sent.error).toBeUndefined();
  test.request.mockRejectedValueOnce(new RemoteTransportError('closed', 'Connection closed'));
  await expect(test.source.readSession('s', new AbortController().signal)).rejects.toMatchObject({
    code: 'CONNECTION_LOST',
    retryable: true,
  });
  unobserve();
  test.source.dispose();
  await test.source.drain();
});
