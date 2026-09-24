import type { AgentMessageView } from '@/shared/contracts/agent';

import type { AgentSessionChatState } from '../AgentSessionChatClient';
import { createLocalConversationProjector } from '../localConversationView';

const message = (id: string, role: AgentMessageView['role'] = 'assistant'): AgentMessageView => ({
  id,
  role,
  sessionId: 'session',
  turnId: 'turn',
  status: 'success',
  parts: [{ id: `${id}-text`, type: 'text', text: id, state: 'done' }],
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  usage: null,
  stats: null,
  modelId: null,
  inferenceSnapshot: null,
});
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
const question = {
  turnId: 'turn',
  toolCallId: 'question',
  question: {
    question: 'Choose a focus',
    selection: 'single' as const,
    options: [
      { id: 'a', label: 'Writing', description: '' },
      { id: 'b', label: 'Reading', description: '' },
    ],
  },
};
function fixture(initial: Partial<AgentSessionChatState> = {}) {
  let state: AgentSessionChatState = {
    sessionId: 'session',
    status: 'ready',
    activeTurn: null,
    liveMessages: [],
    pendingApprovals: [],
    pendingQuestion: null,
    ...initial,
  };
  const client = {
    getState: () => state,
    cancelTurn: jest.fn(async () => undefined),
    respondApproval: jest.fn(async () => undefined),
    respondQuestion: jest.fn(async () => undefined),
    retryMessage: jest.fn(async () => undefined),
    forkSession: jest.fn(async () => ({ id: 'fork' }) as never),
    deleteTurn: jest.fn(async () => undefined),
  };
  const sessionChanged = jest.fn();
  const projector = createLocalConversationProjector({
    client,
    sessionId: 'session',
    onSessionChanged: sessionChanged,
  });
  return {
    client,
    projector,
    sessionChanged,
    get state() {
      return state;
    },
    set(next: Partial<AgentSessionChatState>) {
      state = { ...state, ...next };
    },
  };
}

test('a changed approval payload under the same id rejects the earlier decision', async () => {
  const f = fixture({ pendingApprovals: [approval] });
  const previous = f.projector.snapshot(f.state, undefined).interactions[0];
  expect(previous).toMatchObject({
    id: 'approval',
    execution: 'turn',
    kind: 'decision',
    input: { kind: 'inline', value: { kind: 'json', value: { path: 'first' } } },
  });
  f.set({ pendingApprovals: [{ ...approval, input: { path: 'replacement' } }] });
  expect(await previous.respond!.execute({ kind: 'approve' })).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  expect(f.client.respondApproval).not.toHaveBeenCalled();
  const current = f.projector.snapshot(f.state, undefined).interactions[0];
  expect(await current.respond!.execute({ kind: 'deny' })).toEqual({
    state: 'applied',
    value: undefined,
  });
  expect(f.client.respondApproval).toHaveBeenCalledWith('session', 'approval', 'deny');
});

test.each([
  { selectedOptionIds: ['a'], text: 'more context', skipped: false },
  { selectedOptionIds: [], text: '', skipped: true },
])('preserves a user answer through the bound question capability: %j', async (answer) => {
  const f = fixture({ pendingQuestion: question });
  const interaction = f.projector.snapshot(f.state, undefined).interactions[0];
  expect(interaction).toMatchObject({
    id: 'question',
    kind: 'question',
    input: { kind: 'inline', value: { kind: 'user-question', question: question.question } },
  });
  expect(await interaction.respond!.execute({ kind: 'user-answer', answer })).toEqual({
    state: 'applied',
    value: undefined,
  });
  expect(f.client.respondQuestion).toHaveBeenCalledWith('session', 'question', answer);
  f.set({ pendingQuestion: { ...question, turnId: 'replacement' } });
  expect(await interaction.respond!.execute({ kind: 'user-answer', answer })).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  expect(f.client.respondQuestion).toHaveBeenCalledTimes(1);
});

test('message actions follow the busy state and reuse projections while it is unchanged', async () => {
  const f = fixture();
  const answer = message('answer');
  const idle = f.projector.message(answer, f.state);
  expect(f.projector.message(answer, f.state)).toBe(idle);
  expect(idle.actions.retry?.availability).toEqual({ state: 'enabled' });
  expect(idle.actions.remove?.availability).toEqual({ state: 'enabled' });
  expect(await idle.actions.fork!.execute({ title: 'Copy' })).toEqual({
    state: 'applied',
    value: { source: { kind: 'local' }, sessionId: 'fork' },
  });
  expect(f.client.forkSession).toHaveBeenCalledWith('session', 'answer', 'Copy');
  expect(f.sessionChanged).toHaveBeenCalledWith('fork');
  f.set({
    activeTurn: { id: 'turn', status: 'running' } as AgentSessionChatState['activeTurn'],
  });
  const busy = f.projector.message(answer, f.state);
  expect(busy).not.toBe(idle);
  expect(busy.actions.retry?.availability).toEqual({ state: 'disabled', reason: 'busy' });
  expect(await idle.actions.retry!.execute()).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  expect(f.client.retryMessage).not.toHaveBeenCalled();
  expect(f.projector.message(message('user', 'user'), f.state).actions.retry).toBeUndefined();
  expect(f.projector.message(message('system', 'system'), f.state).actions).toEqual({});
});

test('cancellation targets the observed turn and the snapshot reports freshness from the client', async () => {
  const f = fixture({
    activeTurn: { id: 'turn', status: 'running' } as AgentSessionChatState['activeTurn'],
  });
  const running = f.projector.snapshot(f.state, 'Title');
  expect(running).toMatchObject({
    title: 'Title',
    freshness: { state: 'current' },
    executions: [{ id: 'turn', state: 'running' }],
  });
  f.set({ activeTurn: { id: 'other', status: 'running' } as AgentSessionChatState['activeTurn'] });
  expect(await running.executions[0].cancel!.execute()).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  f.set({ activeTurn: { id: 'turn', status: 'running' } as AgentSessionChatState['activeTurn'] });
  expect(await running.executions[0].cancel!.execute()).toEqual({
    state: 'applied',
    value: undefined,
  });
  expect(f.client.cancelTurn).toHaveBeenCalledWith('session');
  f.set({ status: 'error', error: new Error('offline'), activeTurn: null });
  expect(f.projector.snapshot(f.state, undefined)).toMatchObject({
    freshness: { state: 'unavailable', failure: { code: 'internal' } },
    executions: [],
  });
});
