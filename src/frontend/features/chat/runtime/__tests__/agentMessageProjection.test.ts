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
  test('projects the provider error message into the shared error renderer', () => {
    const item = toAgentMessageListItem(
      message('assistant-error', {
        parts: [
          {
            error: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (403): access denied',
              retryable: false,
            },
            id: 'error-1',
            type: 'error',
          },
        ],
        status: 'error',
      }),
    );

    expect(item).toMatchObject({
      data: {
        parts: [
          {
            data: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (403): access denied',
            },
            type: 'data-error',
          },
        ],
      },
      status: 'error',
    });
  });

  test('maps protocol parts and streaming state onto the shared message renderer shape', () => {
    const item = toAgentMessageListItem(
      message('assistant-1', {
        parts: [
          { id: 'reasoning-1', state: 'streaming', text: 'Thinking', type: 'reasoning' },
          {
            approvalId: 'approval-1',
            displayName: 'Read file',
            id: 'tool-1',
            input: { fileEntryId: 'file-1' },
            providerName: 'builtin_read_file_a1b2',
            state: 'awaiting-approval',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'read_file' },
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
            title: 'Read file',
            toolCallId: 'call-1',
            toolName: 'builtin_read_file_a1b2',
            type: 'dynamic-tool',
          },
        ],
      },
    });
  });

  test('projects a managed file reference into the shared unavailable-aware renderer', () => {
    const fileEntryId = '00000000-0000-7000-8000-000000000001';
    const item = toAgentMessageListItem(
      message('user-file', {
        parts: [
          {
            fileEntryId,
            id: 'input-0',
            mediaType: 'image/png',
            name: 'managed.png',
            purpose: 'input-attachment',
            type: 'file',
          },
        ],
        role: 'user',
        status: 'success',
      }),
    );

    expect(item?.data.parts).toEqual([
      expect.objectContaining({
        filename: 'managed.png',
        mediaType: 'image/png',
        providerMetadata: { cherry: { fileEntryId } },
        type: 'file',
        url: `cherry://file/${fileEntryId}`,
      }),
    ]);
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
