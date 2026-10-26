import type { AgentMessageView } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

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
  requester: { assistantMessageId: 'answer', modelId: 'provider::model', modelName: 'Model' },
};
const question = {
  turnId: 'turn',
  toolCallId: 'question',
  question: {
    questions: [
      {
        id: 'focus',
        question: 'Choose a focus',
        selection: 'single' as const,
        options: [
          { id: 'a', label: 'Writing' },
          { id: 'b', label: 'Reading' },
        ],
      },
    ],
  },
};
function fixture(initial: Partial<AgentSessionChatState> = {}) {
  let state: AgentSessionChatState = {
    sessionId: 'session',
    status: 'ready',
    activeTurn: null,
    queuedInputs: [],
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
    selectMessage: jest.fn(async () => ({ id: 'session' }) as never),
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

test('a queued-only session blocks history edits while leaving its queue outside execution controls', () => {
  const row = message('answer');
  const f = fixture({
    queuedInputs: [
      { turnId: 'waiting', userMessage: message('waiting', 'user'), assistantMessageId: 'pending' },
    ],
  });
  const projected = f.projector.message(row, f.state);
  expect(projected.actions.remove?.availability).toEqual({ state: 'disabled', reason: 'busy' });
  expect(f.projector.snapshot(f.state, undefined).executions).toEqual([]);
});

test('1470: a changed approval payload under the same id rejects the earlier decision', async () => {
  const f = fixture({ pendingApprovals: [approval] });
  const previous = f.projector.snapshot(f.state, undefined).interactions[0];
  expect(previous).toMatchObject({
    id: 'approval',
    execution: 'turn',
    requester: approval.requester,
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

test('health sharing identifies the executing turn model and never matches an MCP name collision', () => {
  const assistant = {
    ...message('answer'),
    inferenceSnapshot: {
      status: 'supported' as const,
      snapshot: {
        version: 1 as const,
        model: {
          uniqueModelId: 'openai::gpt-test' as never,
          providerId: 'openai',
          modelId: 'gpt-test',
          name: 'Test',
        },
        parameters: {},
        tools: [],
      },
    },
  };
  const healthApproval = {
    ...approval,
    toolRef: { source: 'builtin' as const, capabilityId: 'health_get_summary' },
  };
  const f = fixture({ liveMessages: [assistant], pendingApprovals: [healthApproval] });
  expect(f.projector.snapshot(f.state, undefined).interactions[0].healthDataSharing).toEqual({
    providerId: 'openai',
  });
  f.set({ liveMessages: [] });
  expect(f.projector.snapshot(f.state, undefined).interactions[0].healthDataSharing).toEqual({
    providerId: null,
  });
  f.set({
    pendingApprovals: [
      {
        ...approval,
        toolRef: { source: 'mcp', serverId: 'server', rawToolName: 'health_get_summary' },
      },
    ],
  });
  expect(
    f.projector.snapshot(f.state, undefined).interactions[0].healthDataSharing,
  ).toBeUndefined();
});

test.each(
  [
    { selectedOptionIds: ['a'], text: 'more context', skipped: false },
    { selectedOptionIds: [], text: '', skipped: true },
  ].map((item) => ({ answers: [{ questionId: 'focus', ...item }] })),
)('preserves a user answer through the bound question capability: %j', async (answer) => {
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

test('rejects a batch response after any question in the bound payload changes', async () => {
  const batch = {
    ...question,
    question: {
      questions: [
        { ...question.question.questions[0], id: 'first' },
        { ...question.question.questions[0], id: 'second' },
      ],
    },
  };
  const f = fixture({ pendingQuestion: batch });
  const interaction = f.projector.snapshot(f.state, undefined).interactions[0];
  const answer = {
    answers: batch.question.questions.map(({ id }) => ({
      questionId: id,
      selectedOptionIds: ['a'],
      text: '',
      skipped: false,
    })),
  };
  expect(await interaction.respond!.execute({ kind: 'user-answer', answer })).toMatchObject({
    state: 'applied',
  });
  expect(f.client.respondQuestion).toHaveBeenCalledWith('session', 'question', answer);
  f.set({
    pendingQuestion: {
      ...batch,
      question: {
        questions: [
          batch.question.questions[0],
          { ...batch.question.questions[1], question: 'Changed?' },
        ],
      },
    },
  });
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
  const modelId = createUniqueModelId('provider', 'other');
  expect(await idle.actions.answerWith!.execute({ modelId })).toEqual({
    state: 'applied',
    value: undefined,
  });
  expect(f.client.retryMessage).toHaveBeenCalledWith({
    sessionId: 'session',
    messageId: 'answer',
    modelId,
  });
  f.client.retryMessage.mockClear();
  f.set({
    activeTurn: { id: 'turn', status: 'running' } as AgentSessionChatState['activeTurn'],
  });
  const busy = f.projector.message(answer, f.state);
  expect(busy).not.toBe(idle);
  expect(busy.actions.retry?.availability).toEqual({ state: 'disabled', reason: 'busy' });
  expect(busy.actions.answerWith?.availability).toEqual({ state: 'disabled', reason: 'busy' });
  expect(await idle.actions.retry!.execute()).toMatchObject({
    state: 'rejected',
    failure: { code: 'conflict' },
  });
  expect(f.client.retryMessage).not.toHaveBeenCalled();
  expect(f.projector.message(message('user', 'user'), f.state).actions.retry).toBeUndefined();
  expect(f.projector.message(message('user', 'user'), f.state).actions.answerWith).toBeUndefined();
  expect(f.projector.message(message('system', 'system'), f.state).actions).toEqual({});
});

test('history keeps its rows while live state streams and refreshes them when busy state changes', () => {
  const f = fixture({
    activeTurn: { id: 'turn', status: 'running' } as AgentSessionChatState['activeTurn'],
  });
  const history = [message('first'), message('second')];
  const streaming = f.projector.history(history, f.state);
  f.set({ liveMessages: [message('live')] });
  expect(f.projector.history(history, f.state)).toBe(streaming);

  f.set({ activeTurn: null });
  const idle = f.projector.history(history, f.state);
  expect(idle).not.toBe(streaming);
  expect(idle[0].actions.retry?.availability).toEqual({ state: 'enabled' });
  expect(f.projector.history([...history], f.state)).toEqual(idle);
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

test('1470: same-turn actions preserve requester and reject a settled sibling action', async () => {
  const other = {
    ...approval,
    id: 'b',
    requester: { ...approval.requester, assistantMessageId: 'b', modelId: 'other' },
  };
  const f = fixture({ pendingApprovals: [approval, other] });
  const actions = f.projector.snapshot(f.state, undefined).interactions;
  expect(actions).toMatchObject([
    { requester: approval.requester },
    { requester: other.requester },
  ]);
  f.set({ pendingApprovals: [other] });
  expect(await actions[0]!.respond!.execute({ kind: 'approve' })).toMatchObject({
    state: 'rejected',
  });
  expect(await actions[1]!.respond!.execute({ kind: 'approve' })).toMatchObject({
    state: 'applied',
  });
  expect(f.client.respondApproval).toHaveBeenCalledWith('session', 'b', 'approve');
});
