import type { AgentMessageView } from '@/shared/contracts/agent';

import { mergeAgentMessageViews, toAgentMessageListItem } from '../agentMessageProjection';

function message(id: string, overrides: Partial<AgentMessageView> = {}): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id,
    parts: [],
    role: 'assistant',
    sessionId: 'session-1',
    status: 'streaming',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    ...overrides,
  };
}

describe('agentMessageProjection', () => {
  test('maps protocol parts and streaming state onto the shared message renderer shape', () => {
    const item = toAgentMessageListItem(
      message('assistant-1', {
        parts: [
          { id: 'reasoning-1', state: 'streaming', text: 'Thinking', type: 'reasoning' },
          {
            approvalId: 'approval-1',
            id: 'tool-1',
            input: { path: '/tmp/a' },
            state: 'awaiting-approval',
            toolCallId: 'call-1',
            toolName: 'read_file',
            type: 'tool',
          },
        ],
      }),
    );

    expect(item).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      status: 'pending',
      data: {
        parts: [
          { state: 'streaming', text: 'Thinking', type: 'reasoning' },
          {
            approval: { id: 'approval-1' },
            state: 'approval-requested',
            toolCallId: 'call-1',
            toolName: 'read_file',
            type: 'dynamic-tool',
          },
        ],
      },
    });
  });

  test('replaces persisted rows by id and appends only new live rows', () => {
    const persistedUser = message('user-1', { role: 'user', status: 'success' });
    const persistedAssistant = message('assistant-1', { status: 'pending' });
    const finalizedAssistant = message('assistant-1', { status: 'success' });
    const nextUser = message('user-2', { role: 'user', status: 'success' });

    expect(
      mergeAgentMessageViews([persistedUser, persistedAssistant], [finalizedAssistant, nextUser]),
    ).toEqual([persistedUser, finalizedAssistant, nextUser]);
  });

  test('omits system messages from the chat row projection', () => {
    expect(toAgentMessageListItem(message('system-1', { role: 'system' }))).toBeUndefined();
  });
});
