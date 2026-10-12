import type { AssistantMessage, Message } from '@earendil-works/pi-ai';

import { piToolBudgetState } from '../piToolBudget';

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
});
