import type { AgentMessageView } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import {
  createAgentMessageListProjectionCache,
  createPendingChatMessages,
  mergeAgentMessageViews,
  projectRetryingMessage,
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
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    ...overrides,
  };
}

describe('agentMessageProjection', () => {
  test('a stale history page cannot replace newer message-owned translations', () => {
    const older = {
      sourceHash: 'a'.repeat(64),
      results: { 'zh-CN': { content: '旧译文', createdAt: 1 } },
    };
    const newer = {
      sourceHash: 'a'.repeat(64),
      results: { 'zh-CN': { content: '新译文', createdAt: 2 } },
    };
    const persisted = message('answer', { status: 'success', translations: older });
    const live = message('answer', {
      status: 'success',
      translations: newer,
      updatedAt: '2026-08-25T00:00:01.000Z',
    });
    expect(mergeAgentMessageViews([persisted], [live])[0]).toBe(live);
  });
  test('keeps newly persisted translations when an older live snapshot covers the same message', () => {
    const translations = {
      sourceHash: 'a'.repeat(64),
      results: { 'zh-CN': { content: '译文', createdAt: 1 } },
    };
    const persisted = message('answer', { status: 'success', translations });
    const live = message('answer', { status: 'success' });
    const merged = mergeAgentMessageViews([persisted], [live]);
    expect(toAgentMessageListItem(merged[0])?.data.translations).toEqual(translations);
    expect(merged[0].parts).toBe(live.parts);
    expect(live.translations).toBeUndefined();
  });
  test.each(['output-available', 'denied'] as const)(
    'preserves canonical MCP identity for %s tools with opaque runtime names',
    (state) => {
      const source = { serverId: 'server-1', connectionKey: `remote:${'a'.repeat(64)}` };
      const app = {
        ...source,
        agentId: 'agent-1',
        toolName: 'show_dashboard',
        resourceUri: 'ui://acceptance/dashboard',
      };
      const value = { content: [{ type: 'text', text: 'Dashboard ready' }] };
      const item = toAgentMessageListItem(
        message('assistant-mcp', {
          status: 'success',
          parts: [
            {
              id: 'tool-1',
              type: 'dynamic-tool',
              toolCallId: 'call-1',
              toolName: 'mcp_show_dashboard_0z77llj',
              toolRef: { source: 'mcp', serverId: 'server-1', rawToolName: 'show_dashboard' },
              title: 'show_dashboard',
              input: {},
              state,
              ...(state === 'output-available'
                ? { output: { value, artifacts: [], mcpSource: source, mcpApp: app } }
                : {}),
            },
          ],
        }),
      );

      expect(item?.data.parts?.[0]).toMatchObject({
        toolMetadata: { cherry: { tool: { type: 'mcp', serverId: 'server-1' } } },
        state: state === 'denied' ? 'output-denied' : state,
        ...(state === 'output-available' ? { output: value, mcpSource: source, mcpApp: app } : {}),
      });
    },
  );

  test('running tool rows retain live child progress for rendering', () => {
    const progress = {
      calls: [{ id: 'call/c1', name: 'read_file', args: '{}', status: 'running' as const }],
    };
    const item = toAgentMessageListItem(
      message('assistant', {
        parts: [
          {
            id: 'call',
            type: 'dynamic-tool',
            toolCallId: 'call',
            toolName: 'codemode',
            title: 'JavaScript',
            toolRef: { source: 'builtin', capabilityId: 'run_js' },
            state: 'running',
            progress,
          },
        ],
      }),
    );
    expect(item?.data.parts?.[0]).toMatchObject({ state: 'input-available', progress });
    expect(item?.data.parts?.[0]).not.toHaveProperty('output');
  });

  test.each(['streaming', 'success'] as const)(
    'joins restored reasoning summaries without changing source history, status=%s',
    (status) => {
      const first = '**我准备穷举验证数字排列**\n\n**我构造双重穷举校验**\n\n**我枚举全部排列**';
      const second = '**Refining search bounds**\n\n**Preparing validation output**';
      const parts: AgentMessageView['parts'] = [
        { id: 'opaque', type: 'reasoning', text: '', state: 'done' },
        {
          id: 'summary-1',
          type: 'reasoning',
          text: first,
          state: 'done',
        },
        {
          id: 'summary-2',
          type: 'reasoning',
          text: second,
          state: 'done',
        },
        {
          id: 'tool',
          type: 'dynamic-tool',
          title: 'Run JavaScript',
          toolCallId: 'js-call',
          toolName: 'run_js',
          toolRef: { source: 'builtin', capabilityId: 'run_js' },
          input: { code: '1 + 1' },
          output: { value: 2, artifacts: [] },
          state: 'output-available',
        },
        {
          id: 'summary-3',
          type: 'reasoning',
          text: '**Checking A>399 solutions**',
          state: 'done',
        },
        { id: 'empty', type: 'reasoning', text: '\n \t', state: 'done' },
        { id: 'answer', type: 'text', text: '168 solutions.', state: 'done' },
      ];
      const original = JSON.parse(JSON.stringify(parts));
      const item = toAgentMessageListItem(message('restored', { parts, status }));

      expect(item?.data.partKeys).toEqual(['summary-1', 'tool', 'summary-3', 'answer']);
      expect(item?.data.parts).toEqual([
        {
          type: 'reasoning',
          text: `${first}\n\n${second}`,
          state: 'done',
        },
        expect.objectContaining({ type: 'dynamic-tool', toolCallId: 'js-call' }),
        { type: 'reasoning', text: '**Checking A>399 solutions**', state: 'done' },
        { type: 'text', text: '168 solutions.', state: 'done' },
      ]);
      expect(parts).toEqual(original);
    },
  );

  test('keeps an existing summary active without an empty disclosure or mutating cached parts', () => {
    const cache = createAgentMessageListProjectionCache();
    const summary = {
      id: 'summary',
      type: 'reasoning' as const,
      text: 'Received summary.',
      state: 'done' as const,
    };
    const settled = toAgentMessageListItem(
      message('settled', { parts: [summary], status: 'success' }),
      cache,
    );
    const growing = toAgentMessageListItem(
      message('growing', {
        parts: [summary, { id: 'next', type: 'reasoning', text: '', state: 'streaming' }],
      }),
      cache,
    );

    expect(growing?.data.partKeys).toEqual(['summary']);
    expect(growing?.data.parts).toEqual([
      { type: 'reasoning', text: 'Received summary.', state: 'streaming' },
    ]);
    expect(settled?.data.parts).toEqual([
      { type: 'reasoning', text: 'Received summary.', state: 'done' },
    ]);
  });

  test.each([false, true])(
    'keeps empty reasoning visible only while streaming, after a completed tool=%s',
    (afterTool) => {
      const cache = createAgentMessageListProjectionCache();
      const precedingParts: AgentMessageView['parts'] = afterTool
        ? [
            {
              id: 'tool',
              type: 'dynamic-tool',
              title: 'Run JavaScript',
              toolCallId: 'js-call',
              toolName: 'run_js',
              toolRef: { source: 'builtin', capabilityId: 'run_js' },
              input: { code: '1 + 1' },
              output: { value: 2, artifacts: [] },
              state: 'output-available',
            },
          ]
        : [];
      const reasoning = { id: 'reasoning', type: 'reasoning' as const, text: '' };
      const growing = toAgentMessageListItem(
        message('assistant', {
          parts: [...precedingParts, { ...reasoning, state: 'streaming' }],
        }),
        cache,
      );
      const settled = toAgentMessageListItem(
        message('assistant', {
          parts: [...precedingParts, { ...reasoning, state: 'done' }],
        }),
        cache,
      );

      expect(growing?.data.partKeys).toEqual([
        ...precedingParts.map((part) => part.id),
        'reasoning',
      ]);
      expect(growing?.data.parts?.at(-1)).toEqual({
        type: 'reasoning',
        text: '',
        state: 'streaming',
      });
      expect(settled?.data.partKeys).toEqual(precedingParts.map((part) => part.id));
      expect(settled?.data.parts).toEqual(growing?.data.parts?.slice(0, -1));
    },
  );

  test('reopened cancelled answers hide the legacy abort error while retaining unrelated failures', () => {
    const parts: AgentMessageView['parts'] = [
      { id: 'text', type: 'text', text: 'Partial answer', state: 'done' },
      {
        id: 'legacy-abort',
        type: 'data-error',
        data: {
          code: 'EXECUTION_FAILED',
          message: 'The Agent run ended without an answer.',
          retryable: false,
          failure: {
            version: 1,
            reasonCode: 'unknown',
            source: { layer: 'runtime', code: 'aborted' },
          },
        },
      },
      {
        id: 'failure',
        type: 'data-error',
        data: { code: 'EXECUTION_FAILED', message: 'Request failed', retryable: true },
      },
    ];
    const item = toAgentMessageListItem(message('cancelled', { status: 'cancelled', parts }));
    expect(item?.status).toBe('paused');
    expect(item?.data.partKeys).toEqual(['text', 'failure']);
    expect(
      toAgentMessageListItem(message('failed', { status: 'error', parts }))?.data.partKeys,
    ).toEqual(['text', 'legacy-abort', 'failure']);
  });
  test('renders a retrying answer as an empty pending row and leaves the rest untouched', () => {
    const question = message('user-1', { role: 'user', status: 'success' });
    const answer = message('assistant-1', {
      status: 'error',
      parts: [{ id: 'text-1', type: 'text', state: 'done', text: 'Broken answer' }],
    });

    const projected = projectRetryingMessage([question, answer], 'assistant-1');

    expect(projected[0]).toBe(question);
    expect(projected[1]).toMatchObject({ id: 'assistant-1', status: 'pending', parts: [] });
    // Nothing to project once admission settles or when the row is off-window.
    expect(projectRetryingMessage([question, answer], undefined)).toEqual([question, answer]);
    expect(projectRetryingMessage([question], 'assistant-1')).toEqual([question]);
  });

  test('preserves compaction identity, data and position in live and reopened history', () => {
    const anchor = {
      id: 'compaction-anchor:turn-1:1',
      type: 'data-compaction-anchor' as const,
      data: { phase: 'in-loop' as const, status: 'compacting' as const },
    };
    const original = message('assistant-1', {
      parts: [anchor, { id: 'answer', type: 'text', text: 'Answer', state: 'done' }],
    });
    const cache = createAgentMessageListProjectionCache();
    const live = toAgentMessageListItem(original, cache);
    const completed = {
      ...anchor,
      data: { ...anchor.data, status: 'done' as const, preTokens: 100_000, postTokens: 20_000 },
    };
    const reopened = toAgentMessageListItem(
      { ...original, status: 'success', parts: [completed, original.parts[1]] },
      cache,
    );
    expect(reopened?.data.partKeys).toEqual(live?.data.partKeys);
    expect(reopened?.data.parts?.[0]).toEqual(completed);
    expect(reopened?.data.parts?.[1]).toBe(live?.data.parts?.[1]);
  });

  test('keeps image request settings on pending and reopened assistant messages', () => {
    const imageGeneration = { mode: 'generate' as const, paramValues: { aspectRatio: '16:9' } };
    const [, pending] = createPendingChatMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ type: 'text', text: 'Draw a cherry' }],
      imageGeneration,
    });
    const restored = toAgentMessageListItem(
      message('assistant-1', {
        inferenceSnapshot: {
          status: 'supported',
          snapshot: {
            version: 1,
            model: {
              uniqueModelId: createUniqueModelId('provider', 'image'),
              providerId: 'provider',
              modelId: 'image',
              name: 'Image',
            },
            parameters: {},
            tools: [],
            imageGeneration,
          },
        },
      }),
    );
    expect(pending.imageGeneration).toEqual(imageGeneration);
    expect(restored?.imageGeneration).toEqual(pending.imageGeneration);
    expect(restored?.status).toBe('pending');
  });

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
    expect(pending.data.parts).toEqual([
      {
        type: 'text',
        text: input.text,
        state: 'done',
        providerMetadata: { cherry: { references: pluginReferences } },
      },
    ]);
  });
  test('keeps Skill inline ranges in pending and reopened messages alongside activation receipts', () => {
    const skillId = '00000000-0000-4000-8000-000000000001';
    const skillReferences = [{ type: 'skill' as const, skillId, label: 'grill-me', offset: 0 }];
    const input = { type: 'text' as const, text: 'grill-me ask about launch', skillReferences };
    const [pending] = createPendingChatMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [input],
    });
    const selection = {
      skillId,
      name: 'grill-me',
      contentHash: 'accepted',
      origin: 'explicit' as const,
    };
    const persisted = toAgentMessageListItem(
      message('user-1', {
        role: 'user',
        status: 'success',
        parts: [{ ...input, id: 'input-0', state: 'done', skillSelections: [selection] }],
      }),
    );
    expect(pending.data.parts?.[0]).toMatchObject({
      text: input.text,
      providerMetadata: { cherry: { references: skillReferences } },
    });
    expect(persisted?.data.parts?.[0]).toMatchObject({
      text: input.text,
      providerMetadata: {
        cherry: { references: [...skillReferences, { type: 'skill', ...selection }] },
      },
    });
  });
  test('preserves the original tool failure code for localized correction hints', () => {
    const item = toAgentMessageListItem(
      message('tool-correction', {
        parts: [
          {
            id: 'correction',
            type: 'dynamic-tool',
            toolCallId: 'call-1',
            toolRef: { source: 'meta', name: 'tool_call' },
            toolName: 'tool_call',
            title: 'Call tool',
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

  test('preserves materialized statistics without inventing missing token counts', () => {
    const stats = { requestCount: 2, inputTokens: 200, totalTokens: 220 };
    const item = toAgentMessageListItem(
      message('materialized', {
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
            type: 'dynamic-tool',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'web_fetch' },
            toolName: 'web_fetch',
            title: 'Fetch web page',
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
      filename: 'report.pdf',
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
            data: {
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
            type: 'data-error',
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
            data: {
              code: 'EXECUTION_FAILED',
              message: 'OpenAI API error (429): too many requests',
              retryable: true,
            },
            id: 'error-legacy',
            type: 'data-error',
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
            title: 'Read file',
            id: 'tool-1',
            input: { fileEntryId: 'file-1' },
            toolName: 'builtin_read_file_a1b2',
            state: 'awaiting-approval',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'read_file' },
            type: 'dynamic-tool',
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
            title: 'Write file',
            id: 'tool-streaming',
            toolName: 'write_file',
            state: 'input-streaming',
            toolCallId: 'call-streaming',
            toolRef: { source: 'builtin', capabilityId: 'write_file' },
            type: 'dynamic-tool',
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
            title: 'Write file',
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
            toolName: 'write_file',
            state: 'output-available',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'write_file' },
            type: 'dynamic-tool',
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
            title: 'Web search',
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
            toolName: 'web_search',
            state: 'output-available',
            toolCallId: 'call-1',
            toolRef: { source: 'builtin', capabilityId: 'web_search' },
            type: 'dynamic-tool',
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
            filename: 'managed.png',
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

  test('keeps older live questions before the saved replies when the history window advances', () => {
    const olderUser = message('user-1', { role: 'user', status: 'success' });
    const latestUser = message('user-2', {
      createdAt: '2026-08-25T00:00:01.000Z',
      role: 'user',
      status: 'success',
      turnId: 'turn-2',
    });
    const latestAssistant = message('assistant-2', {
      createdAt: '2026-08-25T00:00:01.001Z',
      status: 'success',
      turnId: 'turn-2',
    });
    const nextUser = message('user-3', {
      createdAt: '2026-08-25T00:00:02.000Z',
      role: 'user',
      status: 'success',
      turnId: 'turn-3',
    });
    const history = [latestUser, latestAssistant];
    const live = [olderUser, latestUser, nextUser];

    expect(mergeAgentMessageViews(history, live)).toEqual([
      olderUser,
      latestUser,
      latestAssistant,
      nextUser,
    ]);
    expect(history).toEqual([latestUser, latestAssistant]);
    expect(live).toEqual([olderUser, latestUser, nextUser]);
  });

  test('uses ordered IDs to insert a missing user before its same-millisecond answer', () => {
    const user = message('019ec992-a000-7000-8000-000000000001', {
      role: 'user',
      status: 'success',
    });
    const assistant = message('019ec992-a000-7000-8000-000000000002', { status: 'success' });

    expect(mergeAgentMessageViews([assistant], [user])).toEqual([user, assistant]);
  });

  test('keeps the saved position of a retried answer when its live creation time differs', () => {
    const user = message('user', { role: 'user', status: 'success' });
    const assistant = message('assistant', {
      createdAt: '2026-08-25T00:00:00.001Z',
      status: 'pending',
    });
    const liveAssistant = {
      ...assistant,
      createdAt: '2026-08-25T00:00:01.000Z',
      status: 'streaming' as const,
    };
    const nextUser = message('next-user', {
      createdAt: '2026-08-25T00:00:00.002Z',
      role: 'user',
      status: 'success',
      turnId: 'next-turn',
    });

    expect(mergeAgentMessageViews([user, assistant], [liveAssistant, nextUser])).toEqual([
      user,
      liveAssistant,
      nextUser,
    ]);
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
