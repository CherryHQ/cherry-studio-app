import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { AgentContextUsage } from '@/shared/contracts/agent';

import { selectContextUsageSource } from '../contextUsage';

function row(id: string, state: ConversationMessage['state'] = 'success'): ConversationMessage {
  return {
    key: id,
    state,
    completeness: 'complete',
    actions: {},
    display: {
      id,
      agentSessionId: 'session',
      role: 'assistant',
      status: 'success',
      data: {},
      model: {
        id: 'provider::model',
        modelId: 'provider-model',
        providerId: 'provider',
        name: 'Model',
      },
      stats: { contextTokens: 25 },
    },
  };
}
const select = (
  messages: ConversationMessage[],
  usages: AgentContextUsage[] = [],
  isCurrentWindow = true,
  sessionId = 'session',
) => selectContextUsageSource({ sessionId, messages, usages, isCurrentWindow });

test('uses the selected branch context, including a placed input while its answer streams', () => {
  const usages = [
    { messageId: 'old', tokens: 900 },
    { messageId: 'new', tokens: 100 },
    { messageId: 'other-branch', tokens: 5000 },
  ];
  expect(select([row('old'), row('new', 'streaming')], usages)).toMatchObject({
    messageId: 'new',
    tokens: 100,
  });
  expect(select([row('old')], usages)?.tokens).toBe(900);
});

test('updates after background compaction without changing the persisted answer statistics', () => {
  const messages = [row('answer')];
  expect(select(messages, [{ messageId: 'answer', tokens: 90_000 }])?.tokens).toBe(90_000);
  expect(select(messages, [{ messageId: 'answer', tokens: 12_000 }])?.tokens).toBe(12_000);
  expect(
    select(messages, [{ messageId: 'answer', tokens: 12_000, estimated: true }]),
  ).toMatchObject({
    tokens: 12_000,
    estimated: true,
  });
  expect(messages[0].display.stats?.contextTokens).toBe(25);
});

test('does not invent a context from old request statistics or another branch', () => {
  expect(select([row('answer')])).toBeUndefined();
  expect(select([row('old'), row('new')], [{ messageId: 'old', tokens: 900 }])).toBeUndefined();
  expect(
    select([row('old'), row('new', 'error')], [{ messageId: 'old', tokens: 900 }]),
  ).toBeUndefined();
  const missing = row('new');
  missing.display = { ...missing.display, model: undefined };
  expect(select([missing], [{ messageId: 'new', tokens: 100 }])).toBeUndefined();
});

test('isolates sessions and incomplete windows without requiring persisted input statistics', () => {
  const missing = row('new');
  missing.display = { ...missing.display, stats: undefined };
  const usages = [{ messageId: 'new', tokens: 0 }];
  expect(select([missing], usages)?.tokens).toBe(0);
  expect(select([missing], usages, false)).toBeUndefined();
  expect(select([missing], usages, true, 'other')).toBeUndefined();
});
