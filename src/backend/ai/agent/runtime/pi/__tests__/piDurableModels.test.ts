import type { Api, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

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

function setup() {
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
  );
  return { ...bridge, streamFn, resolveModel, configuration };
}

describe('Pi durable model bridge', () => {
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
