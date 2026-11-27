import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Api, AssistantMessage, Message, Model, Models } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import { toAgentErrorView } from '../../../host/runtimeProjection';
import type { RuntimeModelPreflight, RuntimeOptions } from '../../types';
import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import { summarizePiCompaction } from '../piCompaction';
import { createPiDurableModels } from '../piDurableModels';
import { readPiTerminalError } from '../piModelError';
import type { PiModelResolution } from '../piModelTypes';
import { PiNonStreamingUnsupportedError } from '../piNonStreamingFetch';
import { emptyAssistantMessage } from '../piStreamEvents';

const preflight: RuntimeModelPreflight = {
  contextWindow: 32_768,
  inputModalities: ['text'],
  maxInputTokens: 28_672,
  maxOutputTokens: 4_096,
  supportsTools: true,
};
const reference = { providerId: 'business-provider', modelId: 'configured-model' };
const wire: Model<Api> = {
  api: 'openai-completions',
  provider: reference.providerId,
  id: 'wire-model',
  name: 'Configured model',
  baseUrl: 'https://provider.example/v1',
  contextWindow: preflight.contextWindow,
  maxTokens: preflight.maxOutputTokens,
  input: ['text'],
  reasoning: true,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function setup(
  traceRequest?: Parameters<typeof createPiDurableModels>[3],
  modelPreflight = preflight,
  resolvedModel = wire,
) {
  const streamFn = jest.fn(() => {
    const stream = new AssistantMessageEventStream();
    const message = { ...emptyAssistantMessage(wire), stopReason: 'stop' as const };
    stream.push({ type: 'done', reason: 'stop', message });
    stream.end(message);
    return stream;
  });
  const resolveModel = jest.fn(
    async (): Promise<PiModelResolution> => ({
      model: resolvedModel,
      streamFn,
      defaultThinkingLevel: 'off',
      maxInputTokens: modelPreflight.maxInputTokens,
      redactionValues: [],
      supportsTools: true,
      usageContext: {
        providerId: reference.providerId,
        providerName: null,
        modelId: reference.modelId,
        modelName: null,
        pricingSnapshot: null,
        trustProviderReportedCost: false,
        reportedCostCurrency: null,
        credentialReceipt: { attribution: 'unknown' },
      },
    }),
  );
  const configuration = jest.fn<Promise<RuntimeOptions>, []>(async () => ({
    maxOutputTokens: 512,
    temperature: 0.3,
  }));
  const bridge = createPiDurableModels(
    {
      preflightModel: async () => modelPreflight,
      resolveModel,
    },
    configuration,
    undefined,
    traceRequest,
  );
  return { ...bridge, streamFn, resolveModel, configuration };
}

describe('Pi durable model bridge', () => {
  test.each(['event', 'throw'] as const)(
    'preserves a textless stream-stage 429 from a provider %s',
    async (kind) => {
      const bridge = setup();
      const message = emptyAssistantMessage(wire);
      const source = new AssistantMessageEventStream();
      if (kind === 'event') {
        source.push({
          type: 'error',
          reason: 'error',
          error: {
            ...message,
            stopReason: 'error',
            errorMessage: 'Too many requests',
            diagnostics: [
              {
                type: 'provider_response_failure',
                timestamp: 1,
                error: { code: 'rate_limit_exceeded', message: 'Too many requests' },
                details: { status: 429 },
              },
            ],
          },
        });
      } else {
        source[Symbol.asyncIterator] = async function* () {
          yield { type: 'start', partial: message };
          throw Object.assign(new Error('Too many requests'), {
            code: 'rate_limit_exceeded',
            status: 429,
          });
        };
      }
      bridge.streamFn.mockReturnValueOnce(source);
      await bridge.registerModel(reference);
      const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
        messages: [],
      });
      expect(result).toMatchObject({ stopReason: 'error', content: [] });
      expect(toAgentErrorView(readPiTerminalError(result)!)).toMatchObject({
        retryable: true,
        failure: { reasonCode: 'rate_limit', context: { statusCode: 429 } },
      });
    },
  );

  test.each([
    ['openai-completions', { type: 'function', function: { name: 'read_file', parameters: {} } }],
    ['openai-responses', { type: 'function', name: 'read_file', parameters: {} }],
    ['anthropic-messages', { name: 'read_file', input_schema: { type: 'object' } }],
  ] as const)(
    'guards DeepSeek safety checks against outgoing client tools on %s',
    async (api, clientTool) => {
      const model = { ...wire, api, id: 'deepseek-flash' };
      const nativeTools = [{ type: 'deepseek_web_search' }, { type: 'deepseek_read_url' }];
      for (const tools of [
        undefined,
        [],
        nativeTools,
        [clientTool],
        [...nativeTools, clientTool],
      ]) {
        const bridge = setup(undefined, preflight, model);
        const resolved = await bridge.resolveModel();
        const body = { model: model.id, ...(tools === undefined ? {} : { tools }) };
        let sent: unknown;
        bridge.resolveModel.mockResolvedValueOnce({
          ...resolved,
          deepseekSafetyCheck: true,
          async streamFn(wire, _context, options) {
            sent = await options?.onPayload?.({ model: wire.id }, wire);
            return bridge.streamFn();
          },
        });
        await bridge.registerModel(reference);
        await bridge.models.completeSimple(
          bridge.getModel(reference)!,
          { messages: [] },
          {
            onPayload: () => body,
          },
        );
        expect(sent).toEqual({
          ...body,
          ...(tools?.includes(clientTool) ? {} : { safety_check: { level: 'high' } }),
        });
      }
    },
  );

  test.each(['done', 'error'] as const)(
    'clears DeepSeek refusal content before persisting a %s event',
    async (terminal) => {
      const model = { ...wire, id: 'deepseek-flash' };
      const bridge = setup(undefined, preflight, model);
      const resolved = await bridge.resolveModel();
      bridge.resolveModel.mockResolvedValueOnce({
        ...resolved,
        deepseekSafetyCheck: true,
        async streamFn(wire, _context, options) {
          const payload = await options?.onPayload?.({ model: wire.id }, wire);
          expect(payload).toMatchObject({ safety_check: { level: 'high' } });
          const source = new AssistantMessageEventStream();
          const partial: AssistantMessage = {
            ...emptyAssistantMessage(wire),
            content: [{ type: 'text', text: 'Already streamed' }],
          };
          source.push({ type: 'start', partial });
          source.push({
            type: 'text_delta',
            contentIndex: 0,
            delta: 'Already streamed',
            partial,
          });
          await options?.onProviderStreamEvent?.(
            { choices: [{ delta: {}, finish_reason: 'content_filter' }] },
            wire,
          );
          if (terminal === 'done') source.push({ type: 'done', reason: 'stop', message: partial });
          else
            source.push({
              type: 'error',
              reason: 'error',
              error: { ...partial, stopReason: 'error' },
            });
          source.end();
          return source;
        },
      });
      await bridge.registerModel(reference);
      const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
        messages: [],
      });
      expect(result).toMatchObject({
        stopReason: 'error',
        rawStopReason: 'content_filter',
        content: [],
      });
    },
  );

  test.each([
    [1_048_576, undefined, undefined, 65_536],
    [1_048_576, 131_072, undefined, 131_072],
    [1_048_576, undefined, 131_072, 131_072],
    [1_048_576, 131_072, 262_144, 131_072],
    [1_048_576, 1_024, 512, 512],
    [1_048_576, 13_107, undefined, 13_107],
    [128_000, undefined, undefined, 65_536],
  ])(
    'reserves output for ceiling %i, options %s, selected %s',
    async (ceiling, options, selected, expected) => {
      const model = { ...wire, maxTokens: ceiling, contextWindow: 1_048_576 };
      const bridge = setup(
        undefined,
        {
          ...preflight,
          contextWindow: model.contextWindow,
          maxInputTokens: 32_000,
          maxOutputTokens: ceiling,
        },
        model,
      );
      bridge.configuration.mockResolvedValueOnce({ maxOutputTokens: selected });
      await bridge.registerModel(reference);
      const registered = bridge.getModel(reference)!;
      expect(registered.maxTokens).toBe(ceiling);
      expect(registered.contextWindow).toBe(32_000);
      await bridge.models.completeSimple(registered, { messages: [] }, { maxTokens: options });
      expect(bridge.streamFn).toHaveBeenCalledWith(
        model,
        expect.anything(),
        expect.objectContaining({ maxTokens: expected }),
      );
    },
  );

  test('finite compaction uses the bound transport and records terminal usage once', async () => {
    const bridge = setup();
    const resolved = await bridge.resolveModel();
    const model = { ...wire, compat: { supportsFinishReason: false } };
    const fetch = jest.fn(
      async (_input: unknown, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: '<summary>Finite summary</summary>' } },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const streamFn = await bindPiStream(
      {
        ...resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS),
        loadStreamSimple: async () =>
          jest.requireActual('@earendil-works/pi-ai/api/openai-completions').streamSimple,
      },
      {
        shouldStream: false,
        apiKey: 'key',
        fetch,
        headers: {},
        maxRetries: 0,
        maxTokens: 512,
      },
    );
    const onUsage = jest.fn(async () => undefined);
    const durable = createPiDurableModels(
      {
        preflightModel: async () => preflight,
        resolveModel: async () => ({ ...resolved, model, streamFn }),
      },
      async () => ({}),
      async () => onUsage,
    );
    await durable.registerModel(reference);
    const registered = durable.getModel(reference)!;
    await expect(
      summarizePiCompaction(
        [{ role: 'user', content: 'Remember the important facts.', timestamp: 1 }],
        durable.models,
        registered,
        {
          limits: { contextWindow: 32768, maxInputTokens: 28672, maxOutputTokens: 512 },
          sessionId: 'session',
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toBe('Finite summary');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ stream: false });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ inputTokens: 20, outputTokens: 5, totalTokens: 25 }),
      }),
    );
  });

  test('projects unsupported finite Codex mode to a clear non-retryable chat error', async () => {
    const bridge = setup();
    bridge.resolveModel.mockRejectedValueOnce(
      new PiNonStreamingUnsupportedError('openai-codex-responses'),
    );
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('error');
    expect(toAgentErrorView(readPiTerminalError(result)!)).toMatchObject({
      code: 'EXECUTION_FAILED',
      retryable: false,
      message: 'This transport requires streaming. Turn on streaming for this model.',
    });
    expect(bridge.resolveModel).toHaveBeenCalledTimes(1);
    expect(bridge.streamFn).not.toHaveBeenCalled();
  });

  test('fits compaction into small input windows and keeps image requests exempt', async () => {
    for (const contextWindow of [512, 8_192, 131_072]) {
      const bridge = setup(undefined, {
        ...preflight,
        contextWindow,
        maxInputTokens: contextWindow,
        maxOutputTokens: 16_384,
      });
      await bridge.registerModel(reference);
      const policy = bridge.compactionOverrides[`${reference.providerId}/${reference.modelId}`]!;
      expect(
        policy.reserveTokens! + policy.keepRecentTokens! + policy.backgroundTokens!,
      ).toBeLessThan(contextWindow);
      await bridge.registerModel(reference, 'image');
      const image = bridge.getModel(reference, 'image')!;
      expect(bridge.compactionOverrides[`${image.provider}/${image.id}`]).toEqual({
        enabled: false,
      });
      expect(bridge.compactionOverrides[`${reference.providerId}/${reference.modelId}`]).toEqual(
        policy,
      );
    }
  });

  test('starts background compaction at 80 percent of the input budget of a million-token model', async () => {
    const bridge = setup(undefined, {
      ...preflight,
      contextWindow: 1_000_000,
      maxInputTokens: 1_000_000,
      maxOutputTokens: 393_216,
    });
    await bridge.registerModel(reference);
    const policy = bridge.compactionOverrides[`${reference.providerId}/${reference.modelId}`]!;
    const blocking = 1_000_000 - policy.reserveTokens!;
    expect(blocking).toBe(930_368);
    expect(blocking - policy.backgroundTokens!).toBe(744_294);
  });

  test('summarizes oversized history in order and carries successful summaries forward', async () => {
    const model = { ...wire, contextWindow: 8_192, maxTokens: 512 };
    const signal = new AbortController().signal;
    let calls = 0;
    const completeSimple = jest.fn<Promise<AssistantMessage>, Parameters<Models['completeSimple']>>(
      async (_model, _context, _options): Promise<AssistantMessage> => {
        const number = ++calls;
        return {
          ...emptyAssistantMessage(model),
          stopReason: 'stop',
          content: [{ type: 'text', text: `<summary>chunk ${number}</summary>` }],
        };
      },
    );
    const history = Array.from({ length: 8 }, (_, index) => ({
      role: 'user' as const,
      content: `entry ${index} ${'distinct words '.repeat(800)}`,
      timestamp: index,
    }));
    const summary = await summarizePiCompaction(history, { completeSimple }, model, {
      limits: { contextWindow: 8_192, maxInputTokens: 8_192, maxOutputTokens: 512 },
      sessionId: 'session',
      signal,
    });
    const requests = completeSimple.mock.calls.map(([, context]) => {
      expect(context.messages.map((message) => message.role)).toEqual(['system', 'user']);
      return context.messages.map((message) => message.content).join('\n');
    });
    expect(requests.length).toBeGreaterThan(1);
    expect(requests[0]).toContain('entry 0');
    expect(requests[0]).not.toContain('entry 7');
    expect(requests[1]).toContain('chunk 1');
    expect(requests.at(-1)).toContain('entry 7');
    expect(summary).toBe(`chunk ${requests.length}`);
  });

  test('sends one non-empty user message when summarizing image-only prompts and empty assistant turns', async () => {
    const completeSimple = jest
      .fn<Promise<AssistantMessage>, Parameters<Models['completeSimple']>>()
      .mockResolvedValue({
        ...emptyAssistantMessage(wire),
        content: [{ type: 'text', text: '<summary>kept</summary>' }],
      });
    const history: Message[] = [
      {
        role: 'user',
        content: [{ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }],
        timestamp: 1,
      },
      {
        ...emptyAssistantMessage(wire),
        content: [],
        timestamp: 2,
      },
      {
        role: 'user',
        content: 'Remember this detail',
        timestamp: 3,
      },
    ];
    await expect(
      summarizePiCompaction(history, { completeSimple }, wire, {
        limits: preflight,
        sessionId: 'session',
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('kept');
    expect(completeSimple).toHaveBeenCalledTimes(1);
    const sent = completeSimple.mock.calls[0]![1].messages;
    expect(sent.map((message) => message.role)).toEqual(['system', 'user']);
    const userContent = sent[1]!.content as string;
    expect(userContent).toContain('Remember this detail');
    expect(userContent).not.toContain('[Assistant]');
  });

  test.each([
    'The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)',
    'Range of input length should be [1, 8192]',
  ])('shrinks summary chunks on provider overflow wording: %s', async (errorMessage) => {
    const model = { ...wire, contextWindow: 8_192, maxTokens: 512 };
    const completeSimple = jest
      .fn<Promise<AssistantMessage>, Parameters<Models['completeSimple']>>()
      .mockImplementationOnce(async () => ({
        ...emptyAssistantMessage(model),
        stopReason: 'error',
        errorMessage,
      }))
      .mockImplementation(async (_model, context) => ({
        ...emptyAssistantMessage(model),
        content: [
          {
            type: 'text',
            text: `<summary>ok:${String(context.messages[1]!.content).length}</summary>`,
          },
        ],
      }));
    const history = Array.from({ length: 6 }, (_, index) => ({
      role: 'user' as const,
      content: `item ${index} ${'word '.repeat(500)}`,
      timestamp: index,
    }));
    const summary = await summarizePiCompaction(history, { completeSimple }, model, {
      limits: { contextWindow: 8_192, maxInputTokens: 8_192, maxOutputTokens: 512 },
      sessionId: 'session',
      signal: new AbortController().signal,
    });
    expect(summary).toMatch(/^ok:/);
    expect(completeSimple.mock.calls.length).toBeGreaterThan(1);
    const firstUserLength = String(completeSimple.mock.calls[0]![1].messages[1]!.content).length;
    const retriedUserLength = String(completeSimple.mock.calls[1]![1].messages[1]!.content).length;
    expect(retriedUserLength).toBeLessThan(firstUserLength);
  });

  test.each([4_096, 16_384])(
    'fits large tool arguments into a 4096-input-token model with a %i-token total window',
    async (contextWindow) => {
      const model = { ...wire, contextWindow: 4_096, maxTokens: 4_096 };
      const completeSimple = jest
        .fn<Promise<AssistantMessage>, Parameters<Models['completeSimple']>>()
        .mockResolvedValue({
          ...emptyAssistantMessage(model),
          content: [{ type: 'text', text: 'progress' }],
        });
      const history: Message[] = [
        {
          ...emptyAssistantMessage(model),
          content: [
            {
              type: 'toolCall',
              id: 'file-1',
              name: 'write_file',
              arguments: {
                content: `start-of-file ${'body '.repeat(6_000)} end-of-file`,
              },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'file-1',
          toolName: 'write_file',
          content: [{ type: 'text', text: 'Saved' }],
          isError: false,
          timestamp: 1,
        },
      ];
      await expect(
        summarizePiCompaction(history, { completeSimple }, model, {
          limits: { contextWindow, maxInputTokens: 4_096, maxOutputTokens: model.maxTokens },
          sessionId: 'session',
          signal: new AbortController().signal,
        }),
      ).resolves.toBe('progress');
      const requests = completeSimple.mock.calls.map(([, context, options]) => {
        expect(options?.maxTokens).toBe(1_024);
        return context.messages.map((message) => message.content).join('\n');
      });
      const start = requests.findIndex((request) => request.includes('start-of-file'));
      const end = requests.findIndex((request) => request.includes('end-of-file'));
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      expect(requests.at(-1)).toContain('[Tool result file-1]');
    },
  );

  test('retries a transient summary failure on the same chunk', async () => {
    jest.useFakeTimers();
    try {
      const completeSimple = jest
        .fn<Promise<AssistantMessage>, Parameters<Models['completeSimple']>>()
        .mockResolvedValueOnce({
          ...emptyAssistantMessage(wire),
          stopReason: 'error',
          errorMessage: '503 Service Unavailable',
        })
        .mockResolvedValueOnce({
          ...emptyAssistantMessage(wire),
          content: [{ type: 'text', text: 'summary' }],
        });
      const result = summarizePiCompaction(
        [{ role: 'user', content: 'Remember this', timestamp: 1 }],
        { completeSimple },
        wire,
        { limits: preflight, sessionId: 'session', signal: new AbortController().signal },
      );
      const settled = expect(result).resolves.toBe('summary');
      await jest.runAllTimersAsync();
      await settled;
      expect(completeSimple).toHaveBeenCalledTimes(2);
      expect(completeSimple.mock.calls[1]).toEqual(completeSimple.mock.calls[0]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('records configuration failures that happen before resolving the provider transport', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    await bridge.registerModel(reference);
    bridge.configuration.mockRejectedValueOnce(
      Object.assign(new Error('private execution owner'), { code: 'EXECUTION_UNAVAILABLE' }),
    );
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('error');
    expect(records.at(-1)).toMatchObject({
      name: 'pi.generate_content',
      status: 'error',
      attributes: {
        'gen_ai.request.model': reference.modelId,
        'gen_ai.provider.id': reference.providerId,
        'error.code': 'EXECUTION_UNAVAILABLE',
        'error.stage': 'configuration',
        'error.category': 'unknown',
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });
  test('keeps image scheduling separate from language requests for the same Cherry model', async () => {
    const bridge = setup();
    await bridge.registerModel(reference);
    await bridge.registerModel(reference, 'image');
    expect(bridge.getModel(reference)?.api).toBe('cherry');
    expect(bridge.getModel(reference, 'image')?.api).toBe('cherry-image');
    expect(bridge.getModel(reference, 'image')?.id).not.toBe(reference.modelId);
    const language = bridge.getModel(reference)!;
    await bridge.models.completeSimple(language, { messages: [] });
    expect(bridge.resolveModel).toHaveBeenCalledTimes(1);
  });
  test('stores application model identities and resolves wire models only when requesting', async () => {
    const bridge = setup();
    await bridge.registerModel(reference);
    expect(bridge.resolveModel).not.toHaveBeenCalled();
    const model = bridge.models.getModel(reference.providerId, reference.modelId);
    if (!model) throw new Error('Expected registered model');
    const controller = new AbortController();
    expect(model).toMatchObject({
      provider: reference.providerId,
      id: reference.modelId,
      contextWindow: preflight.maxInputTokens,
    });
    await bridge.models.completeSimple(
      model,
      { messages: [{ role: 'user', content: 'Continue', timestamp: 1 }] },
      { sessionId: 'persisted-provider-session', maxTokens: 1_024, signal: controller.signal },
    );
    expect(bridge.resolveModel).toHaveBeenCalledWith(
      reference,
      { maxOutputTokens: 512, temperature: 0.3 },
      'persisted-provider-session',
      undefined,
      controller.signal,
    );
    expect(bridge.streamFn).toHaveBeenCalledWith(
      wire,
      expect.objectContaining({ messages: expect.any(Array) }),
      expect.objectContaining({ sessionId: 'persisted-provider-session', maxTokens: 512 }),
    );
  });

  test('does not expand the provider output cap selected by Pi', async () => {
    const bridge = setup();
    await bridge.registerModel(reference);
    const model = bridge.models.getModel(reference.providerId, reference.modelId);
    if (!model) throw new Error('Expected registered model');
    await bridge.models.completeSimple(model, { messages: [] }, { maxTokens: 128 });
    expect(bridge.streamFn).toHaveBeenCalledWith(
      wire,
      expect.anything(),
      expect.objectContaining({ maxTokens: 128 }),
    );
  });

  test('applies application temperature and default thinking while respecting the resolved wire output cap', async () => {
    const bridge = setup();
    bridge.configuration.mockResolvedValueOnce({ maxOutputTokens: 8_192, temperature: 0.1 });
    await bridge.registerModel(reference);
    const model = bridge.models.getModel(reference.providerId, reference.modelId);
    if (!model) throw new Error('Expected registered model');
    await bridge.models.completeSimple(
      model,
      { messages: [] },
      { maxTokens: 6_144, temperature: 0.9, reasoning: 'high' },
    );
    expect(bridge.streamFn).toHaveBeenCalledWith(
      wire,
      expect.anything(),
      expect.objectContaining({
        maxTokens: wire.maxTokens,
        temperature: 0.1,
        reasoning: undefined,
      }),
    );
  });
});

describe('Pi durable request diagnostics', () => {
  test.each([
    { raw: 'SAFETY', stopReason: 'error', category: 'content_filter' },
    { raw: 'MALFORMED_FUNCTION_CALL', stopReason: 'error', category: 'unknown' },
    { raw: 'UNEXPECTED_TOOL_CALL', stopReason: 'error', category: 'unknown' },
    { raw: 'TOO_MANY_TOOL_CALLS', stopReason: 'error', category: 'unknown' },
    { raw: 'OTHER', stopReason: 'error', category: 'unknown' },
    { raw: undefined, stopReason: 'error', category: 'unknown' },
    { raw: 'private_finish_reason', stopReason: 'error', category: 'unknown' },
    { raw: 'completed', stopReason: 'stop', category: undefined },
    { raw: 'failed', stopReason: 'error', category: 'unknown' },
    { raw: 'cancelled', stopReason: 'error', category: 'unknown' },
    { raw: 'in_progress', stopReason: 'stop', category: undefined },
    { raw: 'queued', stopReason: 'stop', category: undefined },
    { raw: 'incomplete', stopReason: 'error', category: 'unknown' },
    { raw: 'incomplete.max_output_tokens', stopReason: 'length', category: undefined },
    { raw: 'incomplete.content_filter', stopReason: 'error', category: 'unknown' },
    { raw: 'incomplete.private_finish_reason', stopReason: 'error', category: 'unknown' },
  ] as const)(
    'records raw finish reason $raw beside $stopReason',
    async ({ raw, stopReason, category }) => {
      const { traces, records } = createTraceRecorder();
      const bridge = setup(async () => traces.startTrace('pi.generate_content'));
      const message: AssistantMessage = {
        ...emptyAssistantMessage(wire),
        stopReason,
        rawStopReason: raw,
        errorMessage: 'private provider response',
      };
      const source = new AssistantMessageEventStream();
      source.push(
        stopReason === 'error'
          ? { type: 'error', reason: stopReason, error: message }
          : { type: 'done', reason: stopReason, message },
      );
      bridge.streamFn.mockReturnValueOnce(source);
      await bridge.registerModel(reference);
      const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
        messages: [],
      });

      expect(result.rawStopReason).toBe(raw);
      expect(records.at(-1)?.attributes).toMatchObject({
        'gen_ai.response.finish_reason': stopReason,
      });
      expect(records.at(-1)?.attributes['error.category']).toBe(category);
      if (stopReason === 'error')
        expect(records.at(-1)?.attributes).toMatchObject({
          'error.retryable': false,
          'error.retry_scope': 'automatic',
        });
      expect(records.at(-1)?.attributes['gen_ai.response.raw_finish_reason']).toBe(
        raw?.includes('private') ? undefined : raw,
      );
      expect(JSON.stringify(records)).not.toContain('private');
    },
  );

  test.each([
    { code: 'stream_disconnected', retryable: true, category: 'network' },
    { code: 'no_response', retryable: true, category: 'network' },
    { code: 'stream_idle_timeout', retryable: true, category: 'timeout' },
    { code: 'insufficient_quota', status: 429, retryable: false, category: 'quota' },
    { code: 'insufficient_user_quota', status: 403, retryable: false, category: 'quota' },
    { code: 'rate_limit_exceeded', status: 429, retryable: true, category: 'rate_limit' },
    { code: 'runtime_error', status: 402, retryable: false, category: 'quota' },
    { code: 'runtime_error', status: 401, retryable: false, category: 'auth' },
    { code: 'permission_error', retryable: false, category: 'permission' },
    { code: 'api_error', retryable: false, category: 'provider_unavailable' },
    { code: 'runtime_error', status: 503, retryable: true, category: 'provider_unavailable' },
    { code: 'runtime_error', retryable: false, category: 'unknown' },
  ])('records structured $category failures without changing the response', async (failure) => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    const source = new AssistantMessageEventStream();
    const message: AssistantMessage = {
      ...emptyAssistantMessage(wire),
      stopReason: 'error',
      errorMessage: 'private response',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { name: 'ProviderError', code: failure.code, message: 'private credential' },
          // Retryability is deliberately absent: diagnostics must use the engine's classifier.
          details: { ...(failure.status ? { status: failure.status } : {}), body: 'private body' },
        },
      ],
    };
    if (failure.category === 'network' || failure.category === 'timeout')
      message.diagnostics![0]!.details!.retryable = true;
    source.push({ type: 'error', reason: 'error', error: message });
    bridge.streamFn.mockReturnValueOnce(source);
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toBe(message.errorMessage);
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: {
        'error.stage': 'stream',
        'error.category': failure.category,
        'error.code': failure.code === 'runtime_error' ? 'provider_error' : failure.code,
        'error.retryable': failure.retryable,
        'error.retry_scope': 'automatic',
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });

  test.each([
    { rawStopReason: undefined, code: 'provider_error', category: 'unknown' },
    { rawStopReason: 'SAFETY', code: 'provider_error', category: 'content_filter' },
    { rawStopReason: 'PROHIBITED_CONTENT', code: 'provider_error', category: 'content_filter' },
    { rawStopReason: 'IMAGE_RECITATION', code: 'provider_error', category: 'content_filter' },
    { rawStopReason: undefined, code: 'content_filter', category: 'content_filter' },
  ])(
    'emits $category for structured safety $rawStopReason / $code',
    async ({ rawStopReason, code, category }) => {
      const { traces, records } = createTraceRecorder();
      const bridge = setup(async () => traces.startTrace('pi.generate_content'));
      const source = new AssistantMessageEventStream();
      const message: AssistantMessage = {
        ...emptyAssistantMessage(wire),
        stopReason: 'error',
        rawStopReason,
        errorMessage: 'private content_filter_results: filtered false',
        diagnostics: [
          {
            type: 'provider_response_failure',
            timestamp: 1,
            error: { code, message: 'private message' },
            details: { body: 'private content_filter_results' },
          },
        ],
      };
      source.push({ type: 'error', reason: 'error', error: message });
      bridge.streamFn.mockReturnValueOnce(source);
      await bridge.registerModel(reference);
      const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
        messages: [],
      });
      expect(result.stopReason).toBe('error');
      expect(result.rawStopReason).toBe(rawStopReason);
      expect(result.errorMessage).toBe(message.errorMessage);
      expect(records.at(-1)).toMatchObject({
        status: 'error',
        attributes: {
          'gen_ai.response.finish_reason': 'error',
          'error.category': category,
          'error.retryable': false,
          'error.retry_scope': 'automatic',
        },
      });
      expect(JSON.stringify(records)).not.toContain('private');
      expect(JSON.stringify(records)).not.toContain('content_filter_results');
    },
  );

  test('keeps provider resolution separate from streaming failures', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    bridge.resolveModel.mockRejectedValueOnce(
      Object.assign(new Error('private model configuration'), { code: 'MODEL_UNAVAILABLE' }),
    );
    await bridge.registerModel(reference);
    await bridge.models.completeSimple(bridge.getModel(reference)!, { messages: [] });
    expect(bridge.streamFn).not.toHaveBeenCalled();
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: { 'error.stage': 'model_resolution', 'error.code': 'MODEL_UNAVAILABLE' },
    });
  });

  test('records no failure facts when the request is cancelled before a stream exists', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    const controller = new AbortController();
    bridge.resolveModel.mockImplementationOnce(async () => {
      controller.abort();
      throw Object.assign(new Error('private model configuration'), { code: 'MODEL_UNAVAILABLE' });
    });
    await bridge.registerModel(reference);
    await bridge.models.completeSimple(
      bridge.getModel(reference)!,
      { messages: [] },
      { signal: controller.signal },
    );
    expect(records.at(-1)).toMatchObject({
      status: 'cancelled',
      attributes: {
        'gen_ai.request.model': reference.modelId,
        'gen_ai.provider.id': reference.providerId,
      },
    });
    expect(Object.keys(records.at(-1)!.attributes)).toHaveLength(2);
  });

  test('does not classify an aborted stream as a network failure', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    const source = new AssistantMessageEventStream();
    const message: AssistantMessage = {
      ...emptyAssistantMessage(wire),
      stopReason: 'aborted',
      errorMessage: 'private cancellation',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { code: 'stream_disconnected', message: 'private transport error' },
          details: { retryable: true },
        },
      ],
    };
    source.push({ type: 'error', reason: 'aborted', error: message });
    bridge.streamFn.mockReturnValueOnce(source);
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('aborted');
    expect(records.at(-1)).toMatchObject({
      status: 'cancelled',
      attributes: { 'gen_ai.response.finish_reason': 'aborted' },
    });
    // A dotted string is a nested path; these attribute names are single keys.
    expect(records.at(-1)?.attributes).not.toHaveProperty(['error.category']);
    expect(records.at(-1)?.attributes).not.toHaveProperty(['error.retryable']);
    expect(JSON.stringify(records)).not.toContain('private');
  });

  test('records request facts and preserves content without collecting prompts, responses, or usage', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    const source = new AssistantMessageEventStream();
    const message: AssistantMessage = {
      ...emptyAssistantMessage(wire),
      content: [{ type: 'text', text: 'private response' }],
      stopReason: 'stop',
    };
    source.push({ type: 'start', partial: message });
    source.push({ type: 'done', reason: 'stop', message });
    bridge.streamFn.mockReturnValueOnce(source);
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [{ role: 'user', content: 'private prompt', timestamp: 1 }],
    });
    expect(result.content).toEqual(message.content);
    expect(records.at(-1)).toMatchObject({
      status: 'ok',
      attributes: {
        'gen_ai.request.model': wire.id,
        'gen_ai.provider.id': wire.provider,
        'gen_ai.provider.api': wire.api,
        'gen_ai.response.finish_reason': 'stop',
        'gen_ai.model.context_window': preflight.contextWindow,
        'gen_ai.model.max_input_tokens': preflight.maxInputTokens,
        'gen_ai.model.max_output_tokens': preflight.maxOutputTokens,
        'gen_ai.request.output_budget_tokens': 512,
        'gen_ai.request.estimated_input_tokens': 4,
        'gen_ai.request.estimate_source': 'pi_estimate',
        'gen_ai.request.message_count': 1,
        'gen_ai.request.tool_count': 0,
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
    expect(JSON.stringify(records)).not.toContain('gen_ai.usage');
  });

  test('labels a usage-based input estimate and records the smaller request output budget', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    await bridge.registerModel(reference);
    const previous: AssistantMessage = {
      ...emptyAssistantMessage(wire),
      timestamp: 2,
      stopReason: 'stop',
      usage: { ...emptyAssistantMessage(wire).usage, input: 100, output: 20, totalTokens: 120 },
      content: [{ type: 'text', text: 'private response' }],
    };
    await bridge.models.completeSimple(
      bridge.getModel(reference)!,
      {
        messages: [
          { role: 'user', content: 'private question', timestamp: 1 },
          previous,
          { role: 'user', content: '1234567', timestamp: 3 },
        ],
      },
      { maxTokens: 128 },
    );
    expect(records.at(-1)?.attributes).toMatchObject({
      'gen_ai.request.output_budget_tokens': 128,
      'gen_ai.request.estimated_input_tokens': 122,
      'gen_ai.request.estimate_source': 'pi_usage_and_estimate',
      'gen_ai.request.message_count': 3,
    });
    expect(JSON.stringify(records)).not.toMatch(/private|1234567/);
  });

  test('retains provider status and code without copying response diagnostics', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    const source = new AssistantMessageEventStream();
    const message: AssistantMessage = {
      ...emptyAssistantMessage(wire),
      stopReason: 'error',
      errorMessage: 'private response',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { name: 'ProviderError', message: 'private credential', code: 'quota' },
          details: { statusCode: 429, body: 'private body' },
        },
      ],
    };
    source.push({ type: 'error', reason: 'error', error: message });
    bridge.streamFn.mockReturnValueOnce(source);
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('error');
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: { 'http.status_code': 429, 'error.code': 'quota' },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });

  test('keeps cancellation terminal when the provider resolves late', async () => {
    const { traces, records } = createTraceRecorder();
    const trace = traces.startTrace('pi.generate_content');
    const bridge = setup(async () => trace);
    bridge.streamFn.mockImplementationOnce(() => {
      trace?.end('cancelled');
      const source = new AssistantMessageEventStream();
      const message = { ...emptyAssistantMessage(wire), stopReason: 'stop' as const };
      source.push({ type: 'done', reason: 'stop', message });
      return source;
    });
    await bridge.registerModel(reference);
    await bridge.models.completeSimple(bridge.getModel(reference)!, { messages: [] });
    expect(records.at(-1)?.status).toBe('cancelled');
  });

  test('records synchronous provider failure status without its sensitive message', async () => {
    const { traces, records } = createTraceRecorder();
    const bridge = setup(async () => traces.startTrace('pi.generate_content'));
    bridge.streamFn.mockImplementationOnce(() => {
      throw Object.assign(new Error('private credential'), { statusCode: 401 });
    });
    await bridge.registerModel(reference);
    const result = await bridge.models.completeSimple(bridge.getModel(reference)!, {
      messages: [],
    });
    expect(result.stopReason).toBe('error');
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: {
        'http.status_code': 401,
        'error.stage': 'stream',
        'error.category': 'auth',
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });
});
