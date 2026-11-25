import {
  ENDPOINT_TYPE,
  REASONING_FORMAT_PROFILES,
  selectFormatWire,
} from '@cherrystudio/provider-registry';
import type { AssistantMessage, FetchFunction, Model as PiModel } from '@earendil-works/pi-ai';
import { KIMI_CODING_MODELS } from '@earendil-works/pi-ai/providers/kimi-coding.models';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import type { AgentMessageView } from '@/shared/contracts/agent';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import { formatMessageQuote, toRuntimeHistory } from '../../../host/turnRuntimeInput';
import { toPiConversation } from '../modelMessages';
import {
  bindPiStream,
  resolvePiApiAdapter,
  type PiLanguageEndpointType,
  type SupportedPiApi,
} from '../piApiAdapters';
import type { PiStreamFn } from '../piModelTypes';
import { emptyAssistantMessage } from '../piStreamEvents';
import { applyPiWebReplay } from '../PiWebResponse';

const mockAnthropicStreamSimple = jest.fn();
const mockGoogleStreamSimple = jest.fn();
const mockOpenAiCompletionsStreamSimple = jest.fn();
const mockOpenAiResponsesStreamSimple = jest.fn();
const mockAzureResponsesStreamSimple = jest.fn();

const mockStreamResult = { id: 'stream' };
const mockFetch = jest.fn() as unknown as FetchFunction;
const context = normalizeContext({ messages: [] });

const CASES: {
  api: SupportedPiApi;
  baseUrl: string;
  endpointType: PiLanguageEndpointType;
  expectedBaseUrl: string;
  expectedFetch: FetchFunction | undefined;
  streamSimple: jest.Mock;
}[] = [
  {
    api: 'openai-responses',
    baseUrl: 'https://api.openai.test',
    endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
    expectedBaseUrl: 'https://api.openai.test/v1',
    expectedFetch: mockFetch,
    streamSimple: mockOpenAiResponsesStreamSimple,
  },
  {
    api: 'openai-completions',
    baseUrl: 'https://api.compat.test',
    endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    expectedBaseUrl: 'https://api.compat.test/v1',
    expectedFetch: mockFetch,
    streamSimple: mockOpenAiCompletionsStreamSimple,
  },
  {
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.test/v1',
    endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    expectedBaseUrl: 'https://api.anthropic.test',
    expectedFetch: mockFetch,
    streamSimple: mockAnthropicStreamSimple,
  },
  {
    api: 'google-generative-ai',
    baseUrl: 'https://api.google.test',
    endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
    expectedBaseUrl: 'https://api.google.test/v1beta',
    expectedFetch: mockFetch,
    streamSimple: mockGoogleStreamSimple,
  },
];

