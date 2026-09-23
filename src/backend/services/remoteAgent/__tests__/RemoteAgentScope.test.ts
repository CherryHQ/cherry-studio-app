import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopDomainLease, DesktopLeaseState } from '@/backend/services/desktopConnections';
import type { RemoteSessionSnapshot } from '@/shared/contracts/remoteAgent';

import { RemoteAgentScope } from '../RemoteAgentScope';
import { integrity } from '../remoteContent';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture() {
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
  const request = jest.fn(async (method: string, params: any) => {
    switch (method) {
      case 'agent.agents.list':
        return { items: [{ agentId: 'a', name: 'Agent', emoji: '🧑🏽‍💻' }], nextCursor: null };
      case 'agent.sessions.subscribe':
        return {
          subscriptionId: 'sub',
          mode: 'replay',
          fromCursor: projection.cursor,
          highWatermark: projection.cursor,
          leaseExpiresAt: '2026-09-22T00:10:00.000Z',
        };
      case 'agent.subscriptions.activate':
        return { subscriptionId: 'sub', status: 'active' };
      case 'agent.interactions.list':
        return { items: [] };
      case 'agent.subscriptions.close':
        return { closed: true };
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
  const connection = { request, onNotification: () => () => undefined };
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
  const store = { read: jest.fn(async () => projection), write: jest.fn(async () => undefined) };
  const source = new RemoteAgentScope(
    lease,
    { retain: jest.fn(), revoke: jest.fn() },
    journal,
    store,
  );
  return {
    source,
    request,
    projection,
    lease,
    store,
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

it('does not admit another send while the original command receipt is still uncertain', async () => {
  const test = fixture();
  let snapshot: RemoteSessionSnapshot | undefined;
  test.source.observe('s', (value) => {
    snapshot = value;
  });
  await settle();
  const target = snapshot!.sendTarget!;
  const sent = await test.source.send(target, 'hello');
  expect(sent.status).toBe('confirming');
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
  expect(first.store.write).not.toHaveBeenCalled();
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
    items: [{ id: 'a', name: 'Agent', emoji: '🧑🏽‍💻' }],
    next: undefined,
  });
  expect(f.request.mock.calls.some(([method]) => method === 'agent.sessions.subscribe')).toBe(
    false,
  );
  f.source.dispose();
  await f.source.drain();
});
