import type { ConversationMessage } from '@/frontend/appShell/conversation';

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
const select = (messages: ConversationMessage[], isCurrentWindow = true, sessionId = 'session') =>
  selectContextUsageSource({ sessionId, messages, isCurrentWindow });

test('retains the latest terminal measurement while an answer streams', () => {
  expect(select([row('old'), row('new', 'streaming')])?.messageId).toBe('old');
  expect(select([row('old'), row('new')])?.messageId).toBe('new');
});
test('does not fall back past a failed terminal or missing identity', () => {
  expect(select([row('old'), row('new', 'error')])).toBeUndefined();
  const missing = row('new');
  missing.display = { ...missing.display, model: undefined };
  expect(select([row('old'), missing])).toBeUndefined();
});
test('keeps a source without a measurement but isolates session and incomplete windows', () => {
  const missing = row('new');
  missing.display = { ...missing.display, stats: undefined };
  expect(select([missing])?.stats.contextTokens).toBeUndefined();
  expect(select([missing], false)).toBeUndefined();
  expect(select([missing], true, 'other')).toBeUndefined();
});
