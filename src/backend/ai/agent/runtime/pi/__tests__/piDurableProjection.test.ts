import type { Api, AssistantMessage, JsonValue, Model } from '@earendil-works/pi-ai';
import type { EntryRecord, SubmissionRecord } from '@earendil-works/pi-durable';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';
import type { AiFailureReason } from '@/shared/contracts/aiFailure';

import { buildAgentSystemPrompt } from '../../../host/agentSystemPrompt';
import { toAgentErrorView, toAgentMessagePart } from '../../../host/runtimeProjection';
import { DURABLE_IMAGE_TOOL_NAME } from '../../durableTypes';
import type { RuntimeError } from '../../types';
import { PiConfigurationSchema, piToolBlueprint, projectPiTurn } from '../piDurableProjection';
import { piDurableSetupError } from '../piDurableStream';
import { piModelTerminalErrorAttributes } from '../piModelDiagnostics';

const writeFile = {
  ref: { source: 'builtin' as const, capabilityId: 'write_file' },
  providerName: 'write_file',
  displayName: 'Write file',
  description: 'Write a file.',
  inputSchema: {},
  inputPreview: { textField: 'content', nameField: 'filename' },
  approval: 'auto' as const,
};

test('older configurations remain readable and current replaceable instructions round-trip', () => {
  const old = {
    version: 1,
    model: { providerId: 'p', modelId: 'm' },
    instructions: 'App policy',
    options: {},
    tools: [],
  };
  expect(PiConfigurationSchema.parse(old).initialInstructions).toEqual([]);
  const current = {
    ...old,
    initialInstructions: [{ key: 'skill:notes', text: 'Current skill body' }],
  };
  expect(
    PiConfigurationSchema.parse(JSON.parse(JSON.stringify(current))).initialInstructions,
  ).toEqual(current.initialInstructions);
});

