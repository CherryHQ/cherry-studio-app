import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';

import { AiService } from '@/backend/ai/AiService';

import { projectEmbeddingCall, projectLanguageCall } from '../_harness/contracts';
import { installMockProvider, textGenerateResult } from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

describe('AiService.checkModel AI SDK contract', () => {
  let restoreProvider: (() => void) | undefined;

  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fetch call in AI SDK contract test'));
    jest.spyOn(Crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  afterEach(() => {
    restoreProvider?.();
    restoreProvider = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('probes language models through generateText', async () => {
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doGenerate: textGenerateResult('ok'),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const result = await new AiService(fixture.services).checkModel({
      requestOptions: { maxRetries: 2 },
      timeout: 1000,
      uniqueModelId: fixture.model.id,
    });

    expect(languageModel.doGenerateCalls).toHaveLength(1);
    expect(projectLanguageCall(languageModel.doGenerateCalls[0])).toMatchSnapshot(
      'language probe call',
    );
    expect(result.latency).toEqual(expect.any(Number));
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  test('probes embedding models with override context and records usage', async () => {
    const fixture = embeddingFixture();
    const embeddingModel = new MockEmbeddingModelV3({
      doEmbed: {
        embeddings: [[0.1, 0.2, 0.3]],
        usage: { tokens: 4 },
        warnings: [],
      },
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ embedding: embeddingModel });

    await new AiService(fixture.services).checkModel({
      apiKeyOverride: 'override-key',
      requestOptions: {
        headers: { 'X-Check': 'embedding', 'X-Empty': undefined },
        maxRetries: 3,
      },
      timeout: 1000,
      uniqueModelId: fixture.model.id,
    });

    expect(embeddingModel.doEmbedCalls).toHaveLength(1);
    expect(projectEmbeddingCall(embeddingModel.doEmbedCalls[0])).toMatchSnapshot(
      'embedding probe call',
    );
    expect(fixture.spies.resolveApiKey).toHaveBeenCalledWith(fixture.provider.id, 'override-key');
    expect(fixture.spies.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ messageRef: null, modelId: fixture.model.modelId }),
        modality: 'embedding',
        usage: { inputTokens: 4, totalTokens: 4 },
      }),
    );
  });

  test('propagates caller aborts into the active language probe', async () => {
    const fixture = createContractFixture();
    const { doGenerate, started } = abortableGenerate();
    const languageModel = new MockLanguageModelV3({
      doGenerate,
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const controller = new AbortController();
    const abortReason = new Error('caller cancelled model check');

    const rejection = captureRejection(
      new AiService(fixture.services).checkModel({
        requestOptions: { signal: controller.signal },
        timeout: 1000,
        uniqueModelId: fixture.model.id,
      }),
    );
    const call = await started;
    controller.abort(abortReason);

    await expect(rejection).resolves.toBe(abortReason);
    expect(call.abortSignal).toMatchObject({ aborted: true, reason: abortReason });
  });

  test('aborts an active language probe when the check timeout expires', async () => {
    jest.useFakeTimers();
    const fixture = createContractFixture();
    const { doGenerate, started } = abortableGenerate();
    const languageModel = new MockLanguageModelV3({
      doGenerate,
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const rejection = captureRejection(
      new AiService(fixture.services).checkModel({
        timeout: 25,
        uniqueModelId: fixture.model.id,
      }),
    );
    const call = await started;
    await jest.advanceTimersByTimeAsync(25);
    const error = await rejection;

    expect(error).toMatchObject({ message: 'Check model timeout' });
    expect(call.abortSignal).toMatchObject({ aborted: true });
    expect(call.abortSignal?.reason).toMatchObject({ message: 'Check model timeout' });
  });
});

function embeddingFixture() {
  return createContractFixture({
    capabilities: [MODEL_CAPABILITY.EMBEDDING],
    modelId: 'contract-embedding',
    modelOverrides: { endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS] },
  });
}

function abortableGenerate() {
  let notifyStarted!: (options: LanguageModelV3CallOptions) => void;
  const started = new Promise<LanguageModelV3CallOptions>((resolve) => {
    notifyStarted = resolve;
  });
  const doGenerate = async (options: LanguageModelV3CallOptions) => {
    notifyStarted(options);
    return new Promise<never>((_, reject) => {
      const signal = options.abortSignal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  return { doGenerate, started };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected promise to reject');
}