describe('Pi API adapters', () => {
  test.each([ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_RESPONSES])(
    'respects version suppression for %s',
    (endpoint) => {
      expect(resolvePiApiAdapter(endpoint).formatBaseUrl('https://api.example.com/gateway#')).toBe(
        'https://api.example.com/gateway',
      );
    },
  );
  beforeEach(() => {
    jest.restoreAllMocks();
    for (const testCase of CASES) testCase.streamSimple.mockReturnValue(mockStreamResult);
    jest.mocked(mockFetch).mockReset().mockResolvedValue(new Response(null));
  });

  test('real Responses payload keeps consecutive quoted requests separate across MCP, tools, and image blocks', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_RESPONSES);
    const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
      '@earendil-works/pi-ai/api/openai-responses',
    );
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
    const payloads: Record<string, unknown>[] = [];
    const fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ error: { message: 'captured' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const stream = await bindPiStream(adapter, {
      apiKey: 'test',
      fetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 256,
    });
    const model = {
      api: 'openai-responses',
      provider: 'test',
      id: 'model',
      name: 'Model',
      baseUrl: 'https://provider.test/v1',
      input: ['text', 'image'],
      reasoning: false,
      contextWindow: 4096,
      maxTokens: 256,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    } as PiModel<SupportedPiApi>;
    const quoted = (text: string, request: string) =>
      formatMessageQuote(request, [
        { id: 'q', sourceMessageId: '00000000-0000-7000-8000-000000000001', text },
      ]);
    const first = quoted('Snapshot one', 'Request one');
    const second = quoted('Snapshot two', 'Request two');
    const conversation = toPiConversation(
      {
        instructions: '',
        input: [{ type: 'text', text: 'Continue' }],
        history: [
          {
            turnId: 'past',
            messages: [
              {
                role: 'user',
                parts: [
                  { type: 'text', text: first },
                  { type: 'text', text: 'MCP application text' },
                ],
              },
              {
                role: 'user',
                parts: [
                  { type: 'text', text: second },
                  {
                    type: 'file',
                    fileEntryId: 'image',
                    mediaType: 'image/png',
                    uri: 'data:image/png;base64,cGl4ZWxz',
                    name: 'image.png',
                  },
                ],
              },
              {
                role: 'assistant',
                parts: [
                  {
                    type: 'tool-call',
                    toolCallId: 'call',
                    toolRef: { source: 'builtin', capabilityId: 'read_file' },
                    providerName: 'read_file',
                    input: {},
                  },
                  {
                    type: 'tool-result',
                    toolCallId: 'call',
                    output: { value: 'Tool result text', artifacts: [] },
                    isError: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      model,
    );
    const result = await stream(
      model,
      normalizeContext({ messages: [...conversation.history, conversation.prompt] }),
    );
    await result.result();
    expect(payloads).toHaveLength(1);
    const wire = JSON.stringify(payloads[0]);
    expect(wire.match(/> Snapshot (one|two)/g)).toHaveLength(2);
    const blocks = payloads[0].input as {
      role?: string;
      content?: { text?: string; type?: string }[];
    }[];
    const users = blocks.filter((item) => item.role === 'user');
    expect(JSON.stringify(users[0])).toContain(JSON.stringify(first).slice(1, -1));
    expect(JSON.stringify(users[0])).not.toContain('Snapshot two');
    expect(JSON.stringify(users[1])).toContain(JSON.stringify(second).slice(1, -1));
    expect(wire).toContain('MCP application text');
    expect(wire).toContain('Tool result text');
    expect(wire).toContain('data:image/png;base64,cGl4ZWxz');
  });

  test.each(CASES)('binds $endpointType to $api', async (testCase) => {
    const adapter = resolvePiApiAdapter(testCase.endpointType);
    expect(adapter).toBeDefined();
    if (!adapter) throw new Error('Expected a supported Pi API adapter.');

    expect(adapter.api).toBe(testCase.api);
    expect(adapter.formatBaseUrl(testCase.baseUrl)).toBe(testCase.expectedBaseUrl);
    jest
      .spyOn(adapter, 'loadStreamSimple')
      .mockResolvedValue(testCase.streamSimple as unknown as PiStreamFn);

    const streamFn = await bindPiStream(adapter, {
      apiKey: 'secret-key',
      fetch: mockFetch,
      headers: { 'X-App': 'Cherry' },
      maxRetries: 0,
      maxTokens: 2048,
      temperature: 0.2,
      cacheRetention: 'none',
      sessionId: 'stable-conversation',
    });
    const model = { api: testCase.api } as PiModel<SupportedPiApi>;
    const signal = new AbortController().signal;
    const result = streamFn(model, context, {
      cacheRetention: 'long',
      sessionId: 'per-request-id',
      fetch: jest.fn() as unknown as FetchFunction,
      headers: { 'X-Request': 'request' },
      maxTokens: 32,
      reasoning: 'high',
      signal,
    });

    expect(result).toBe(mockStreamResult);
    expect(testCase.streamSimple).toHaveBeenCalledWith(
      model,
      context,
      expect.objectContaining({
        apiKey: 'secret-key',
        headers: { 'X-App': 'Cherry', 'X-Request': 'request' },
        maxRetries: 0,
        maxTokens: 32,
        reasoning: 'high',
        signal,
        temperature: 0.2,
        cacheRetention: 'none',
        sessionId: 'stable-conversation',
      }),
    );
    // The adapter reaches the binding's transport, never the per-request one.
    const { fetch } = testCase.streamSimple.mock.calls[0][2] as { fetch?: FetchFunction };
    await fetch?.('https://provider.test');
    expect(jest.mocked(mockFetch).mock.calls).toEqual(
      testCase.expectedFetch ? [['https://provider.test', undefined]] : [],
    );
  });

  test('selects and binds the Azure Responses adapter for the Azure family', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_RESPONSES, 'azure-responses');
    expect(adapter.api).toBe('azure-openai-responses');
    expect(adapter.formatBaseUrl('https://resource.openai.azure.com/openai')).toBe(
      'https://resource.openai.azure.com/openai',
    );
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(mockAzureResponsesStreamSimple);
    mockAzureResponsesStreamSimple.mockReturnValue(mockStreamResult);

    const streamFn = await bindPiStream(adapter, {
      apiKey: 'azure-key',
      azureApiVersion: '2025-04-01-preview',
      fetch: mockFetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 2048,
    });
    const model = { api: 'azure-openai-responses' } as PiModel<SupportedPiApi>;
    expect(streamFn(model, context)).toBe(mockStreamResult);
    expect(mockAzureResponsesStreamSimple).toHaveBeenCalledWith(
      model,
      context,
      expect.objectContaining({
        apiKey: 'azure-key',
        azureApiVersion: '2025-04-01-preview',
      }),
    );
  });

  test.each(CASES)(
    'sends keyless $endpointType requests without generated authentication headers',
    async (testCase) => {
      const adapter = resolvePiApiAdapter(testCase.endpointType);
      const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
        `@earendil-works/pi-ai/api/${testCase.api}`,
      );
      jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
      const fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBeNull();
        expect(headers.get('x-api-key')).toBeNull();
        expect(headers.get('x-goog-api-key') || null).toBeNull();
        expect(headers.get('x-app')).toBe('Cherry');
        return new Response(JSON.stringify({ error: { message: 'Gateway received request' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const globalFetch = testCase.expectedFetch
        ? undefined
        : jest.spyOn(globalThis, 'fetch').mockImplementation(fetch);
      const streamFn = await bindPiStream(adapter, {
        apiKey: '',
        fetch,
        headers: { 'X-App': 'Cherry' },
        maxRetries: 0,
        maxTokens: 256,
      });
      const model = {
        api: testCase.api,
        provider: 'keyless-gateway',
        id: 'test-model',
        name: 'Test model',
        baseUrl: testCase.expectedBaseUrl,
        reasoning: false,
        input: ['text'],
        contextWindow: 4096,
        maxTokens: 256,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      } as PiModel<SupportedPiApi>;
      const source = await streamFn(
        model,
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
      );
      const result = await source.result();
      globalFetch?.mockRestore();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.errorMessage).toContain('Gateway received request');
    },
  );

  test('sends Kimi Code OAuth credentials through its official Chat Completions endpoint', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
      '@earendil-works/pi-ai/api/openai-completions',
    );
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
    const fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input instanceof Request ? input.url : String(input)).toBe(
        'https://api.kimi.com/coding/v1/chat/completions',
      );
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer kimi-access');
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'kimi-for-coding' });
      return new Response(JSON.stringify({ error: { message: 'Kimi received request' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const streamFn = await bindPiStream(adapter, {
      fetch,
      headers: { Authorization: 'Bearer kimi-access' },
      maxRetries: 0,
      maxTokens: 256,
    });
    const source = await streamFn(
      KIMI_CODING_MODELS['kimi-for-coding'],
      normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
    );
    expect((await source.result()).errorMessage).toContain('Kimi received request');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('preserves configured authentication headers on a keyless gateway', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.ANTHROPIC_MESSAGES);
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(mockAnthropicStreamSimple);
    const streamFn = await bindPiStream(adapter, {
      apiKey: '',
      fetch: mockFetch,
      headers: { aUtHoRiZaTiOn: 'Bearer gateway-token' },
      maxRetries: 0,
      maxTokens: 256,
    });

    await streamFn({ api: 'anthropic-messages' } as PiModel<SupportedPiApi>, context);

    expect(mockAnthropicStreamSimple.mock.calls.at(-1)?.[2].headers).toEqual({
      aUtHoRiZaTiOn: 'Bearer gateway-token',
      'x-api-key': null,
    });
  });

  test('composes existing payload hooks and recomputes thinking budgets for each request cap', async () => {
    const { traces, records } = createTraceRecorder();
    const trace = traces.startTrace('pi.generate_content');
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.ANTHROPIC_MESSAGES);
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(mockAnthropicStreamSimple);
    const streamFn = await bindPiStream(adapter, {
      apiKey: 'key',
      fetch: mockFetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 8192,
      requestParameters: {
        model: {
          reasoning: { selectableEfforts: ['high'], thinkingTokenLimits: { min: 1024, max: 8192 } },
        } as Model,
        profile: selectFormatWire(REASONING_FORMAT_PROFILES.anthropic, 'budget'),
        selection: 'high',
      },
    });
    const piModel = { api: 'anthropic-messages' } as PiModel<SupportedPiApi>;
    await streamFn(piModel, context, {
      trace,
      maxTokens: 2048,
      onPayload: async () => ({
        model: 'rewritten-model',
        max_tokens: 8192,
        tool_choice: { type: 'none' },
      }),
    });
    const options = mockAnthropicStreamSimple.mock.calls.at(-1)![2];
    expect(await options.onPayload({}, piModel)).toEqual({
      model: 'rewritten-model',
      max_tokens: 2048,
      tool_choice: { type: 'none' },
      thinking: { type: 'enabled', budget_tokens: 2047 },
    });
    expect(options).not.toHaveProperty('trace');
    trace?.end('ok');
    expect(records.at(-1)?.attributes).toEqual({
      'gen_ai.request.max_tokens': 2048,
      'gen_ai.request.max_tokens_field': 'max_tokens',
    });
  });

  test('applies Gemini tool compatibility after an existing payload hook without registry parameters', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(mockOpenAiCompletionsStreamSimple);
    const stream = await bindPiStream(adapter, {
      apiKey: 'key',
      fetch: mockFetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 256,
    });
    const piModel = { api: 'openai-completions', id: 'gemini-3-pro' } as PiModel<SupportedPiApi>;
    await stream(piModel, context, {
      onPayload: async () => ({
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
        ],
      }),
    });
    const options = mockOpenAiCompletionsStreamSimple.mock.calls.at(-1)![2];
    expect(await options.onPayload({}, piModel)).toMatchObject({
      messages: [
        {
          tool_calls: [
            {
              extra_content: { google: { thought_signature: 'skip_thought_signature_validator' } },
            },
          ],
        },
      ],
    });
  });

  test.each([
    {
      provider: 'custom',
      id: 'opus-5.5',
      baseUrl: 'https://api.anthropic.com',
      omitCompletedThinking: true,
    },
    {
      provider: 'cherryin',
      id: 'anthropic/claude-sonnet-5.5',
      baseUrl: 'https://open.cherryin.net',
      omitCompletedThinking: true,
    },
    {
      provider: 'custom',
      id: 'claude-sonnet-5-5',
      baseUrl: 'https://relay.example/anthropic',
      omitCompletedThinking: true,
    },
    {
      provider: 'deepseek',
      id: 'deepseek-flash',
      baseUrl: 'https://api.deepseek.com/anthropic',
      omitCompletedThinking: false,
    },
  ])(
    '$provider/$id preserves active thinking bytes and applies its completed-turn replay policy',
    async ({ provider, id, baseUrl, omitCompletedThinking }) => {
      const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
        '@earendil-works/pi-ai/api/anthropic-messages',
      );
      const model: PiModel<'anthropic-messages'> = {
        api: 'anthropic-messages',
        provider,
        id,
        name: id,
        baseUrl,
        input: ['text'],
        reasoning: true,
        contextWindow: 4096,
        maxTokens: 256,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      // Fake signatures prove byte preservation, not cryptographic validity.
      const expected = [
        { type: 'thinking', thinking: 'Find the deploy log.', signature: 'opaque-live-signature' },
        { type: 'redacted_thinking', data: 'opaque-live-ciphertext' },
        { type: 'tool_use', id: 'toolu_lookup', name: 'lookup', input: { query: 'deploy' } },
      ];
      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg_live',
            model: model.id,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Find the deploy log.' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'opaque-live-signature' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'redacted_thinking', data: 'opaque-live-ciphertext' },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'content_block_start',
          index: 2,
          content_block: { type: 'tool_use', id: 'toolu_lookup', name: 'lookup', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '{"query":"deploy"}' },
        },
        { type: 'content_block_stop', index: 2 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
        { type: 'message_stop' },
      ];
      const payloads: { messages: { role: string; content: unknown[] }[] }[] = [];
      const fetch = async (_url: unknown, init?: RequestInit) => {
        payloads.push(JSON.parse(String(init?.body)));
        return new Response(
          events
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      };
      const user = { role: 'user' as const, content: 'Find deploy', timestamp: 0 };
      const options = {
        apiKey: 'test',
        fetch,
        maxRetries: 0,
        onPayload: (payload: unknown) => applyPiWebReplay(payload, model, []),
      };
      const first = await (
        await streamSimple(model, normalizeContext({ messages: [user] }), options)
      ).result();
      expect(first.stopReason).toBe('toolUse');
      expect(payloads[0]).toMatchObject({ thinking: { type: 'disabled' } });
      await (
        await streamSimple(
          model,
          normalizeContext({
            messages: [
              user,
              first,
              {
                role: 'toolResult',
                toolCallId: 'toolu_lookup',
                toolName: 'lookup',
                content: [{ type: 'text', text: 'Found' }],
                isError: false,
                timestamp: 1,
              },
            ],
          }),
          options,
        )
      ).result();
      expect(JSON.stringify(payloads[1]!.messages[1]!.content)).toBe(JSON.stringify(expected));
      expect(payloads[1]!.messages[2]!.content).toEqual([
        {
          type: 'tool_result',
          tool_use_id: 'toolu_lookup',
          content: 'Found',
          is_error: false,
          cache_control: { type: 'ephemeral' },
        },
      ]);
      const history = [
        user,
        first,
        {
          role: 'toolResult' as const,
          toolCallId: 'toolu_lookup',
          toolName: 'lookup',
          content: [{ type: 'text' as const, text: 'Found' }],
          isError: false,
          timestamp: 1,
        },
        {
          ...first,
          stopReason: 'stop' as const,
          content: [{ type: 'text' as const, text: 'Found it.' }],
        },
        { ...user, content: 'What changed?' },
      ];
      await (await streamSimple(model, normalizeContext({ messages: history }), options)).result();
      expect(payloads[2]!.messages[1]!.content).toEqual(
        omitCompletedThinking ? [expected[2]] : expected,
      );
      expect(JSON.stringify(payloads[2])).toContain('Found it.');
    },
  );

  test.each([
    { id: 'deepseek-v4-flash', reasoning: true, field: 'reasoning' },
    { id: 'deepseek-v4-flash', reasoning: false, field: 'reasoning_text' },
    { id: 'cloud-alias', reasoning: false, field: 'reasoning_content' },
  ])(
    'replays same-model CherryAI tool history for $id with saved field $field',
    async ({ id, reasoning, field }) => {
      const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
      const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
        '@earendil-works/pi-ai/api/openai-completions',
      );
      jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
      const model: PiModel<'openai-completions'> = {
        api: 'openai-completions',
        provider: CLOUD_PROVIDER_ID,
        id,
        name: id,
        baseUrl: 'https://cloud.example/v1',
        input: ['text'],
        reasoning,
        contextWindow: 4096,
        maxTokens: 256,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      const uniqueId = createUniqueModelId(model.provider, model.id);
      const stored: AgentMessageView = {
        id: 'answer',
        sessionId: 'session',
        turnId: 'earlier',
        role: 'assistant',
        status: 'success',
        modelId: uniqueId,
        inferenceSnapshot: null,
        stats: null,
        createdAt: '2026-11-25T00:00:00Z',
        updatedAt: '2026-11-25T00:00:00Z',
        parts: [
          { type: 'reasoning', id: 'thought', text: 'Compare the results.', state: 'done' },
          { type: 'text', id: 'text', text: 'Done.', state: 'done' },
        ],
      };
      const rebuilt = toPiConversation(
        {
          instructions: '',
          input: [],
          history: toRuntimeHistory([
            stored,
            { ...stored, modelId: createUniqueModelId('other', model.id) },
          ]),
        },
        { ...model, api: 'cherry' },
      );
      const toolCall: AssistantMessage = {
        ...emptyAssistantMessage(model),
        stopReason: 'toolUse',
        content: [
          { type: 'thinking', thinking: 'Read the result.', thinkingSignature: field },
          { type: 'toolCall', id: 'call', name: 'lookup', arguments: {} },
        ],
      };
      const fetch = jest.fn(
        async (_url: unknown, _init?: RequestInit) =>
          new Response(
            'data: {"choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream' },
            },
          ),
      );
      const stream = await bindPiStream(adapter, {
        apiKey: 'fixture',
        fetch,
        headers: {},
        maxRetries: 0,
        maxTokens: 256,
        requestParameters: {
          model: {
            id: uniqueId,
            providerId: model.provider,
            modelId: model.id,
            name: model.name,
            capabilities: [],
            isEnabled: true,
            isHidden: false,
            supportsStreaming: true,
            reasoning: reasoning
              ? { selectableEfforts: ['high'], defaultEffort: 'high' }
              : undefined,
          },
          profile: REASONING_FORMAT_PROFILES['openai-chat'].wire,
          selection: 'default',
        },
      });
      const response = await stream(
        model,
        normalizeContext({
          tools: [
            {
              name: 'lookup',
              description: 'Look up an item',
              parameters: { type: 'object', properties: {} },
            },
          ],
          messages: [
            ...rebuilt.history,
            toolCall,
            {
              role: 'toolResult',
              toolCallId: 'call',
              toolName: 'lookup',
              content: [{ type: 'text', text: 'Found.' }],
              isError: false,
              timestamp: 1,
            },
          ],
        }),
      );
      expect((await response.result()).stopReason).toBe('stop');
      const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      expect(sent.tools).toHaveLength(1);
      expect(sent.messages.filter((item: { role: string }) => item.role === 'assistant')).toEqual([
        { role: 'assistant', content: 'Done.', reasoning_content: 'Compare the results.' },
        { role: 'assistant', content: 'Done.', reasoning_content: '' },
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'Read the result.',
          tool_calls: [
            { id: 'call', type: 'function', function: { name: 'lookup', arguments: '{}' } },
          ],
        },
      ]);
    },
  );

  test('round-trips streamed Gemini tool signatures through saved context and isolates foreign histories', async () => {
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
      '@earendil-works/pi-ai/api/openai-completions',
    );
    jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
    const payloads: Record<string, unknown>[] = [];
    const completion = (deltas: Record<string, unknown>[], finishReason: string) =>
      new Response(
        [...deltas, {}]
          .map(
            (delta, index) =>
              `data: ${JSON.stringify({
                id: 'completion',
                choices: [
                  { index: 0, delta, finish_reason: index === deltas.length ? finishReason : null },
                ],
              })}\n\n`,
          )
          .join('') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    const fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return payloads.length === 1
        ? completion(
            [
              {
                tool_calls: [
                  {
                    index: 0,
                    id: 'signed',
                    type: 'function',
                    function: { name: 'lookup', arguments: '{}' },
                  },
                  {
                    index: 1,
                    id: 'unsigned',
                    type: 'function',
                    function: { name: 'lookup', arguments: '{}' },
                  },
                ],
              },
              // The signature may arrive after the call's ID, name and arguments.
              {
                tool_calls: [
                  {
                    index: 0,
                    extra_content: { google: { thought_signature: 'real-google-signature' } },
                  },
                ],
              },
              { tool_calls: [{ index: 0, extra_content: { google: { thought_signature: '' } } }] },
            ],
            'tool_calls',
          )
        : completion([{ content: 'Done' }], 'stop');
    });
    const stream = await bindPiStream(adapter, {
      apiKey: 'key',
      fetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 256,
    });
    const model: PiModel<'openai-completions'> = {
      api: 'openai-completions',
      provider: 'gemini-compatible',
      id: 'gemini-3-pro',
      name: 'Gemini',
      baseUrl: 'https://provider.test/v1',
      input: ['text'],
      reasoning: true,
      contextWindow: 4096,
      maxTokens: 256,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const first = await (
      await stream(
        model,
        normalizeContext({
          messages: [{ role: 'user', content: 'Look up both items.', timestamp: 1 }],
        }),
      )
    ).result();
    expect(first.stopReason).toBe('toolUse');
    expect(first.content).toEqual([
      expect.objectContaining({ id: 'signed', thoughtSignature: 'real-google-signature' }),
      expect.not.objectContaining({ thoughtSignature: expect.anything() }),
    ]);
    const saved = JSON.parse(JSON.stringify(first)) as AssistantMessage;
    const legacy = { type: 'reasoning.encrypted', id: 'legacy', data: 'encrypted-reasoning' };
    saved.content.push({
      type: 'toolCall',
      id: 'legacy',
      name: 'lookup',
      arguments: {},
      thoughtSignature: JSON.stringify(legacy),
    });
    for (const replay of [
      { model, message: saved, signed: true },
      { model: { ...model, provider: 'other-provider' }, message: saved, signed: false },
      { model: { ...model, id: 'gemini-4-argon' }, message: saved, signed: false },
      { model, message: { ...saved, api: 'google-generative-ai' as const }, signed: false },
    ]) {
      const source = await stream(replay.model, normalizeContext({ messages: [replay.message] }));
      expect((await source.result()).stopReason).toBe('stop');
      const assistant = (payloads.at(-1)!.messages as Record<string, unknown>[]).find(
        (message) => message.role === 'assistant',
      )!;
      const calls = assistant.tool_calls as {
        id: string;
        extra_content: { google: { thought_signature: string } };
      }[];
      expect(calls.map((call) => [call.id, call.extra_content.google.thought_signature])).toEqual([
        ['signed', replay.signed ? 'real-google-signature' : 'skip_thought_signature_validator'],
        ['unsigned', 'skip_thought_signature_validator'],
        ['legacy', 'skip_thought_signature_validator'],
      ]);
      if (replay.signed) expect(assistant.reasoning_details).toEqual([legacy]);
      else expect(assistant).not.toHaveProperty('reasoning_details');
    }
    expect(saved.content[0]).toMatchObject({ thoughtSignature: 'real-google-signature' });
  });

  test.each([
    {
      endpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      payload: { max_tokens: 1024 },
      field: 'max_tokens',
    },
    {
      endpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      payload: { max_completion_tokens: 1024 },
      field: 'max_completion_tokens',
    },
    {
      endpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
      payload: { max_output_tokens: 1024 },
      field: 'max_output_tokens',
    },
    {
      endpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      payload: { config: { maxOutputTokens: 1024 } },
      field: 'config.maxOutputTokens',
    },
    {
      endpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
      family: 'openai-codex',
      payload: {},
      field: 'omitted',
    },
  ])(
    'records the final $field output cap without retaining the payload',
    async ({ endpoint, family, payload, field }) => {
      const { traces, records } = createTraceRecorder();
      const trace = traces.startTrace('pi.generate_content');
      const adapter = resolvePiApiAdapter(endpoint, family);
      const streamSimple = jest.fn((..._args: Parameters<PiStreamFn>) => mockStreamResult);
      jest
        .spyOn(adapter, 'loadStreamSimple')
        .mockResolvedValue(streamSimple as unknown as PiStreamFn);
      const streamFn = await bindPiStream(adapter, {
        apiKey: 'private-key',
        fetch: mockFetch,
        headers: {},
        maxRetries: 0,
        maxTokens: 2048,
      });
      const model = { api: adapter.api } as PiModel<SupportedPiApi>;
      await streamFn(model, context, { trace });
      const options = streamSimple.mock.calls[0]![2] as Parameters<PiStreamFn>[2];
      const body = { ...payload, input: 'private user content' };
      expect(await options?.onPayload?.(body, model)).toBe(body);
      expect(options).not.toHaveProperty('trace');
      trace?.end('ok');
      expect(records.at(-1)?.attributes).toEqual({
        'gen_ai.request.max_tokens_field': field,
        ...(field === 'omitted' ? {} : { 'gen_ai.request.max_tokens': 1024 }),
      });
      expect(JSON.stringify(records)).not.toContain('private');
    },
  );
});