test.each(['standard', 'minimal'] as const)(
  'migrates only the automatic date in released %s prompts and preserves user instructions',
  (mode) => {
    const date = '\n\n## Current Date\n\nThe current local date is `2026-12-31`.';
    const language = '\n\n## Response Language\n';
    const instructions =
      buildAgentSystemPrompt({
        mode,
        appLanguage: 'en-US',
        tools: [],
      }) +
      `\n\n<agent_instructions>\nKeep this quoted example:${date}${language}Example language.\n</agent_instructions>`;
    const old = {
      version: 1,
      model: { providerId: 'p', modelId: 'm' },
      instructions: instructions.replace(language, `${date}${language}`),
      options: {},
      tools: [],
    };
    const migrated = PiConfigurationSchema.parse(old);
    expect(migrated).toMatchObject({ version: 2, instructions });
    expect(PiConfigurationSchema.parse(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(PiConfigurationSchema.parse({ ...old, version: 2 }).instructions).toBe(old.instructions);
  },
);

const metadata = {
  kind: 'cherry.input',
  version: 1,
  requestId: 'request',
  turnId: 'turn',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  createdAt: 1_000,
  metadata: {},
  tools: [writeFile],
};
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function call(content: string, timestamp: number, durationMs?: number): AssistantMessage {
  return {
    role: 'assistant',
    api: 'cherry',
    provider: 'provider',
    model: 'model',
    content: [
      {
        type: 'toolCall',
        id: 'call',
        name: 'write_file',
        arguments: { filename: 'notes.md', content },
      },
    ],
    stopReason: 'toolUse',
    timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
    usage,
  };
}

test('stored tool blueprints keep deferred discovery across restarts', () => {
  expect(piToolBlueprint({ ...writeFile, deferred: true } as never)).toMatchObject({
    deferred: true,
  });
  expect(piToolBlueprint(writeFile as never)).not.toHaveProperty('deferred');
});

describe('Pi turn projection', () => {
  test.each([
    { raw: undefined, code: 'stream_disconnected', category: 'network' },
    { raw: undefined, code: 'no_response', category: 'network' },
    { raw: 'SAFETY', category: 'content_filter' },
    { raw: 'MALFORMED_FUNCTION_CALL', category: 'unknown' },
    { raw: 'UNEXPECTED_TOOL_CALL', category: 'unknown' },
    { raw: 'TOO_MANY_TOOL_CALLS', category: 'unknown' },
    { raw: 'OTHER', category: 'unknown' },
    { raw: undefined, category: 'unknown' },
    { raw: 'private_finish_reason', category: 'unknown' },
  ])('projects provider reason $raw and code $code as $category', ({ raw, code, category }) => {
    const terminal: AssistantMessage = {
      ...call('', 2000),
      api: 'google-generative-ai',
      content: [],
      stopReason: 'error',
      rawStopReason: raw,
      errorMessage: 'Provider stopped.',
      diagnostics: code
        ? [
            {
              type: 'provider_response_failure',
              timestamp: 1,
              error: { code, message: 'Request failed.' },
            },
          ]
        : undefined,
    };
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        reason: 'model_error',
        entry: 1,
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
      ] as unknown as EntryRecord[],
    });

    expect(toAgentErrorView(turn.error!)).toMatchObject({
      retryable: true,
      failure: {
        reasonCode: category,
        context: { finishReason: raw ?? 'error' },
      },
    });
  });

  test.each(['provider_response_failure', 'pi_messages_response_failure'])(
    'preserves the terminal %s facts in the displayed failure',
    (type) => {
      const response = {
        message: '预扣费额度失败, 用户剩余额度: $1.032202, 需要预扣费额度: $1.299970',
        code: 'insufficient_user_quota',
        request_id: 'req-quota',
      };
      const responseBody = JSON.stringify(response);
      const terminal: AssistantMessage = {
        ...call('', 2000),
        provider: 'cherryin',
        model: 'openai/gpt-test',
        content: [],
        stopReason: 'error',
        errorMessage: `cherryin API error (403): ${responseBody}`,
        diagnostics: [
          {
            type: 'provider_response_failure',
            timestamp: 1,
            error: { name: 'EarlierError', code: 'server_error', message: 'Earlier failure' },
            details: { status: 503, body: 'Earlier response', retryable: true },
          },
          {
            type,
            timestamp: 2,
            error: { name: 'APIError', code: response.code, message: response.message },
            details:
              type === 'provider_response_failure'
                ? { status: 403, body: responseBody, retryable: false }
                : { statusCode: 403, body: response, retryable: false },
          },
          {
            type: 'transport_fallback',
            timestamp: 3,
            error: { name: 'TransportError', message: 'Recovered transport failure' },
          },
        ],
      };
      const turn = projectPiTurn({
        lane: { sessionId: 'session', slot: 0 },
        metadata,
        record: {
          id: 1,
          type: 'input',
          status: 'unanswered',
          reason: 'model_error',
          entry: 1,
        } as unknown as SubmissionRecord,
        entries: [
          { id: 2, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
        ] as unknown as EntryRecord[],
      });

      expect(turn.status).toBe('failed');
      expect(piModelTerminalErrorAttributes(terminal)['error.category']).toBe('quota');
      expect(toAgentErrorView(turn.error!)).toEqual({
        code: 'EXECUTION_FAILED',
        message: terminal.errorMessage,
        // Manual retry stays available after the account limit is resolved.
        retryable: true,
        failure: {
          version: 1,
          reasonCode: 'quota',
          source: { layer: 'provider', code: 'insufficient_user_quota', name: 'APIError' },
          context: {
            providerId: 'cherryin',
            modelId: 'openai/gpt-test',
            statusCode: 403,
            finishReason: 'error',
            responseBody,
          },
        },
      });
    },
  );

  test('keeps the provider source code when the stored diagnostic has no provider code', async () => {
    const failure = Object.assign(new Error('provider API error (503): upstream unavailable'), {
      status: 503,
    });
    const model: Model<Api> = {
      api: 'openai-responses',
      provider: 'provider',
      id: 'model',
      name: 'Model',
      baseUrl: '',
      contextWindow: 32768,
      maxTokens: 4096,
      input: ['text'],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    // Setup failures receive the same normalized diagnostic shape that Pi persists.
    let terminal: AssistantMessage | undefined;
    for await (const event of piDurableSetupError(model, failure, []))
      if (event.type === 'error') terminal = event.error;
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        reason: 'model_error',
        entry: 1,
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
      ] as unknown as EntryRecord[],
    });

    expect(toAgentErrorView(turn.error!).failure).toMatchObject({
      reasonCode: 'provider_unavailable',
      source: { layer: 'provider', code: 'provider_error', name: 'Error' },
      context: { statusCode: 503 },
    });
  });

  test.each([
    { api: 'cherry-image', statusCode: 403, retryable: false },
    { api: 'cherry-image', statusCode: 503, retryable: true },
    { api: 'cherry', statusCode: 403, retryable: false },
  ])('uses the tool failure only for a direct image scheduling error: %j', (scenario) => {
    const failure: RuntimeError = {
      code: 'image_provider_error',
      message: 'Provider rejected the image request.',
      name: 'APIError',
      origin: 'provider',
      retryable: scenario.retryable,
      context: {
        statusCode: scenario.statusCode,
        providerId: 'provider',
        modelId: 'image-model',
        responseBody: 'Sanitized provider response',
      },
    };
    const imageTool = {
      ...writeFile,
      ref: { source: 'builtin', capabilityId: 'image_generation' },
      providerName: DURABLE_IMAGE_TOOL_NAME,
    };
    const scheduled: AssistantMessage = {
      ...call('', 2000),
      api: scenario.api,
      content: [{ type: 'toolCall', id: 'call', name: DURABLE_IMAGE_TOOL_NAME, arguments: {} }],
    };
    const terminal: AssistantMessage = {
      ...scheduled,
      content: [],
      stopReason: 'error',
      errorMessage: 'The image request ended without a successful result.',
      timestamp: 2200,
    };
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata: { ...metadata, tools: [imageTool] },
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        reason: 'model_error',
        entry: 1,
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [scheduled] },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'call',
              toolName: DURABLE_IMAGE_TOOL_NAME,
              content: [{ type: 'text', text: failure.message }],
              details: {
                kind: 'cherry.tool-result',
                ref: imageTool.ref,
                providerName: imageTool.providerName,
                displayName: 'Generate image',
                output: {
                  value: { status: 'error' },
                  artifacts: [],
                  failure: { scope: 'call', error: failure },
                },
              },
              isError: true,
              timestamp: 2100,
            },
          ],
        },
        { id: 4, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
      ] as unknown as EntryRecord[],
    });

    expect(turn.status).toBe('failed');
    if (scenario.api === 'cherry-image') {
      expect(turn.error).toEqual(failure);
      expect(toAgentErrorView(turn.error!)).toMatchObject({
        message: failure.message,
        retryable: failure.retryable,
        failure: {
          source: { layer: 'provider', code: failure.code, name: failure.name },
          context: failure.context,
        },
      });
    } else {
      expect(turn.error).toMatchObject({
        code: 'provider_error',
        message: terminal.errorMessage,
        retryable: true,
      });
    }
  });

  test('preserves upstream loaded tool names for search presentation', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      active: true,
      entries: [
        {
          id: 2,
          conversationId: 1,
          kind: 'pi.assistant',
          model: [
            {
              ...call('', 2000),
              content: [
                {
                  type: 'toolCall',
                  id: 'search',
                  name: 'tool_search',
                  arguments: { query: 'notes' },
                },
              ],
            },
          ],
        },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'search',
              toolName: 'tool_search',
              content: [{ type: 'text', text: 'Loaded 1 tool.' }],
              details: { loaded: ['mcp_notes'] },
              isError: false,
              timestamp: 2100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
    });
    expect(turn.parts[0]).toMatchObject({
      type: 'tool',
      toolRef: { source: 'meta', name: 'tool_search' },
      state: 'output-available',
      output: { value: { loaded: ['mcp_notes'] } },
    });
  });

  const placed = {
    id: 1,
    type: 'input',
    status: 'placed',
    entry: 1,
  } as unknown as SubmissionRecord;

  function projectMessage(message: AssistantMessage, streaming: boolean, fullReasoning = false) {
    return projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record: placed,
      metadata,
      active: true,
      fullReasoning,
      entries: streaming
        ? []
        : ([
            { id: 2, conversationId: 1, kind: 'pi.assistant', model: [message] },
          ] as unknown as EntryRecord[]),
      ...(streaming ? { partial: message } : {}),
    });
  }

  test.each([true, false])(
    'full detail reads retain all reasoning while streaming=%s',
    (streaming) => {
      const text = 'Earlier thoughts must remain readable.\n'.repeat(200);
      const message: AssistantMessage = {
        ...call('', 2000),
        content: [
          { type: 'thinking', thinking: text },
          { type: 'thinking', thinking: 'Continuation.' },
        ],
      };
      expect(projectMessage(message, streaming).parts[0]).toMatchObject({
        type: 'reasoning',
        text: '',
        hasText: true,
      });
      expect(projectMessage(message, streaming, true).parts[0]).toMatchObject({
        type: 'reasoning',
        text: `${text}\n\nContinuation.`,
        state: streaming ? 'streaming' : 'done',
      });
    },
  );

  test.each([true, false])(
    'joins consecutive reasoning summaries without truncating content while streaming=%s',
    (streaming) => {
      const message: AssistantMessage = {
        ...call('body', 2_000),
        api: 'openai-responses',
        content: [
          { type: 'thinking', thinking: 'Inspecting screenshot names' },
          { type: 'thinking', thinking: '正在核对截图中的玩家名称' },
          { type: 'thinking', thinking: '我按总伤害划分选手档位' },
          { type: 'text', text: 'The complete answer.' },
        ],
      };
      const turn = projectMessage(message, streaming, true);

      expect(turn.parts).toEqual([
        expect.objectContaining({
          type: 'reasoning',
          text: 'Inspecting screenshot names\n\n正在核对截图中的玩家名称\n\n我按总伤害划分选手档位',
          state: 'done',
        }),
        expect.objectContaining({ type: 'text', text: 'The complete answer.' }),
      ]);
      expect(message.content).toHaveLength(4);
    },
  );

  test.each([true, false])(
    'omits empty reasoning disclosures while retaining provider replay content, streaming=%s',
    (streaming) => {
      const message: AssistantMessage = {
        ...call('body', 2_000),
        api: 'openai-responses',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'thinking', thinking: '', thinkingSignature: 'opaque-provider-replay' },
          { type: 'thinking', thinking: '\n \t' },
          { type: 'toolCall', id: 'js-call', name: 'javascript', arguments: { code: '1 + 1' } },
        ],
      };
      const turn = projectMessage(message, streaming);

      expect(turn.parts).toEqual([
        expect.objectContaining({
          type: 'tool',
          toolCallId: 'js-call',
          providerName: 'javascript',
        }),
      ]);
      expect(message.content[1]).toEqual({
        type: 'thinking',
        thinking: '',
        thinkingSignature: 'opaque-provider-replay',
      });
      expect(message.content).toHaveLength(4);
    },
  );

  test('keeps reasoning phases separated by tools and marks only the growing phase as streaming', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [
        { type: 'thinking', thinking: 'Before the tool.' },
        call('body', 2_000).content[0]!,
        { type: 'thinking', thinking: 'After the tool.' },
        { type: 'thinking', thinking: 'More reasoning.' },
      ],
    };
    const turn = projectMessage(message, true, true);

    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: 'Before the tool.', state: 'done' }),
      expect.objectContaining({ type: 'tool', toolCallId: 'call' }),
      expect.objectContaining({
        type: 'reasoning',
        text: 'After the tool.\n\nMore reasoning.',
        state: 'streaming',
      }),
    ]);
  });

  test('keeps a streaming reasoning indicator before the first summary text', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [{ type: 'thinking', thinking: '' }],
    };
    const turn = projectMessage(message, true);

    expect(turn.hasAssistant).toBe(true);
    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'reasoning', state: 'streaming', text: '' }),
    ]);
  });

  test('keeps an empty streaming reasoning phase after a completed tool result', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record: placed,
      metadata,
      active: true,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000)] },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'call',
              toolName: 'write_file',
              content: [{ type: 'text', text: 'Saved' }],
              isError: false,
              timestamp: 2_100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
      partial: { ...call('body', 2_200), content: [{ type: 'thinking', thinking: '' }] },
    });

    expect(turn.parts).toEqual([
      expect.objectContaining({ type: 'tool', state: 'output-available' }),
      expect.objectContaining({ type: 'reasoning', state: 'streaming', text: '' }),
    ]);
  });

  test.each([true, false])(
    'keeps consecutive retry summaries in one phase while streaming=%s',
    (streaming) => {
      const earlier: AssistantMessage = {
        ...call('body', 2_000),
        content: [{ type: 'thinking', thinking: 'Earlier summary.' }],
        stopReason: 'error',
        errorMessage: 'The provider request failed.',
      };
      const retry: AssistantMessage = {
        ...call('body', 3_000),
        content: [
          { type: 'thinking', thinking: 'Retry summary.' },
          call('body', 3_000).content[0]!,
        ],
      };
      const turn = projectPiTurn({
        lane: { sessionId: 'session', slot: 0 },
        record: placed,
        metadata,
        active: true,
        fullReasoning: true,
        entries: [
          { id: 2, conversationId: 1, kind: 'pi.assistant', model: [earlier] },
          ...(streaming
            ? []
            : [{ id: 3, conversationId: 1, kind: 'pi.assistant', model: [retry] }]),
        ] as unknown as EntryRecord[],
        ...(streaming ? { partial: retry } : {}),
      });

      expect(turn.parts).toEqual([
        expect.objectContaining({
          id: 'pi:2:block:0',
          type: 'reasoning',
          text: 'Earlier summary.\n\nRetry summary.',
          state: 'done',
        }),
        expect.objectContaining({ type: 'tool', toolCallId: 'call' }),
      ]);
      expect(earlier.content[0]).toEqual({ type: 'thinking', thinking: 'Earlier summary.' });
      expect(retry.content[0]).toEqual({ type: 'thinking', thinking: 'Retry summary.' });
    },
  );

  test('keeps a visible reasoning phase active while its next summary is still empty', () => {
    const message: AssistantMessage = {
      ...call('body', 2_000),
      content: [
        { type: 'thinking', thinking: 'Received summary.' },
        { type: 'thinking', thinking: '' },
      ],
    };
    expect(projectMessage(message, true).parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: '', hasText: true, state: 'streaming' }),
    ]);
    expect(projectMessage(message, false).parts).toEqual([
      expect.objectContaining({ type: 'reasoning', text: '', hasText: true, state: 'done' }),
    ]);
  });

  test('recovered terminal inputs settle tool calls that have no result entry', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        entry: 1,
        reason: 'interrupted',
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000)] },
        {
          id: 3,
          conversationId: 1,
          kind: 'cherry.codemode-artifacts',
          data: {
            callId: 'call',
            artifacts: [
              {
                ref: { kind: 'managed-file', fileEntryId: 'file' },
                name: 'saved.txt',
                mediaType: 'text/plain',
                kind: 'created',
              },
            ],
          },
        },
      ] as unknown as EntryRecord[],
    });
    expect(turn.status).toBe('interrupted');
    expect(turn.parts[0]).toMatchObject({
      type: 'tool',
      state: 'interrupted',
      input: { filename: 'notes.md', content: 'body' },
      output: { value: { status: 'interrupted' }, artifacts: [] },
    });
    expect(turn.parts[1]).toMatchObject({ type: 'file', name: 'saved.txt' });
  });

  test('a failed script keeps the JavaScript capability and reports the error its output ends with', () => {
    const scriptText = `Script failed\nOutput:\n${'line\n'.repeat(100)}Script error:\nSyntaxError: unexpected token`;
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata: {
        ...metadata,
        tools: [
          {
            ...writeFile,
            ref: { source: 'builtin', capabilityId: 'run_js' },
            providerName: 'run_js',
            displayName: 'Run JavaScript',
          },
        ],
      },
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      active: true,
      entries: [
        {
          id: 2,
          conversationId: 1,
          kind: 'pi.assistant',
          model: [
            {
              ...call('', 2000),
              content: [
                {
                  type: 'toolCall',
                  id: 'script',
                  name: 'codemode',
                  arguments: { code: 'const = 1' },
                },
              ],
            },
          ],
        },
        {
          id: 3,
          conversationId: 1,
          kind: 'pi.tool-result',
          data: { diagnostics: [] },
          model: [
            {
              role: 'toolResult',
              toolCallId: 'script',
              toolName: 'codemode',
              content: [{ type: 'text', text: scriptText }],
              // What the capability's afterTool hook stores for every script, failed or not.
              details: {
                kind: 'cherry.tool-result',
                ref: { source: 'builtin', capabilityId: 'run_js' },
                providerName: 'codemode',
                displayName: 'Run JavaScript',
                output: {
                  value: { output: scriptText, details: { calls: [] } },
                  modelValue: scriptText,
                  artifacts: [],
                },
              },
              isError: true,
              timestamp: 2100,
            },
          ],
        },
      ] as unknown as EntryRecord[],
    });
    const part = turn.parts[0];
    if (part?.type !== 'tool') throw new Error('Expected a tool part');
    expect(part).toMatchObject({
      toolRef: { source: 'builtin', capabilityId: 'run_js' },
      providerName: 'codemode',
      displayName: 'Run JavaScript',
      state: 'error',
    });
    // The reason is a bounded tail, so the error survives long output ahead of it.
    expect(part.error?.message.endsWith('Script error:\nSyntaxError: unexpected token')).toBe(true);
    expect(part.error!.message.length).toBeLessThan(scriptText.length);
    // The protocol accepts an error tool part only with the error result shape.
    expect(toAgentMessagePart(part)).toMatchObject({
      state: 'error',
      output: { value: { status: 'error' }, artifacts: [] },
    });
  });

  test('live child status is progress, never a final tool output', () => {
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata: {
        ...metadata,
        tools: [
          writeFile,
          {
            ...writeFile,
            ref: { source: 'mcp' as const, serverId: 'server', rawToolName: 'lookup' },
            providerName: 'mcp_lookup_0ab12cd',
            displayName: 'lookup',
          },
        ],
      },
      active: true,
      record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2000)] },
      ] as unknown as EntryRecord[],
      nestedTools: new Map([
        ['child', { parentCallId: 'call', name: 'write_file', args: '{}', status: 'running' }],
        ['remote', { parentCallId: 'call', name: 'mcp_lookup_0ab12cd', args: '{}', status: 'ok' }],
      ]),
    });
    const part = turn.parts[0];
    if (part?.type !== 'tool') throw new Error('Expected a tool part');
    // The client translates built-in names; an MCP alias carries its display name.
    expect(part.progress).toEqual({
      calls: [
        { id: 'child', name: 'write_file', args: '{}', status: 'running' },
        { id: 'remote', name: 'mcp_lookup_0ab12cd', title: 'lookup', args: '{}', status: 'ok' },
      ],
    });
    expect(turn.parts[0]).not.toHaveProperty('output');
  });

  test('streams a bounded file preview instead of the growing tool input', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'placed',
      entry: 1,
    } as unknown as SubmissionRecord;
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record,
      metadata,
      entries: [],
      active: true,
      partial: call('# Notes\nfirst line', 2_000),
    });
    expect(turn.parts).toEqual([
      expect.objectContaining({
        type: 'tool',
        state: 'input-streaming',
        inputPreview: { text: '# Notes\nfirst line', truncated: false, name: 'notes.md' },
      }),
    ]);
    expect(turn.parts[0]).not.toHaveProperty('input');
    expect(turn.timing).toEqual({ startedAt: 2_000, tools: [] });
  });

  test('settled calls keep their input and time each tool from its monotonic duration', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'done',
      entry: 1,
      answer: 4,
    } as unknown as SubmissionRecord;
    const entries = [
      { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000, 500)] },
      {
        id: 3,
        conversationId: 1,
        kind: 'pi.tool-result',
        data: { diagnostics: [] },
        model: [
          {
            role: 'toolResult',
            toolCallId: 'call',
            toolName: 'write_file',
            content: [{ type: 'text', text: 'saved' }],
            isError: false,
            timestamp: 4_000,
            durationMs: 300,
          },
        ],
      },
      {
        id: 4,
        conversationId: 1,
        kind: 'pi.assistant',
        model: [
          {
            ...call('unused', 5_000, 1_000),
            content: [{ type: 'text', text: 'Done' }],
            stopReason: 'stop',
          },
        ],
      },
    ] as unknown as EntryRecord[];
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      record,
      metadata,
      entries,
    });
    expect(turn.status).toBe('completed');
    expect(turn.parts[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        input: { filename: 'notes.md', content: 'body' },
      }),
    );
    expect(turn.parts[0]).not.toHaveProperty('inputPreview');
    expect(turn.timing).toEqual({
      startedAt: 2_000,
      completedAt: 6_000,
      tools: [{ toolCallId: 'call', toolName: 'write_file', startedAt: 3_700, completedAt: 4_000 }],
    });
  });
});

