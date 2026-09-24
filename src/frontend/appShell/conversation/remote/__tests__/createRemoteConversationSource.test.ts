import type {
  RemoteAgentSource,
  RemoteSessionSnapshot,
  RemoteSourceState,
} from '@/shared/contracts/remoteAgent';

import { createRemoteConversationSource } from '../createRemoteConversationSource';
import type { DraftId } from '../remoteContracts';

const signal = () => new AbortController().signal;
const session = {
  id: 's',
  agentId: 'a',
  workspaceId: 'w',
  title: 'Conversation',
  updatedAt: '2026-09-22T00:00:00.000Z',
  historyVersion: '1',
};
const message = (id: string) => ({
  id,
  version: '1',
  role: 'assistant' as const,
  state: 'success' as const,
  parts: [{ id: `${id}:text`, kind: 'text' as const, text: id, complete: true }],
});
function fixture(scope = 'scope', binding = 'binding') {
  let state: RemoteSourceState = { status: 'ready' };
  const states = new Set<() => void>();
  const operationListeners = new Set<() => void>();
  let observer: ((value: RemoteSessionSnapshot) => void) | undefined;
  const unobserve = jest.fn();
  const remote: RemoteAgentSource = {
    scope,
    draftScope: binding,
    getState: () => state,
    subscribeState: (listener) => {
      states.add(listener);
      return () => {
        states.delete(listener);
      };
    },
    listAgents: jest.fn(async () => ({ items: [{ id: 'a', name: 'Agent', emoji: '🧑🏽‍💻' }] })),
    listWorkspaces: jest.fn(async () => ({ items: [{ id: 'w', name: 'Workspace' }] })),
    listSessions: jest.fn(async () => ({ items: [session] })),
    peekSession: jest.fn(() => undefined),
    subscribeReads: jest.fn(() => () => undefined),
    readSession: jest.fn(async () => session),
    observe: jest.fn((_id, listener) => {
      observer = listener;
      return unobserve;
    }),
    history: jest.fn(async (_id, _version, cursor) =>
      cursor
        ? { items: [message('m1')] }
        : { items: [message('m3'), message('m2')], next: 'older' },
    ),
    readResource: jest.fn(async () => ({ kind: 'text' as const, text: '{"input":true}' })),
    start: jest.fn(async (input) => ({
      ...input,
      id: 'start',
      status: 'pending' as const,
      sessionId: 'created',
    })),
    send: jest.fn(async () => ({
      id: 'send',
      kind: 'send' as const,
      status: 'confirming' as const,
      sessionId: 's',
    })),
    cancel: jest.fn(async () => ({
      id: 'cancel',
      kind: 'cancel' as const,
      status: 'applied' as const,
    })),
    respond: jest.fn(async () => ({
      id: 'respond',
      kind: 'respond' as const,
      status: 'applied' as const,
    })),
    getCommands: () => [],
    getStarts: () => [],
    subscribeOperations: (listener) => {
      operationListeners.add(listener);
      return () => {
        operationListeners.delete(listener);
      };
    },
    recover: jest.fn(async () => undefined),
    dismiss: jest.fn(),
    dispose: jest.fn(),
  };
  const source = createRemoteConversationSource('pc', remote);
  const snapshot: RemoteSessionSnapshot = {
    session,
    current: true,
    messages: [],
    executions: [],
    interactions: [],
    sendTarget: 'idle-1',
  };
  return {
    source,
    remote,
    snapshot,
    unobserve,
    publish: (value = snapshot) => observer?.(value),
    setState: (next: RemoteSourceState) => {
      state = next;
      for (const listener of states) listener();
    },
  };
}
const address = { source: { kind: 'desktop' as const, connectionId: 'pc' }, sessionId: 's' };

it('opens without observing, disables send until synchronized, and releases observation without cancelling execution', async () => {
  const test = fixture();
  const session = await test.source.openSession(address, signal());
  expect(test.remote.observe).not.toHaveBeenCalled();
  expect(session.state.getSnapshot().actions.send?.availability).toEqual({
    state: 'disabled',
    reason: 'synchronizing',
  });
  const release = session.activate();
  test.publish();
  expect(session.state.getSnapshot().actions.send?.availability.state).toBe('enabled');
  const result = await session.state
    .getSnapshot()
    .actions.send!.execute({ parts: [{ type: 'text', text: 'hello' }] });
  expect(result.state).toBe('pending');
  release();
  expect(test.unobserve).toHaveBeenCalledTimes(1);
  expect(test.remote.cancel).not.toHaveBeenCalled();
  test.source.dispose();
});

