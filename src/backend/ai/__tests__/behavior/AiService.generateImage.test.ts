import { APICallError, type ImageModelV3CallOptions } from '@ai-sdk/provider';
import { ProviderExtension, extensionRegistry } from '@cherrystudio/ai-core/provider';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { MockImageModelV3, MockProviderV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';

import { AiService } from '@/backend/ai/AiService';
import * as providerConfig from '@/backend/ai/generation/providerConfig';
import type { RecordAiInvocationInput } from '@/backend/data/services/AiUsageRecordService';
import { AiRequestError } from '@/shared/contracts/aiFailure';

import { createImageGenerationModel } from '../../../../../packages/ai-runtime/src/provider/custom/imageGenerationModel';
import { createModelscopeTransport } from '../../../../../packages/ai-runtime/src/provider/custom/modelscope/modelscopeTransport';
import { projectContractValue, projectImageCall } from '../_harness/contracts';
import { installMockProvider } from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

const PNG_BASE64 = 'iVBORw0KGgo=';

describe('AiService.generateImage AI SDK contract', () => {
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
    jest.restoreAllMocks();
  });

  test('maps generation parameters into the image model call and records usage', async () => {
    const fixture = imageFixture();
    const doGenerate = jest.fn(async (_options: ImageModelV3CallOptions) => imageResult());
    const imageModel = new MockImageModelV3({
      doGenerate,
      maxImagesPerCall: 4,
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ image: imageModel });

    const result = await new AiService(fixture.services).generateImage({
      mode: 'generate',
      paramValues: {
        background: 'transparent',
        numImages: 2,
        quality: 'high',
        seed: 42,
        size: '1024x1024',
      },
      prompt: 'Draw two cherries.',
      requestOptions: { headers: { 'X-Contract': 'image' } },
      uniqueModelId: fixture.model.id,
    });

    expect(projectImageCall(doGenerate.mock.calls[0][0])).toMatchSnapshot('generation call');
    expect(projectContractValue(result)).toMatchSnapshot('generation result');
    expect(fixture.spies.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        imageCount: 2,
        modality: 'image',
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      }),
    );
  });

  test('maps input data URLs into image-edit files without using HTTP', async () => {
    const fixture = imageFixture();
    const doGenerate = jest.fn(async (_options: ImageModelV3CallOptions) => imageResult(1));
    const imageModel = new MockImageModelV3({
      doGenerate,
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ image: imageModel });

    await new AiService(fixture.services).generateImage({
      inputImages: [`data:image/png;base64,${PNG_BASE64}`],
      mode: 'edit',
      paramValues: {},
      prompt: 'Add a leaf.',
      uniqueModelId: fixture.model.id,
    });

    expect(projectImageCall(doGenerate.mock.calls[0][0])).toMatchSnapshot('image edit call');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(jest.requireMock('expo/fetch').fetch).not.toHaveBeenCalled();
  });

  test('captures a separate immutable context for each image batch and preserves the serving key', async () => {
    const fixture = imageFixture();
    const records: RecordAiInvocationInput[] = [];
    fixture.services.aiUsageRecord.recordInvocation = jest.fn(async (record) => {
      records.push(record);
    });
    let nextId = 0;
    jest
      .spyOn(Crypto, 'randomUUID')
      .mockImplementation(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++nextId).padStart(12, '0')}`);
    const source = { type: 'assistant' as const, id: 'assistant-1', name: 'First', icon: null };
    let releaseFirst!: () => void;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    restoreProvider = installMockProvider({
      image: new MockImageModelV3({
        modelId: fixture.model.modelId,
        provider: 'contract-provider',
        maxImagesPerCall: 1,
        doGenerate: async () => {
          if (++calls === 1) {
            source.name = 'Second';
            await firstBatch;
          } else {
            releaseFirst();
          }
          return imageResult(1);
        },
      }),
    });

    const result = await new AiService(fixture.services).generateImage({
      mode: 'generate',
      paramValues: { numImages: 2 },
      prompt: 'Two batches.',
      uniqueModelId: fixture.model.id,
      usageAttribution: { source, messageRef: null },
    });

    expect(result.images).toHaveLength(2);
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.requestId)).size).toBe(2);
    expect(records.map((record) => record.context.source?.name).sort()).toEqual([
      'First',
      'Second',
    ]);
    expect(records[0].context).not.toBe(records[1].context);
    for (const record of records) {
      expect(record).toMatchObject({
        imageCount: 1,
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        context: {
          providerId: fixture.provider.id,
          modelId: fixture.model.modelId,
          credentialReceipt: expect.objectContaining({ attribution: 'explicit' }),
        },
      });
      expect(Object.isFrozen(record.context)).toBe(true);
      expect(record.context.credentialReceipt).toEqual(records[0].context.credentialReceipt);
    }
    expect(fixture.spies.resolveApiKey).toHaveBeenCalledTimes(1);
  });

  test('recaptures attribution on retry and records only the successful invocation', async () => {
    const fixture = imageFixture();
    const source = { type: 'assistant' as const, id: 'assistant-1', name: 'Initial', icon: null };
    const records: RecordAiInvocationInput[] = [];
    fixture.services.aiUsageRecord.recordInvocation = jest.fn(async (record) => {
      records.push(record);
    });
    let calls = 0;
    restoreProvider = installMockProvider({
      image: new MockImageModelV3({
        modelId: fixture.model.modelId,
        provider: 'contract-provider',
        doGenerate: async () => {
          if (++calls === 1) {
            source.name = 'Retried';
            throw new APICallError({
              message: 'Try again',
              url: 'https://contract.invalid/images',
              requestBodyValues: {},
              statusCode: 503,
              isRetryable: true,
            });
          }
          return imageResult(1);
        },
      }),
    });

    const result = await new AiService(fixture.services).generateImage({
      mode: 'generate',
      paramValues: {},
      prompt: 'Retry once.',
      requestOptions: { maxRetries: 1 },
      uniqueModelId: fixture.model.id,
      usageAttribution: { source, messageRef: null },
    });

    expect(result.images).toHaveLength(1);
    expect(calls).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0].context.source?.name).toBe('Retried');
    expect(fixture.spies.resolveApiKey).toHaveBeenCalledTimes(1);
  });

  test.each(['capture', 'completion'] as const)(
    'keeps a successful image when the %s observer throws',
    async (phase) => {
      const fixture = imageFixture();
      if (phase === 'capture') {
        Object.defineProperty(fixture.model, 'pricing', {
          get() {
            throw new Error('Cannot capture usage');
          },
        });
      } else {
        fixture.spies.recordInvocation.mockImplementationOnce(() => {
          throw new Error('Cannot record usage');
        });
      }
      restoreProvider = installMockProvider({
        image: new MockImageModelV3({
          modelId: fixture.model.modelId,
          provider: 'contract-provider',
          doGenerate: async () => imageResult(1),
        }),
      });

      await expect(
        new AiService(fixture.services).generateImage({
          mode: 'generate',
          paramValues: {},
          prompt: 'Still return the image.',
          uniqueModelId: fixture.model.id,
        }),
      ).resolves.toMatchObject({ images: [{ base64: PNG_BASE64, mediaType: 'image/png' }] });
    },
  );

  test('projects registry transport routing into the portable image request', async () => {
    const fixture = imageFixture();
    const doGenerate = jest.fn(async (_options: ImageModelV3CallOptions) => imageResult(1));
    const imageModel = new MockImageModelV3({
      doGenerate,
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ image: imageModel });
    fixture.services.providerRegistry.getImageGenerationSupport = jest.fn(() => ({
      modes: {
        generate: {
          supports: {},
          vendorTransport: { endpoint: '/v1/image/tasks', isSync: false },
        },
      },
    }));

    await new AiService(fixture.services).generateImage({
      mode: 'generate',
      paramValues: {},
      prompt: 'Route this request.',
      uniqueModelId: fixture.model.id,
    });

    expect(fixture.services.providerRegistry.getImageGenerationSupport).toHaveBeenCalledWith(
      fixture.provider.id,
      fixture.model.modelId,
    );
    expect(doGenerate.mock.calls[0][0].providerOptions).toMatchObject({
      [fixture.provider.id]: {
        modelDescriptor: {
          endpoint: '/v1/image/tasks',
          id: fixture.model.modelId,
          isSync: false,
          mode: 'generate',
        },
      },
    });
  });

  test.each([45_000, 0, undefined])(
    'hands custom transport timeout %s to the provider without serializing it',
    async (requestTimeoutMs) => {
      const fixture = createContractFixture({
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        modelId: 'contract-image',
        modelOverrides: { endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION] },
        providerOverrides: {
          id: 'modelscope',
          endpointConfigs: {
            [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {
              adapterFamily: 'modelscope',
              baseUrl: 'https://contract.invalid/v1',
            },
          },
        },
      });
      fixture.services.providerRegistry.getImageGenerationSupport = jest.fn(() => ({
        modes: {
          generate: { supports: {}, vendorTransport: { endpoint: '/v1/images/generations' } },
        },
      }));
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ task_id: 'task-1' }),
      } as Response);
      const transport = createModelscopeTransport({ apiKey: 'contract-key' });
      const submit = jest.fn(transport.submit.bind(transport));
      const realModel = createImageGenerationModel(fixture.model.modelId, {
        provider: 'modelscope',
        transport: { submit, poll: async () => [] },
      });
      const doGenerate = jest.fn(async (options: ImageModelV3CallOptions) => {
        await realModel.doGenerate(options);
        return imageResult(1);
      });
      const originalResolve = providerConfig.resolveAiSdkServing;
      jest.spyOn(providerConfig, 'resolveAiSdkServing').mockImplementation(async (...args) => {
        const resolved = await originalResolve(...args);
        return { ...resolved, sdkConfig: { ...resolved.sdkConfig, providerId: 'modelscope' } };
      });
      const original = extensionRegistry.get('modelscope');
      extensionRegistry.unregister('modelscope');
      extensionRegistry.register(
        ProviderExtension.create({
          name: 'modelscope',
          supportsImageGeneration: true,
          create: () =>
            new MockProviderV3({
              imageModels: {
                [fixture.model.modelId]: new MockImageModelV3({
                  doGenerate,
                  modelId: fixture.model.modelId,
                  provider: 'modelscope',
                }),
              },
            }),
        }),
      );
      restoreProvider = () => {
        extensionRegistry.unregister('modelscope');
        if (original) extensionRegistry.register(original);
      };

      await new AiService(fixture.services).generateImage({
        mode: 'generate',
        paramValues: { seed: 7 },
        prompt: 'Timeout hand-off.',
        requestTimeoutMs,
        uniqueModelId: fixture.model.id,
      });

      expect(doGenerate).toHaveBeenCalledTimes(1);
      const call = doGenerate.mock.calls[0][0];
      const { providerOptions, ...canonical } = call;
      expect(JSON.stringify(canonical)).not.toContain('requestTimeoutMs');
      expect(Object.keys(providerOptions)).toEqual(['modelscope']);
      if (requestTimeoutMs === undefined) {
        expect(JSON.stringify(providerOptions)).not.toContain('requestTimeoutMs');
      } else {
        expect(providerOptions.modelscope).toHaveProperty('requestTimeoutMs', requestTimeoutMs);
        const { requestTimeoutMs: _timeout, ...remaining } = providerOptions.modelscope;
        expect(JSON.stringify(remaining)).not.toContain('requestTimeoutMs');
      }
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.mock.calls[0][0].requestTimeoutMs).toBe(requestTimeoutMs || undefined);
      expect(submit.mock.calls[0][0].providerParams).not.toHaveProperty('requestTimeoutMs');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body).toEqual({ model: fixture.model.modelId, prompt: 'Timeout hand-off.', seed: 7 });
      expect(JSON.stringify(body)).not.toContain('requestTimeoutMs');
    },
  );

  test('does not hand a supplied timeout to a native image model', async () => {
    const fixture = imageFixture();
    const doGenerate = jest.fn(async (_options: ImageModelV3CallOptions) => imageResult(1));
    restoreProvider = installMockProvider({
      image: new MockImageModelV3({
        doGenerate,
        modelId: fixture.model.modelId,
        provider: 'contract-provider',
      }),
    });
    await new AiService(fixture.services).generateImage({
      mode: 'generate',
      paramValues: {},
      prompt: 'Native timeout.',
      requestTimeoutMs: 45_000,
      uniqueModelId: fixture.model.id,
    });
    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(doGenerate.mock.calls[0][0].providerOptions)).not.toContain(
      'requestTimeoutMs',
    );
  });

  test('preserves status and provider facts while redacting image-model failure details', async () => {
    const fixture = imageFixture();
    const modelError = Object.assign(new Error('HTTP 401: contract-key rejected'), {
      statusCode: 401,
      responseBody: 'Invalid api_key=contract-key',
    });
    const imageModel = new MockImageModelV3({
      doGenerate: async () => {
        throw modelError;
      },
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ image: imageModel });

    const error = await captureRejection(
      new AiService(fixture.services).generateImage({
        mode: 'generate',
        paramValues: {},
        prompt: 'Fail.',
        uniqueModelId: fixture.model.id,
      }),
    );

    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({
      message: 'HTTP 401: [REDACTED] rejected',
      detail: {
        retryable: false,
        failure: {
          reasonCode: 'auth',
          context: {
            statusCode: 401,
            providerId: fixture.provider.id,
            modelId: fixture.model.modelId,
            responseBody: 'Invalid api_key=[REDACTED]',
          },
        },
      },
    });
    expect(JSON.stringify(error)).not.toContain('contract-key');
  });

  test.each([
    {
      label: 'incidental metadata',
      facts: { responseBody: '{"content_filter_results":{"filtered":false}}' },
      reason: 'unknown',
    },
    { label: 'explicit filter code', facts: { code: 'content_filter' }, reason: 'content_filter' },
    {
      label: 'structured filter finish',
      facts: { finishReason: 'safety' },
      reason: 'content_filter',
    },
    { label: 'forged reason', facts: { reasonCode: 'content_filter' }, reason: 'unknown' },
    {
      label: 'prose request classification',
      facts: { message: 'Quota exhausted' },
      reason: 'quota',
    },
    {
      label: 'explicit source code takes priority over nested data',
      facts: { code: 'invalid_api_key', data: { error: { code: 'content_filter' } } },
      reason: 'auth',
    },
    {
      label: 'invalid nested source code',
      facts: { data: { error: { code: 400, content_filter_results: {} } } },
      reason: 'unknown',
    },
  ])('classifies $label at the image request boundary', async ({ facts, reason }) => {
    const fixture = imageFixture();
    const modelError = Object.assign(new Error('Request failed'), facts);
    restoreProvider = installMockProvider({
      image: new MockImageModelV3({
        modelId: fixture.model.modelId,
        provider: 'contract-provider',
        doGenerate: async () => {
          throw modelError;
        },
      }),
    });
    const error = await captureRejection(
      new AiService(fixture.services).generateImage({
        mode: 'generate',
        paramValues: {},
        prompt: 'Fail.',
        requestOptions: { maxRetries: 0 },
        uniqueModelId: fixture.model.id,
      }),
    );
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({
      message: modelError.message,
      detail: {
        retryable: false,
        failure: {
          version: 1,
          reasonCode: reason,
          source: { layer: 'provider' },
          context: { providerId: fixture.provider.id, modelId: fixture.model.modelId },
        },
      },
    });
    if ('responseBody' in facts)
      expect((error as AiRequestError).detail.failure.context?.responseBody).toBe(
        facts.responseBody,
      );
    expect((error as AiRequestError).detail).not.toHaveProperty('reasonCode');
  });

  test.each([
    { code: 'content_policy_violation', reason: 'content_filter' },
    { code: 'content_filter', reason: 'content_filter' },
    { code: 'contentFilter', reason: 'content_filter' },
    { code: 'content_filter_results', reason: 'unknown' },
    { code: undefined, reason: 'unknown' },
  ])('classifies a real APICallError with nested code $code', async ({ code, reason }) => {
    const fixture = imageFixture();
    const data = {
      error: { code, message: 'Request rejected' },
      content_filter_results: { hate: { filtered: false } },
    };
    const modelError = new APICallError({
      message: data.error.message,
      url: 'https://provider.example/v1/images/generations',
      requestBodyValues: {},
      statusCode: 400,
      responseBody: JSON.stringify(data),
      data,
    });
    restoreProvider = installMockProvider({
      image: new MockImageModelV3({
        modelId: fixture.model.modelId,
        provider: 'contract-provider',
        doGenerate: async () => {
          throw modelError;
        },
      }),
    });

    const error = await captureRejection(
      new AiService(fixture.services).generateImage({
        mode: 'generate',
        paramValues: {},
        prompt: 'Fail.',
        requestOptions: { maxRetries: 0 },
        uniqueModelId: fixture.model.id,
      }),
    );

    expect(modelError).not.toHaveProperty('code');
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({
      detail: {
        retryable: false,
        failure: {
          reasonCode: reason,
          source: { layer: 'provider', name: 'AI_APICallError', code: code ?? 'runtime_error' },
          context: {
            statusCode: 400,
            providerId: fixture.provider.id,
            modelId: fixture.model.modelId,
            responseBody: JSON.stringify(data),
          },
        },
      },
    });
  });

  test('forwards aborts to the image model and preserves the abort reason', async () => {
    const fixture = imageFixture();
    let notifyStarted!: (options: ImageModelV3CallOptions) => void;
    const started = new Promise<ImageModelV3CallOptions>((resolve) => {
      notifyStarted = resolve;
    });
    const imageModel = new MockImageModelV3({
      doGenerate: async (options) => {
        notifyStarted(options);
        return new Promise((_, reject) => {
          const signal = options.abortSignal;
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ image: imageModel });
    const controller = new AbortController();
    const abortReason = new Error('cancelled image generation');

    const rejection = captureRejection(
      new AiService(fixture.services).generateImage({
        mode: 'generate',
        paramValues: {},
        prompt: 'Wait.',
        requestOptions: { signal: controller.signal },
        uniqueModelId: fixture.model.id,
      }),
    );
    const call = await started;
    controller.abort(abortReason);
    const error = await rejection;

    expect(call.abortSignal).toMatchObject({ aborted: true, reason: abortReason });
    expect(error).toBe(abortReason);
  });
});

function imageFixture() {
  return createContractFixture({
    capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
    modelId: 'contract-image',
    modelOverrides: { endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION] },
  });
}

function imageResult(count = 2) {
  return {
    images: Array.from({ length: count }, () => PNG_BASE64),
    response: {
      headers: {},
      modelId: 'contract-image',
      timestamp: new Date('2026-08-08T00:00:00.000Z'),
    },
    usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
    warnings: [],
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected promise to reject');
}
