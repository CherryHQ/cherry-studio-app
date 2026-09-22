import type {
  AgentProtocol,
  AgentStartSessionInput,
  AgentSessionSnapshot,
  AgentSessionView,
} from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import type { AgentRef, DraftId } from '../../contracts';
import { createConversationReferences } from '../../conversationState';
import { createLocalConversationSource } from '../createLocalConversationSource';

const session: AgentSessionView = {
  id: 'session',
  agentId: 'agent',
  title: 'Conversation',
  executionTarget: { kind: 'local' },
  titleIsManual: false,
  forkBoundaryMessageId: null,
  forkedFromSessionId: null,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};
const snapshot: AgentSessionSnapshot = {
  session,
  agent: { id: 'agent', name: 'Agent' },
  activeTurn: null,
  activeUserMessage: null,
  streamingMessage: null,
  pendingApprovals: [],
  hasHistoryBeforeActiveTurn: false,
  capabilities: { attachments: true, reasoning: true, tools: true, approvals: true },
};
function fixture() {
  const unsubscribe = jest.fn();
  const protocol = {
    observeSession: jest.fn(async () => ({ snapshot, unsubscribe })),
    startSession: jest.fn(async (_input: AgentStartSessionInput) => session),
    submitMessage: jest.fn(async () => ({
      turnId: 'turn',
      userMessageId: 'message',
      assistantMessageId: 'answer',
    })),
    cancelTurn: jest.fn(),
  };
  const api = {
    get: jest.fn(async (path: string) => {
      if (path === '/agents/agent') return { id: 'agent', name: 'Agent', modelId: 'model' };
      if (path.endsWith('/messages')) return { items: [], nextCursor: 'older' };
      return session;
    }),
  };
  const { source } = createLocalConversationSource({
    agent: protocol as unknown as AgentProtocol,
    api: api as unknown as ApiClient,
  });
  const signal = new AbortController().signal;
  const agent = createConversationReferences(source.scope).issue<AgentRef>('agent', 'agent');
  return { source, protocol, api, signal, agent, unsubscribe };
}

test('opening a local handle does not observe; releasing observers never cancels execution', async () => {
  const f = fixture();
  const handle = await f.source.openSession(
    { source: f.source.ref, sessionId: 'session' },
    f.signal,
  );
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  const release = handle.activate();
  await handle.refresh(f.signal);
  expect(handle.state.getSnapshot().freshness).toEqual({ state: 'current' });
  release();
  release();
  handle.dispose();
  expect(f.unsubscribe).toHaveBeenCalled();
  expect(f.protocol.cancelTurn).not.toHaveBeenCalled();
  f.source.dispose();
});

test('retired callbacks cannot send through a replacement source', async () => {
  const f = fixture();
  const handle = await f.source.openSession(
    { source: f.source.ref, sessionId: 'session' },
    f.signal,
  );
  const send = handle.state.getSnapshot().actions.send!;
  f.source.dispose();
  expect(await send.execute({ parts: [{ type: 'text', text: 'late' }] })).toEqual({
    state: 'rejected',
    failure: { code: 'retired', retry: 'none' },
  });
  expect(f.protocol.submitMessage).not.toHaveBeenCalled();
});

test('foreign source and window refs cannot cross ownership boundaries', async () => {
  const f = fixture();
  const other = fixture();
  await expect(
    f.source.catalog.prepareDraft({ agent: other.agent, draftId: 'draft' as DraftId }, f.signal),
  ).rejects.toMatchObject({ failure: { code: 'invalid-input' } });
  const handle = await f.source.openSession(
    { source: f.source.ref, sessionId: 'session' },
    f.signal,
  );
  const first = await handle.history.openLatest(f.signal);
  const second = await handle.history.openLatest(f.signal);
  await expect(second.read(first.initial.older!, f.signal)).rejects.toMatchObject({
    failure: { code: 'invalid-input' },
  });
  first.dispose();
  await expect(first.read(first.initial.older!, f.signal)).rejects.toMatchObject({
    failure: { code: 'retired' },
  });
  f.source.dispose();
  other.source.dispose();
});

test('draft admission survives disposal and duplicate handles reuse the admitted first submission', async () => {
  const f = fixture();
  let finish!: (value: AgentSessionView) => void;
  f.protocol.startSession.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const draftId = 'draft' as DraftId;
  const draft = await f.source.catalog.prepareDraft({ agent: f.agent, draftId }, f.signal);
  const parts = [
    { type: 'text' as const, text: 'Hello' },
    { type: 'file' as const, fileEntryId: 'file', mediaType: 'text/plain', name: 'note.txt' },
  ];
  const submitted = draft.state.getSnapshot().start.execute({ parts });
  draft.dispose();
  const reopened = await f.source.catalog.prepareDraft({ agent: f.agent, draftId }, f.signal);
  const duplicate = reopened.state.getSnapshot().start.execute({ parts });
  await expect(
    reopened.state
      .getSnapshot()
      .start.execute({ parts: [{ type: 'text', text: 'different intent' }] }),
  ).resolves.toMatchObject({ state: 'rejected', failure: { code: 'idempotency-conflict' } });
  expect(f.protocol.startSession).toHaveBeenCalledTimes(1);
  expect(f.protocol.startSession.mock.calls[0][0]).toMatchObject({
    parts,
    executionTarget: { kind: 'local' },
  });
  finish(session);
  await expect(submitted).resolves.toMatchObject({
    state: 'applied',
    value: { conversation: { sessionId: 'session' } },
  });
  await expect(duplicate).resolves.toEqual(await submitted);
  expect(reopened.operations.getSnapshot()[0].state).toBe('applied');
  f.source.dispose();
});

test('a changed approval payload replaces its resource identity and rejects the old decision', async () => {
  const f = fixture();
  const approval = {
    id: 'approval',
    sessionId: 'session',
    turnId: 'turn',
    toolCallId: 'tool',
    toolRef: { source: 'builtin' as const, capabilityId: 'write' },
    displayName: 'Write',
    input: { path: 'first' },
    status: 'pending' as const,
  };
  f.protocol.observeSession.mockResolvedValue({
    snapshot: { ...snapshot, pendingApprovals: [approval] },
    unsubscribe: f.unsubscribe,
  });
  const handle = await f.source.openSession(
    { source: f.source.ref, sessionId: 'session' },
    f.signal,
  );
  const release = handle.activate();
  await handle.refresh(f.signal);
  const previous = handle.state.getSnapshot().interactions[0];
  expect(await handle.resources.read(previous.input, f.signal)).toMatchObject({
    value: { path: 'first' },
  });
  f.protocol.observeSession.mockResolvedValue({
    snapshot: { ...snapshot, pendingApprovals: [{ ...approval, input: { path: 'replacement' } }] },
    unsubscribe: f.unsubscribe,
  });
  await handle.refresh(f.signal);
  const current = handle.state.getSnapshot().interactions[0];
  expect(current.input).not.toBe(previous.input);
  await expect(handle.resources.read(previous.input, f.signal)).rejects.toMatchObject({
    failure: { code: 'resource-unavailable' },
  });
  expect(await previous.respond!.execute('approve')).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  expect(await handle.resources.read(current.input, f.signal)).toMatchObject({
    value: { path: 'replacement' },
  });
  release();
  f.source.dispose();
});