describe('terminal provider reason parity', () => {
  const metadataBody = { content_filter_results: { hate: { filtered: false } } };
  const metadataText = JSON.stringify(metadataBody);
  type Scenario = {
    label: string;
    reason: AiFailureReason;
    code?: string;
    message?: string;
    body?: JsonValue;
    rawStopReason?: string;
    status?: JsonValue;
    statusCode?: JsonValue;
    expectedStatusCode?: number;
    forgedReason?: boolean;
  };
  const scenarios: Scenario[] = [
    { label: 'metadata in message', message: metadataText, reason: 'unknown' },
    { label: 'metadata in string body', body: metadataText, reason: 'unknown' },
    { label: 'metadata in object body', body: metadataBody, reason: 'unknown' },
    { label: 'neutral control', reason: 'unknown' },
    {
      label: 'metadata with 503',
      body: metadataBody,
      status: 503,
      expectedStatusCode: 503,
      reason: 'provider_unavailable',
    },
    {
      label: 'metadata with ECONNREFUSED',
      body: metadataBody,
      code: 'ECONNREFUSED',
      reason: 'network',
    },
    { label: 'explicit safety code', code: 'content_filter', reason: 'content_filter' },
    {
      label: 'metadata with no_response',
      body: metadataBody,
      code: 'no_response',
      reason: 'network',
    },
    {
      label: 'metadata with stream_disconnected',
      body: metadataBody,
      code: 'stream_disconnected',
      reason: 'network',
    },
    {
      label: 'metadata with server_error',
      body: metadataBody,
      code: 'server_error',
      reason: 'provider_unavailable',
    },
    {
      label: 'only network prose',
      body: metadataBody,
      message: 'Network request failed',
      reason: 'network',
    },
    {
      label: 'only stream prose',
      body: metadataBody,
      message: 'Stream ended unexpectedly',
      reason: 'stream_interrupted',
    },
    { label: 'timeout prose', message: 'Request timed out', reason: 'timeout' },
    {
      label: 'TLS evidence refines a generic transport code',
      code: 'no_response',
      message: 'Self-signed certificate',
      reason: 'proxy_tls',
    },
    {
      label: 'quota evidence refines forbidden status',
      code: 'forbidden',
      status: 403,
      expectedStatusCode: 403,
      body: { error: { message: 'Quota exhausted', content_filter_results: {} } },
      reason: 'quota',
    },
    {
      label: 'OpenAI authentic safety',
      rawStopReason: 'content_filter',
      message: 'Provider finish_reason: content_filter',
      reason: 'content_filter',
    },
    {
      label: 'Google authentic safety',
      rawStopReason: 'SAFETY',
      message: 'Provider stopped with: SAFETY',
      reason: 'content_filter',
    },
    {
      label: 'Google authentic recitation',
      rawStopReason: 'RECITATION',
      message: 'Provider stopped with: RECITATION',
      reason: 'content_filter',
    },
    ...[
      'PROHIBITED_CONTENT',
      'IMAGE_PROHIBITED_CONTENT',
      'IMAGE_RECITATION',
      'IMAGE_SAFETY',
      'BLOCKLIST',
      'SPII',
    ].map(
      (rawStopReason): Scenario => ({
        label: `Google safety finish ${rawStopReason}`,
        rawStopReason,
        reason: 'content_filter',
      }),
    ),
    ...[' CoNtEnT-FiLtEr ', ' CONTENT_FILTER ', ' safety ', ' recitation '].map(
      (rawStopReason): Scenario => ({
        label: `exact normalized raw ${rawStopReason}`,
        rawStopReason,
        reason: 'content_filter',
      }),
    ),
    ...['content_filter_results', 'OTHER', 'private safety description'].map(
      (rawStopReason): Scenario => ({
        label: `non-safety raw ${rawStopReason}`,
        rawStopReason,
        reason: 'unknown',
      }),
    ),
    { label: 'near-match code', code: 'content_filter_results', reason: 'unknown' },
    {
      label: 'auth code beats safety and status',
      code: 'authentication_error',
      rawStopReason: 'SAFETY',
      status: 503,
      expectedStatusCode: 503,
      reason: 'auth',
    },
    {
      label: 'exact safety finish beats generic transport code and TLS prose',
      code: 'no_response',
      rawStopReason: 'SAFETY',
      message: 'Self-signed certificate',
      reason: 'content_filter',
    },
    {
      label: 'quota prose refines forbidden status',
      code: 'forbidden',
      status: 403,
      expectedStatusCode: 403,
      message: 'Quota exhausted',
      reason: 'quota',
    },
    { label: 'bare forbidden', code: 'forbidden', reason: 'unknown' },
    {
      label: 'forbidden yields to safety',
      code: 'forbidden',
      rawStopReason: 'SAFETY',
      reason: 'content_filter',
    },
    { label: 'forged upstream reason', forgedReason: true, reason: 'unknown' },
    {
      label: 'missing provider code',
      code: undefined,
      status: '503',
      expectedStatusCode: 503,
      reason: 'provider_unavailable',
    },
    {
      label: 'placeholder provider code',
      code: 'runtime_error',
      status: '503',
      expectedStatusCode: 503,
      reason: 'provider_unavailable',
    },
    {
      label: 'string statusCode',
      statusCode: '503',
      expectedStatusCode: 503,
      reason: 'provider_unavailable',
    },
    { label: 'status lower boundary', status: 100, expectedStatusCode: 100, reason: 'unknown' },
    {
      label: 'status upper boundary',
      status: 599,
      expectedStatusCode: 599,
      reason: 'provider_unavailable',
    },
    ...[99, 600, 503.5, 'not numeric', '', '   ', Number.NaN, Number.POSITIVE_INFINITY].map(
      (status): Scenario => ({
        label: `invalid status ${String(status)}`,
        status,
        reason: 'unknown',
      }),
    ),
    {
      label: 'invalid statusCode does not fall back to status',
      statusCode: '',
      status: 503,
      reason: 'unknown',
    },
    {
      label: 'null statusCode falls back to status',
      statusCode: null,
      status: '503',
      expectedStatusCode: 503,
      reason: 'provider_unavailable',
    },
  ];

  describe.each(['provider_response_failure', 'pi_messages_response_failure'])('%s', (type) => {
    test.each(scenarios)('$label → $reason at both layers', (scenario) => {
      const code = 'code' in scenario ? scenario.code : 'provider_error';
      const terminal: AssistantMessage = {
        ...call('', 2000),
        content: [],
        stopReason: 'error',
        errorMessage: scenario.message ?? 'The provider request failed.',
        rawStopReason: scenario.rawStopReason,
        diagnostics: [
          {
            type,
            timestamp: 1,
            error: {
              name: 'ProviderError',
              code,
              message: 'The diagnostic request failed.',
              ...(scenario.forgedReason ? { reasonCode: 'content_filter' } : {}),
            },
            details: {
              ...(scenario.statusCode !== undefined ? { statusCode: scenario.statusCode } : {}),
              ...(scenario.status !== undefined ? { status: scenario.status } : {}),
              ...(scenario.body !== undefined ? { body: scenario.body } : {}),
            },
          },
        ],
        ...(scenario.forgedReason ? { reasonCode: 'content_filter' } : {}),
      };
      const turn = projectPiTurn({
        lane: { sessionId: 'session', slot: 0 },
        metadata,
        record: {
          id: 1,
          type: 'input',
          status: 'unanswered',
          reason: 'model_error',
          entry: 1,
        } as unknown as SubmissionRecord,
        entries: [
          { id: 2, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
        ] as unknown as EntryRecord[],
      });
      const view = JSON.parse(JSON.stringify(toAgentErrorView(turn.error!)));
      const attributes = piModelTerminalErrorAttributes(terminal);
      // Check both values together so a passing equality cannot hide a shared wrong decision.
      expect([view.failure.reasonCode, attributes['error.category']]).toEqual([
        scenario.reason,
        scenario.reason,
      ]);
      expect(turn.status).toBe('failed');
      expect(view).toMatchObject({
        code: 'EXECUTION_FAILED',
        message: terminal.errorMessage,
        retryable: true,
        failure: {
          version: 1,
          source: {
            layer: 'provider',
            code: code === undefined || code === 'runtime_error' ? 'provider_error' : code,
            name: 'ProviderError',
          },
          context: {
            providerId: 'provider',
            modelId: 'model',
            finishReason: scenario.rawStopReason?.trim() ?? 'error',
          },
        },
      });
      if (scenario.body !== undefined)
        expect(view.failure.context.responseBody).toBe(
          typeof scenario.body === 'string' ? scenario.body : JSON.stringify(scenario.body),
        );
      expect(view.failure.context.statusCode).toBe(scenario.expectedStatusCode);
      expect(attributes['http.status_code']).toBe(scenario.expectedStatusCode);
      expect(attributes['error.retry_scope']).toBe('automatic');
      expect(JSON.stringify(attributes)).not.toContain('private');
    });
  });

  test('a recovered earlier failure does not mark a successful terminal answer', () => {
    const terminal: AssistantMessage = {
      ...call('', 2000),
      content: [{ type: 'text', text: 'Recovered' }],
      stopReason: 'stop',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { code: 'content_filter', message: 'Earlier filtered attempt' },
        },
      ],
    };
    const turn = projectPiTurn({
      lane: { sessionId: 'session', slot: 0 },
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'done',
        entry: 1,
        answer: 2,
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [terminal] },
      ] as unknown as EntryRecord[],
    });
    expect(turn.error).toBeNull();
    expect(piModelTerminalErrorAttributes(terminal)).toEqual({});
  });

  test('normalization discards an upstream forged reason before host projection', () => {
    const normalized = normalizeAiError({
      code: 'provider_error',
      message: 'Request failed',
      reasonCode: 'content_filter',
    });
    expect(normalized).not.toHaveProperty('reasonCode');
    expect(toAgentErrorView(normalized).failure?.reasonCode).toBe('unknown');
  });
});

