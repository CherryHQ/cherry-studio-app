import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import type { RuntimeModelPreflight } from '../../types';
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

function setup(traceRequest?: Parameters<typeof createPiDurableModels>[3]) {
  const streamFn = jest.fn(() => {
    const stream = new AssistantMessageEventStream();
    const message = { ...emptyAssistantMessage(wire), stopReason: 'stop' as const };
    stream.push({ type: 'done', reason: 'stop', message });
    stream.end(message);
    return stream;
  });
  const resolveModel = jest.fn(
    async (): Promise<PiModelResolution> => ({
      model: wire,
      streamFn,
      defaultThinkingLevel: 'off',
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
  const configuration = jest.fn(async () => ({ maxOutputTokens: 512, temperature: 0.3 }));
  const bridge = createPiDurableModels(
    {
      preflightModel: async () => preflight,
      resolveModel,
    },
    configuration,
    undefined,
    traceRequest,
  );
  return { ...bridge, streamFn, resolveModel, configuration };
}

describe('Pi durable model bridge', () => {
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
      },
    });
    expect(JSON.stringify(records)).not.toContain('private');
    expect(JSON.stringify(records)).not.toContain('gen_ai.usage');
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
      attributes: { 'http.status_code': 401 },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });
});
