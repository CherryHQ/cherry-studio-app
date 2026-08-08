import type { ImageModelV3CallOptions } from '@ai-sdk/provider';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { MockImageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';

import { AiService } from '@/backend/ai/AiService';

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

  test('preserves image-model failures unchanged', async () => {
    const fixture = imageFixture();
    const modelError = new Error('image model failed');
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

    expect(error).toBe(modelError);
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
