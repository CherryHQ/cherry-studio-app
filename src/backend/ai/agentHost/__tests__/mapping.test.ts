import type { AgentMessageView } from '@/shared/contracts/agent';

import { toRuntimeHistory } from '../mapping';

const TIMESTAMP = '2026-08-25T00:00:00.000Z';

describe('Agent Host mappings', () => {
  test('replays a denied tool call as a non-error tool result', () => {
    const message: AgentMessageView = {
      id: 'assistant-message',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      parts: [
        {
          id: 'tool-call-1',
          type: 'tool',
          toolCallId: 'call-1',
          toolName: 'delete_file',
          state: 'denied',
          input: { path: '/tmp/a' },
          output: { status: 'denied', reason: 'The user denied this tool call.' },
        },
      ],
      usage: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };

    expect(toRuntimeHistory([message])).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'delete_file',
            input: { path: '/tmp/a' },
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            output: { status: 'denied', reason: 'The user denied this tool call.' },
            isError: false,
          },
        ],
      },
    ]);
  });
});