it('rejects retired callbacks and local-only input before crossing the remote boundary', async () => {
  const test = fixture();
  const session = await test.source.openSession(address, signal());
  session.activate();
  test.publish();
  const send = session.state.getSnapshot().actions.send!;
  const unsupported = await send.execute({
    parts: [{ type: 'text', text: 'hello' }],
    reasoningEffort: 'high',
  });
  expect(unsupported).toMatchObject({ state: 'rejected', failure: { code: 'unsupported' } });
  expect(test.remote.send).not.toHaveBeenCalled();
  test.source.dispose();
  await expect(send.execute({ parts: [{ type: 'text', text: 'hello' }] })).resolves.toMatchObject({
    state: 'rejected',
    failure: { code: 'retired' },
  });
});

it('pins a history window and prepares a complete chronological selection before export', async () => {
  const test = fixture();
  const session = await test.source.openSession(address, signal());
  const window = await session.history.openLatest(signal());
  expect(window.initial.items.map((item) => item.key)).toEqual(['m2', 'm3']);
  const older = await window.read(window.initial.older!, signal());
  const prepared = await session.history.prepareSelection(
    [window.initial.items[1].key, older.items[0].key],
    signal(),
  );
  expect(prepared.messages.map((item) => item.id)).toEqual(['m1', 'm3']);
  expect(jest.mocked(test.remote.history).mock.calls.every((call) => call[1] === '1')).toBe(true);
  test.setState({ status: 'offline' });
  expect(prepared.messages[0].parts[0]).toMatchObject({ text: 'm1' });
  window.dispose();
  await expect(window.read(window.initial.older!, signal())).rejects.toMatchObject({
    failure: { code: 'cancelled' },
  });
  test.source.dispose();
});

it('rejects cursors from a different scope', async () => {
  const left = fixture('left');
  const right = fixture('right');
  const a = await left.source.openSession(address, signal());
  const b = await right.source.openSession(address, signal());
  const windowA = await a.history.openLatest(signal());
  const windowB = await b.history.openLatest(signal());
  expect(() => windowB.read(windowA.initial.older!, signal())).toThrow('invalid-input');
  left.source.dispose();
  right.source.dispose();
});

it('binds workspaces to the selected Agent and never invents a default workspace for first send', async () => {
  const test = fixture();
  const agents = await test.source.catalog.listAgents(undefined, signal());
  const agent = agents.items[0].ref;
  const draft = await test.source.catalog.prepareDraft(
    { agent, draftId: 'draft' as DraftId },
    signal(),
  );
  expect(draft.state.getSnapshot().start.availability).toEqual({
    state: 'disabled',
    reason: 'workspace-required',
  });
  const workspaces = await test.source.catalog.listWorkspaces!(agent, undefined, signal());
  expect(test.remote.listWorkspaces).toHaveBeenCalledWith('a', undefined, expect.any(AbortSignal));
  const ready = await test.source.catalog.prepareDraft(
    { agent, workspace: workspaces.items[0].ref, draftId: 'draft-2' as DraftId },
    signal(),
  );
  await expect(
    ready.state.getSnapshot().start.execute({ parts: [{ type: 'text', text: 'hello' }] }),
  ).resolves.toMatchObject({ state: 'pending' });
  expect(test.remote.start).toHaveBeenCalledWith({
    draftId: 'draft-2',
    agentId: 'a',
    workspace: { kind: 'registered', id: 'w' },
    text: 'hello',
  });
  test.source.dispose();
});

it('keeps an admitted draft disabled when reopening it with a pending or rejected first-send receipt', async () => {
  const test = fixture();
  const agent = (await test.source.catalog.listAgents(undefined, signal())).items[0].ref;
  const workspace = (await test.source.catalog.listWorkspaces!(agent, undefined, signal())).items[0]
    .ref;
  for (const status of ['pending', 'rejected'] as const) {
    test.remote.getStarts = () => [
      {
        id: 'start',
        draftId: 'draft',
        agentId: 'a',
        workspaceId: 'w',
        text: 'original',
        status,
        sessionId: 'created',
      },
    ];
    const draft = await test.source.catalog.prepareDraft(
      { agent, workspace, draftId: 'draft' as DraftId },
      signal(),
    );
    expect(draft.state.getSnapshot().start.availability).toEqual({
      state: 'disabled',
      reason: 'busy',
    });
    expect(draft.operations.getSnapshot()[0]).toMatchObject({
      state: status,
      input: { parts: [{ type: 'text', text: 'original' }] },
      conversation: { sessionId: 'created' },
    });
    draft.dispose();
  }
  expect(test.remote.start).not.toHaveBeenCalled();
  test.source.dispose();
});