test('live reasoning carries no text while live and settled tool inputs remain complete', () => {
  const text = '思考'.repeat(20_000);
  const code = 'const data = [];'.repeat(10_000);
  const message: AssistantMessage = {
    ...call('', 2_000),
    content: [
      { type: 'thinking', thinking: text },
      { type: 'toolCall', id: 'script', name: 'codemode', arguments: { code } },
    ],
  };
  const options = {
    lane: { sessionId: 'session', slot: 0 },
    metadata,
    record: { id: 1, type: 'input', status: 'placed', entry: 1 } as unknown as SubmissionRecord,
    entries: [
      { id: 2, conversationId: 1, kind: 'pi.assistant', model: [message] },
    ] as unknown as EntryRecord[],
  };
  const live = projectPiTurn({ ...options, active: true });
  expect(live.parts[0]).toMatchObject({ type: 'reasoning', text: '', hasText: true });
  expect(live.parts[1]).toHaveProperty('input.code', code);
  const settled = projectPiTurn({ ...options, active: false });
  expect(settled.parts[0]).toMatchObject({ text });
  expect(settled.parts[1]).toHaveProperty('input.code', code);
  expect(message.content[0]).toHaveProperty('thinking', text);
  expect(message.content[1]).toHaveProperty('arguments.code', code);
});
