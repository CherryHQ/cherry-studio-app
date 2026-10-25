import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import type { RuntimeModelPreflight, RuntimeOptions } from '../../types';
import { createPiDurableModels } from '../piDurableModels';
import type { PiModelResolution } from '../piModelTypes';
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
  test.each([
    [1_048_576, undefined, undefined, 65_536],
    [1_048_576, 131_072, undefined, 131_072],
    [1_048_576, undefined, 131_072, 131_072],
    [1_048_576, 131_072, 262_144, 131_072],
    [1_048_576, 1_024, 512, 512],
    [1_048_576, 13_107, undefined, 13_107],
    [128_000, undefined, undefined, 128_000],
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

  test('fits compaction into small input windows without changing large-window defaults', async () => {
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
      if (contextWindow === 131_072)
        expect(policy).toEqual({
          reserveTokens: 16_384,
          keepRecentTokens: 20_000,
          backgroundTokens: 32_768,
        });
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
    { code: 'stream_disconnected', retryable: true, category: 'network' },
    { code: 'no_response', retryable: true, category: 'network' },
    { code: 'stream_idle_timeout', retryable: true, category: 'timeout' },
    { code: 'insufficient_quota', status: 429, retryable: false, category: 'quota' },
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
        'error.code': failure.code,
        'error.retryable': failure.retryable,
        'error.retry_scope': 'automatic',
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });

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
