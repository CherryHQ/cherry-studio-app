import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, Harness, MemoryStorage, type TaskId } from '@earendil-works/pi-durable';

import { admitPiToolCall, PiToolBudget, piToolBudgetState } from '../piToolBudget';

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const budget = { maxToolCalls: 3, maxToolSteps: 2 };

function user(text: string): Message {
  return { role: 'user', content: text, timestamp: 1 };
}
function step(calls: number): AssistantMessage {
  return {
    role: 'assistant',
    api: 'openai-responses',
    provider: 'provider',
    model: 'model',
    content: Array.from({ length: calls }, (_, index) => ({
      type: 'toolCall' as const,
      id: `call-${index}`,
      name: 'lookup',
      arguments: {},
    })),
    stopReason: 'toolUse',
    timestamp: 1,
    usage,
  };
}

describe('Pi tool budget', () => {
  test('counts only the run started by the latest user input', () => {
    expect(piToolBudgetState([user('a'), step(1), step(1), user('b')], budget)).toBe('available');
    expect(piToolBudgetState([user('b'), step(1)], budget)).toBe('available');
  });

  test('asks for a final answer at the step or call limit', () => {
    expect(piToolBudgetState([user('a'), step(1), step(1)], budget)).toBe('final-response');
    expect(piToolBudgetState([user('a'), step(3)], budget)).toBe('final-response');
  });

  test('a tool step after the final request exceeds the budget', () => {
    expect(piToolBudgetState([user('a'), step(3), step(1)], budget)).toBe('exceeded');
    expect(piToolBudgetState([user('a'), step(1), step(1), step(1)], budget)).toBe('exceeded');
  });

  test('nested calls consume the current allowance without being attributed to every earlier step', () => {
    expect(piToolBudgetState([user('a'), step(1)], budget, 2)).toBe('final-response');
    expect(
      piToolBudgetState([user('a'), step(1), step(1)], { maxToolCalls: 5, maxToolSteps: 20 }, 3),
    ).toBe('final-response');
  });

  test('atomic admission deduplicates resumed children and shares the model allowance', async () => {
    const harness = await Harness.open(
      new MemoryStorage(),
      {
        registry: createRegistry(),
        models: createModels({
          authContext: { env: async () => undefined, fileExists: async () => false },
        }),
      },
      BACKGROUND_CONTEXT,
    );
    try {
      const conversation = await harness.createConversation(
        { ownership: { kind: 'ownerless' } },
        BACKGROUND_CONTEXT,
      );
      const child = (id: string) => ({
        id,
        name: 'lookup',
        type: 'toolCall' as const,
        arguments: {},
        parent: { taskId: 1 as TaskId, callId: 'parent' },
      });
      const admitted = await Promise.all(
        Array.from({ length: 65 }, (_, index) =>
          admitPiToolCall(conversation, BACKGROUND_CONTEXT, 1, child(`child-${index}`), ['parent']),
        ),
      );
      expect(admitted.filter(Boolean)).toHaveLength(63);
      expect(
        await admitPiToolCall(conversation, BACKGROUND_CONTEXT, 1, child('child-0'), ['parent']),
      ).toBe(true);
      expect(
        (await harness.snapshot(PiToolBudget, conversation.id, BACKGROUND_CONTEXT))?.nestedCalls,
      ).toHaveLength(63);
      expect(
        await admitPiToolCall(conversation, BACKGROUND_CONTEXT, 2, child('new-child'), [
          'new-parent',
        ]),
      ).toBe(true);
      expect(
        await harness.snapshot(PiToolBudget, conversation.id, BACKGROUND_CONTEXT),
      ).toMatchObject({
        inputId: 2,
        modelCalls: ['new-parent'],
        nestedCalls: ['new-child'],
        failedGroups: [],
      });
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });
});
