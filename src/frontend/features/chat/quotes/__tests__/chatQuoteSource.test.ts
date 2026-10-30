import type { AgentMessageView } from '@/shared/contracts/agent';

import { completeChatQuoteSource } from '../chatQuoteSource';

const source = {
  id: 'source',
  sessionId: 'A',
  role: 'assistant',
  status: 'success',
  parts: [{ id: 'p', type: 'text', text: 'Complete sibling', state: 'done' }],
} as AgentMessageView;
const client = { getState: () => ({ liveMessages: [source] }) };
test('an exact completed live sibling replaces only its pending durable projection', () => {
  expect(completeChatQuoteSource({ ...source, status: 'pending', parts: [] }, client, 'A')).toBe(
    source,
  );
  expect(completeChatQuoteSource(undefined, client, 'A')).toBeUndefined();
  expect(completeChatQuoteSource({ ...source, sessionId: 'B' }, client, 'A')).toBeUndefined();
  const unreadable = {
    ...source,
    parts: [
      {
        id: 'e',
        type: 'data-error',
        data: { code: 'MESSAGE_UNREADABLE', message: 'unsupported', retryable: false },
      },
    ],
  } as AgentMessageView;
  expect(completeChatQuoteSource(unreadable, client, 'A')).toBe(unreadable);
});