it('exposes source-owned starts without reopening the original draft and separates durable binding from read scope', async () => {
  const test = fixture('read-generation');
  test.remote.getStarts = () => [
    {
      id: 'pending-start',
      draftId: 'old-draft',
      agentId: 'a',
      workspaceId: 'w',
      text: 'Retained input',
      status: 'pending',
      sessionId: 'created',
    },
  ];
  const source = createRemoteConversationSource('desktop', test.remote);
  expect(source.draftScope).toBe('binding');
  expect(source.scope).toBe('read-generation');
  expect(source.operations.getSnapshot()[0]).toMatchObject({
    draftId: 'old-draft',
    state: 'pending',
    conversation: { sessionId: 'created' },
    input: { parts: [{ type: 'text', text: 'Retained input' }] },
  });
  const session = await source.openSession({ source: source.ref, sessionId: 's' }, signal());
  expect(session.state.getSnapshot()).toMatchObject({ agentId: 'a', workspaceId: 'w' });
  source.dispose();
  expect(source.operations.getSnapshot()).toEqual([]);
  test.source.dispose();
});

it('offers a system workspace only when advertised and sends an explicit selection', async () => {
  const test = fixture();
  const agent = (await test.source.catalog.listAgents(undefined, signal())).items[0].ref;
  expect(
    (await test.source.catalog.listWorkspaces!(agent, undefined, signal())).items.some(
      (item) => item.kind === 'system',
    ),
  ).toBe(false);
  test.remote.listWorkspaces = async () => ({ items: [], systemWorkspace: true });
  const workspace = (await test.source.catalog.listWorkspaces!(agent, undefined, signal()))
    .items[0];
  expect(workspace.kind).toBe('system');
  expect(workspace).not.toHaveProperty('id');
  const draft = await test.source.catalog.prepareDraft(
    { agent, workspace: workspace.ref, draftId: 'system' as DraftId },
    signal(),
  );
  await draft.state.getSnapshot().start!.execute({ parts: [{ type: 'text', text: 'hello' }] });
  expect(test.remote.start).toHaveBeenCalledWith({
    agentId: 'a',
    draftId: 'system',
    workspace: { kind: 'system' },
    text: 'hello',
  });
  test.source.dispose();
});

test('selected catalog metadata does not observe history or expose unsupported row mutations', async () => {
  const { source, remote } = fixture();
  const ref = { source: source.ref, sessionId: 's' };
  expect(await source.catalog.readSession!(ref, signal())).toMatchObject({
    agentId: 'a',
    title: 'Conversation',
  });
  expect(remote.observe).not.toHaveBeenCalled();
  expect(source.catalog.previewSession?.(ref)).toBeUndefined();
  await expect(
    source.catalog.readSession!(
      { source: { kind: 'desktop', connectionId: 'other' }, sessionId: 's' },
      signal(),
    ),
  ).rejects.toMatchObject({ failure: { code: 'invalid-input' } });
  source.dispose();
});

test('metadata refs survive reconnect within a grant but never cross a replacement grant', async () => {
  const first = fixture('old');
  const catalog = await first.source.catalog.listAgents(undefined, signal());
  expect(catalog.items[0]).toMatchObject({ emoji: '🧑🏽‍💻' });
  first.source.dispose();
  const replacement = fixture('new');
  await expect(
    replacement.source.catalog.listSessions({ agent: catalog.items[0].ref }, undefined, signal()),
  ).resolves.toMatchObject({ items: [{ agentId: 'a' }] });
  const other = fixture('new-grant', 'other-binding');
  await expect(
    other.source.catalog.listSessions({ agent: catalog.items[0].ref }, undefined, signal()),
  ).rejects.toMatchObject({ failure: { code: 'invalid-input' } });
  replacement.source.dispose();
  other.source.dispose();
});

it('carries the rejected send explanation through both the action and its operation snapshot', async () => {
  const test = fixture();
  const command = {
    id: 'send',
    kind: 'send' as const,
    status: 'failed' as const,
    sessionId: 's',
    error: 'TARGET_UNAVAILABLE',
    errorMessage: 'Agent has no model configured',
  };
  test.remote.send = jest.fn(async () => command);
  test.remote.getCommands = () => [command];
  const handle = await test.source.openSession(address, signal());
  handle.activate();
  test.publish();
  const failure = {
    code: 'target-unavailable',
    detail: { code: 'TARGET_UNAVAILABLE', message: 'Agent has no model configured' },
  };
  expect(
    await handle.state
      .getSnapshot()
      .actions.send!.execute({ parts: [{ type: 'text', text: 'hello' }] }),
  ).toMatchObject({ state: 'rejected', failure });
  expect(handle.operations.getSnapshot()[0]).toMatchObject({ state: 'rejected', failure });
  handle.dispose();
  test.source.dispose();
});

