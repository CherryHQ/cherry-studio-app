import type { AgentMessageView } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import {
  createAgentMessageListProjectionCache,
  mergeAgentMessageViews,
  toAgentMessageListItem,
  toAgentMessageListItems,
} from '../agentMessageProjection';

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
    modelId: null,
    inferenceSnapshot: null,
    ...overrides,
  };
}

describe('agentMessageProjection', () => {
  test('projects presentation metadata captured for the individual message', () => {
    const modelId = createUniqueModelId('openai', 'gpt-5');
    const item = toAgentMessageListItem(
      message('assistant-model-snapshot', {
        inferenceSnapshot: {
          status: 'supported',
          snapshot: {
            version: 1,
            model: {
              uniqueModelId: modelId,
              providerId: 'openai',
              modelId: 'gpt-5',
              name: 'GPT-5',
            },
            parameters: {},
            tools: [],
          },
        },
        modelId,
      }),
    );

    expect(item).toMatchObject({
      createdAt: '2026-08-25T00:00:00.000Z',
      model: {
        id: modelId,
        modelId: 'gpt-5',
        name: 'GPT-5',
        providerId: 'openai',
      },
    });
  });

  test('projects the provider error message into the shared error renderer', () => {
    const item = toAgentMessageListItem(
      message('assistant-error', {
        parts: [
          {
            error: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (403): access denied',
              retryable: false,
              failure: {
                version: 1,
                reasonCode: 'permission',
                source: { layer: 'provider', code: 'access_denied' },
                context: { statusCode: 403, providerId: 'openai', modelId: 'gpt-test' },
              },
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
        partKeys: ['error-1'],
        parts: [
          {
            data: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (403): access denied',
              reasonCode: 'permission',
              retryable: false,
              source: { layer: 'provider', code: 'access_denied' },
              context: { statusCode: 403, providerId: 'openai', modelId: 'gpt-test' },
            },
            type: 'data-error',
          },
        ],
      },
      status: 'error',
    });
  });

  test('classifies historical flattened errors from their retained message', () => {
    const item = toAgentMessageListItem(
      message('assistant-legacy-error', {
        parts: [
          {
            error: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (429): too many requests',
              retryable: true,
            },
            id: 'error-legacy',
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
            data: { reasonCode: 'rate_limit', retryable: true },
            type: 'data-error',
          },
        ],
      },
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
        partKeys: ['reasoning-1', 'tool-1'],
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

  test('unwraps Runtime tool results for the shared tool renderers', () => {
    const item = toAgentMessageListItem(
      message('assistant-tool-result', {
        parts: [
          {
            displayName: 'Write file',
            id: 'tool-1',
            input: { filename: 'report.md' },
            output: {
              value: { status: 'created', fileEntryId: 'file-1' },
              artifacts: [
                {
                  ref: { kind: 'managed-file', fileEntryId: 'file-1' },
                  mediaType: 'text/markdown',
                  name: 'report.md',
                  kind: 'created',
                },
              ],
            },
            providerName: 'write_file',
            state: 'output-available',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'write_file' },
            type: 'tool',
          },
        ],
        status: 'success',
      }),
    );

    expect(item).toMatchObject({
      data: {
        parts: [
          {
            output: { status: 'created', fileEntryId: 'file-1' },
            toolName: 'write_file',
            type: 'dynamic-tool',
          },
        ],
      },
    });
  });

  test('projects builtin web lookup results as source URL parts', () => {
    const item = toAgentMessageListItem(
      message('assistant-web-sources', {
        parts: [
          {
            displayName: 'Web search',
            id: 'tool-1',
            input: { query: 'Cherry Studio' },
            output: {
              value: [
                {
                  content: 'Cherry Studio docs',
                  id: 'aaaa1111-1',
                  title: 'Cherry Studio',
                  url: 'https://cherry-ai.com',
                },
              ],
              artifacts: [],
            },
            providerName: 'web_search',
            state: 'output-available',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'web_search' },
            type: 'tool',
          },
          { id: 'text-1', state: 'done', text: 'Answer [cite:aaaa1111-1].', type: 'text' },
        ],
        status: 'success',
      }),
    );

    expect(item?.data.parts).toEqual([
      expect.objectContaining({ toolName: 'web_search', type: 'dynamic-tool' }),
      { state: 'done', text: 'Answer [cite:aaaa1111-1].', type: 'text' },
      {
        sourceId: 'aaaa1111-1',
        title: 'Cherry Studio',
        type: 'source-url',
        url: 'https://cherry-ai.com',
      },
    ]);
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

  test('structurally shares unchanged rows and parts across stream updates', () => {
    const cache = createAgentMessageListProjectionCache();
    const user = message('user-1', {
      parts: [{ id: 'user-text', state: 'done', text: 'Question', type: 'text' }],
      role: 'user',
      status: 'success',
    });
    const reasoning = {
      id: 'reasoning-1',
      state: 'streaming' as const,
      text: 'Thinking',
      type: 'reasoning' as const,
    };
    const streaming = message('assistant-1', { parts: [reasoning] });
    const first = toAgentMessageListItems([user, streaming], cache);
    const updated = message('assistant-1', {
      parts: [reasoning, { id: 'text-1', state: 'streaming', text: 'Answer', type: 'text' }],
    });
    const second = toAgentMessageListItems([user, updated], cache);

    expect(second).not.toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].data.parts?.[0]).toBe(first[1].data.parts?.[0]);
    expect(second[1].data.partKeys).toEqual(['reasoning-1', 'text-1']);
    expect(toAgentMessageListItems([user, updated], cache)).toBe(second);
  });

  test('omits system messages from the chat row projection', () => {
    expect(toAgentMessageListItem(message('system-1', { role: 'system' }))).toBeUndefined();
  });
});
