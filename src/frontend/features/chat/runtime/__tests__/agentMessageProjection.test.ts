import type { AgentMessageView } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import {
  createAgentMessageListProjectionCache,
  createPendingChatMessages,
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
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    ...overrides,
  };
}

describe('agentMessageProjection', () => {
  test('keeps the same inline plugin snapshot in pending and persisted user messages', () => {
    const pluginReferences = [
      { type: 'plugin' as const, pluginId: 'feishu', label: '飞书', offset: 0 },
    ];
    const input = { type: 'text' as const, text: '飞书 查找文档', pluginReferences };
    const [pending] = createPendingChatMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [input],
    });
    const persisted = toAgentMessageListItem(
      message('user-1', {
        role: 'user',
        status: 'success',
        parts: [{ ...input, id: 'input-0', state: 'done' }],
      }),
    );
    expect(persisted?.data.parts).toEqual(pending.data.parts);
    expect(pending.data.parts[0]).toEqual({
      type: 'text',
      text: input.text,
      state: 'done',
      providerMetadata: { cherry: { references: pluginReferences } },
    });
  });
  test('preserves the original tool failure code for localized correction hints', () => {
    const item = toAgentMessageListItem(
      message('tool-correction', {
        parts: [
          {
            id: 'correction',
            type: 'tool',
            toolCallId: 'call-1',
            toolRef: { source: 'meta', name: 'tool_call' },
            providerName: 'tool_call',
            displayName: 'Call tool',
            state: 'error',
            error: {
              code: 'EXECUTION_FAILED',
              message: 'Invalid arguments. Expected signature: ...',
              retryable: false,
              failure: {
                version: 1,
                reasonCode: 'invalid_input',
                source: { layer: 'tool', code: 'tool_input_invalid' },
              },
            },
          },
        ],
      }),
    );

    expect(item?.data.parts).toEqual([
      expect.objectContaining({
        state: 'output-error',
        errorCode: 'tool_input_invalid',
        errorText: 'Invalid arguments. Expected signature: ...',
      }),
    ]);
  });

  test('prefers materialized statistics over the basic usage projection', () => {
    const stats = { requestCount: 2, inputTokens: 200, totalTokens: 220 };
    const item = toAgentMessageListItem(
      message('materialized', {
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        stats,
      }),
    );

    expect(item?.stats).toBe(stats);
    expect(item?.stats).not.toHaveProperty('outputTokens');
  });

  test('keeps successful sources citable when the same web call also failed', () => {
    const error = { code: 'web_lookup_failed', message: 'Page B not found', retryable: false };
    const item = toAgentMessageListItem(
      message('partial-web', {
        status: 'success',
        parts: [
          {
            id: 'web-call',
            type: 'tool',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'web_fetch' },
            providerName: 'web_fetch',
            displayName: 'Fetch web page',
            state: 'error',
            error: { code: 'EXECUTION_FAILED', message: error.message, retryable: false },
            output: {
              value: {
                status: 'error',
                error,
                details: {
                  status: 'partial',
                  results: [
                    {
                      id: 'source-1',
                      title: 'Page A',
                      content: 'Body',
                      url: 'https://example.com/a',
                    },
                  ],
                  failures: [{ input: 'https://example.com/b', message: 'Not found' }],
                },
              },
              artifacts: [],
            },
          },
        ],
      }),
    );

    expect(item?.data.parts).toEqual([
      expect.objectContaining({ state: 'output-error', errorText: 'Page B not found' }),
      { type: 'source-url', sourceId: 'source-1', title: 'Page A', url: 'https://example.com/a' },
    ]);
  });

  test('keeps attachment reports keyed by persisted part identity and leaves old reports unknown', () => {
    const report = {
      mode: 'document-text' as const,
      sourceTruncated: true,
      requestTruncated: false,
      includedCharacters: 3,
    };
    const part = {
      id: 'input-document',
      type: 'file' as const,
      fileEntryId: '00000000-0000-7000-8000-000000000001',
      mediaType: 'application/pdf',
      name: 'report.pdf',
      purpose: 'input-attachment' as const,
    };
    const projected = toAgentMessageListItem(
      message('with-report', { role: 'user', parts: [{ ...part, attachmentReport: report }] }),
    );
    expect(projected?.data.attachmentReports).toEqual({ 'input-document': report });
    expect(projected?.data.partKeys).toEqual(['input-document']);
    expect(projected?.data.parts?.[0]).not.toHaveProperty('attachmentReport');
    expect(
      toAgentMessageListItem(message('old', { role: 'user', parts: [part] }))?.data,
    ).not.toHaveProperty('attachmentReports');
  });

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
        stats: {
          runtimeTiming: { startedAt: 1_000, completedAt: 2_000, spans: [] },
        },
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
      stats: {
        runtimeTiming: { startedAt: 1_000, completedAt: 2_000, spans: [] },
      },
    });
    expect(item).not.toHaveProperty('updatedAt');
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

  test('projects provider tool input generation before complete arguments arrive', () => {
    const item = toAgentMessageListItem(
      message('assistant-tool-input-streaming', {
        parts: [
          {
            displayName: 'Write file',
            id: 'tool-streaming',
            providerName: 'write_file',
            state: 'input-streaming',
            toolCallId: 'call-streaming',
            toolRef: { source: 'builtin', capabilityId: 'write_file' },
            type: 'tool',
          },
        ],
      }),
    );

    expect(item?.data.parts).toEqual([
      expect.objectContaining({
        input: undefined,
        state: 'input-streaming',
        toolCallId: 'call-streaming',
        toolName: 'write_file',
        type: 'dynamic-tool',
      }),
    ]);
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
