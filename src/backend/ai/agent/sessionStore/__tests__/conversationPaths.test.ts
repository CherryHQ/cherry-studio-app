import {
  AgentConversationStateSchema,
  AgentMultiModelIdsSchema,
  conversationSelections,
  createConversationState,
  visibleConversationMessages,
  type AgentMessageView,
} from '@/shared/contracts/agent';

import { changeConversationPath } from '../conversationPaths';

const models = ['provider::a', 'provider::b', 'provider::c'] as const;
function message(id: string, pathId?: string): AgentMessageView {
  return {
    id,
    pathId,
    sessionId: 'session',
    turnId: id,
    role: 'assistant',
    status: 'success',
    parts: [],
    modelId: null,
    inferenceSnapshot: null,
    stats: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
}
function group(): AgentMessageView {
  return {
    ...message('group'),
    parts: [
      {
        id: 'tool',
        type: 'dynamic-tool',
        toolName: 'cherry_multi_model_reply',
        toolRef: { source: 'builtin', capabilityId: 'cherry_multi_model_reply' },
        toolCallId: 'call',
        title: 'Multi-model reply',
        state: 'output-available',
        input: {},
        output: {
          value: {
            kind: 'multi-model-reply',
            version: 1,
            candidates: models.map((modelId) => ({
              id: modelId,
              modelId,
              name: modelId,
              status: 'completed',
              text: `Answer ${modelId}`,
              reasoning: '',
              attempt: 1,
            })),
          },
          artifacts: [],
        },
      },
    ],
  };
}
const select = (candidateId: string) => ({
  action: 'select' as const,
  sessionId: 'session',
  messageId: 'group',
  candidateId,
});
const ids = (messages: AgentMessageView[], state: ReturnType<typeof createConversationState>) =>
  visibleConversationMessages(messages, state).map((message) => message.id);

describe('app-owned answer paths', () => {
  test('restores both existing suffixes when switching A → B → A → B', () => {
    const state = createConversationState();
    state.paths[0].adopted.group = models[0];
    const history = [group(), message('a-question'), message('a-answer')];
    const b = changeConversationPath(state, history, select(models[1]), 'b');
    expect(ids(history, b)).toEqual(['group']);
    history.push(message('b-question', 'b'), message('b-answer', 'b'));
    const a = changeConversationPath(b, history, select(models[0]), 'unused');
    expect(ids(history, a)).toEqual(['group', 'a-question', 'a-answer']);
    const restored = changeConversationPath(a, history, select(models[1]), 'also-unused');
    expect(ids(history, restored)).toEqual(['group', 'b-question', 'b-answer']);
    expect(conversationSelections(restored).group).toBe(models[1]);
    expect(state.paths).toHaveLength(1);
  });

  test('keeps an empty candidate path distinct so selecting it again restores its adoption', () => {
    const state = createConversationState();
    state.paths[0].adopted.group = models[0];
    const history = [group()];
    const b = changeConversationPath(state, history, select(models[1]), 'b');
    const c = changeConversationPath(b, history, select(models[2]), 'c');
    const again = changeConversationPath(c, history, select(models[1]), 'unused');
    expect(again.activePathId).toBe('b');
    expect(conversationSelections(again).group).toBe(models[1]);
  });

  test('forks from an inherited answer and excludes both parent and ancestor suffixes', () => {
    const state = createConversationState();
    const history = [message('first'), message('second')];
    const parent = changeConversationPath(
      state,
      history,
      {
        action: 'continue',
        sessionId: 'session',
        messageId: 'second',
      },
      'parent',
    );
    history.push(message('parent-tail', 'parent'));
    const child = changeConversationPath(
      parent,
      history,
      {
        action: 'continue',
        sessionId: 'session',
        messageId: 'first',
      },
      'child',
    );
    history.push(message('child-tail', 'child'));
    expect(ids(history, child)).toEqual(['first', 'child-tail']);
    const restored = changeConversationPath(
      child,
      history,
      { action: 'restore', sessionId: 'session', pathId: 'parent' },
      'unused',
    );
    expect(ids(history, restored)).toEqual(['first', 'second', 'parent-tail']);
  });

  test('initial adoption needs no extra path and never changes the recorded tool result', () => {
    const original = group();
    const serialized = JSON.stringify(original);
    const state = changeConversationPath(undefined, [original], select(models[0]), 'unused');
    expect(state.paths).toHaveLength(1);
    expect(conversationSelections(state).group).toBe(models[0]);
    expect(JSON.stringify(original)).toBe(serialized);
    expect(AgentConversationStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  test('rejects unavailable answers and duplicate or singleton multi-model requests', () => {
    expect(() => changeConversationPath(undefined, [group()], select('missing'), 'x')).toThrow();
    expect(AgentMultiModelIdsSchema.safeParse([models[0]]).success).toBe(false);
    expect(AgentMultiModelIdsSchema.safeParse([models[0], models[0]]).success).toBe(false);
    expect(AgentMultiModelIdsSchema.parse([...models])).toEqual(models);
  });
});