test('shows the current remote agent model and distinguishes missing configuration from older hosts', async () => {
  const test = fixture();
  jest.mocked(test.remote.listAgents).mockResolvedValueOnce({
    items: [
      {
        id: 'configured',
        name: 'Agent',
        model: { modelId: 'model', providerId: 'desktop', name: 'Current model' },
      },
      { id: 'empty', name: 'Agent', model: null },
      { id: 'legacy', name: 'Agent' },
    ],
  });
  const catalog = await test.source.catalog.listAgents(undefined, signal());
  expect(catalog.items).toMatchObject([
    { id: 'configured', modelName: 'Current model', configuration: 'available' },
    { id: 'empty', configuration: 'unavailable' },
    { id: 'legacy', configuration: 'unknown' },
  ]);
  test.source.dispose();
});

it('opens a cached session before any RPC and keeps cached history separate from current actions', async () => {
  const test = fixture();
  const preview = {
    session,
    history: {
      items: [message('cached')],
      version: '1',
      readAt: 1,
      hasOlderMessages: false,
      complete: true,
    },
  };
  jest.mocked(test.remote.peekSession).mockReturnValue(preview);
  jest.mocked(test.remote.readSession).mockImplementation(() => new Promise(() => {}));
  const handle = await test.source.openSession(
    { source: { kind: 'desktop', connectionId: 'pc' }, sessionId: 's' },
    signal(),
  );
  expect(test.remote.readSession).not.toHaveBeenCalled();
  expect(handle.history.peekLatest?.()?.items[0].display.id).toBe('cached');
  expect(handle.state.getSnapshot().freshness.state).toBe('cached');
  expect(handle.state.getSnapshot().actions.send?.availability).toMatchObject({
    state: 'disabled',
    reason: 'synchronizing',
  });
  handle.dispose();
  test.source.dispose();
});

it.each(['offline', 'suspended'] as const)(
  'reopens cached history after %s recovery with the same epoch and revision',
  async (status) => {
    const test = fixture();
    test.setState({ status });
    jest.mocked(test.remote.peekSession).mockReturnValue({
      epoch: 'first',
      session,
      history: {
        items: [message('cached')],
        version: '1',
        readAt: 1,
        hasOlderMessages: true,
        complete: true,
      },
    });
    jest
      .mocked(test.remote.readSession)
      .mockRejectedValueOnce(
        Object.assign(new Error('unreachable'), { name: 'DesktopUnreachableError' }),
      );
    const handle = await test.source.openSession(address, signal());
    const release = handle.activate();
    const initial = handle.state.getSnapshot().historyVersion;
    await expect(handle.history.openLatest(signal())).rejects.toMatchObject({
      failure: { code: 'offline' },
    });

    test.setState({ status: 'ready' });
    test.publish({ ...test.snapshot, historyEpoch: 'first' });
    const recovered = handle.state.getSnapshot().historyVersion;
    expect(recovered).not.toBe(initial);
    const window = await handle.history.openLatest(signal());
    expect(window.initial.items.map((item) => item.key)).toEqual(['m2', 'm3']);
    const older = await window.read(window.initial.older!, signal());
    expect(older.items.map((item) => item.key)).toEqual(['m1']);

    test.setState({ status: 'ready' });
    test.publish({ ...test.snapshot, historyEpoch: 'first' });
    expect(handle.state.getSnapshot().historyVersion).toBe(recovered);
    window.dispose();
    release();
    handle.dispose();
    test.source.dispose();
  },
);

it('revalidates history after an epoch reset even when its persisted revision is unchanged', async () => {
  const test = fixture();
  const handle = await test.source.openSession(address, signal());
  const release = handle.activate();
  test.publish({ ...test.snapshot, historyEpoch: 'first' });
  const initial = handle.state.getSnapshot().historyVersion;
  test.publish({ ...test.snapshot, historyEpoch: 'first', current: false });
  expect(handle.state.getSnapshot().historyVersion).toBe(initial);
  test.publish({ ...test.snapshot, historyEpoch: 'second', current: false });
  expect(handle.state.getSnapshot().historyVersion).not.toBe(initial);
  expect(handle.state.getSnapshot().actions.send?.availability.state).toBe('disabled');
  release();
  handle.dispose();
  test.source.dispose();
});
