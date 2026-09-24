import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopDomainLease, DesktopLeaseState } from '@/backend/services/desktopConnections';
import { RemoteFailureError } from '@/backend/services/desktopConnections/remoteErrors';
import type { RemoteSessionSnapshot } from '@/shared/contracts/remoteAgent';

import { RemoteAgentScope } from '../RemoteAgentScope';
import { integrity } from '../remoteContent';
import { RemoteSessionReadCache } from '../RemoteSessionReadCache';
import { createCheckpointFixture } from './_checkpointFixture';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(cache = new RemoteSessionReadCache()) {
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
  const source = new RemoteAgentScope(
    lease,
    { retain: jest.fn(), revoke: jest.fn(), subscribeInvalidation: () => () => undefined },
    journal,
    cache,
  );
  return {
    source,
    request,
    projection,
    lease,
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
