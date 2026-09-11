import type { ImageModelV3CallOptions } from '@ai-sdk/provider';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { generateImage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDashScopeProvider } from '../../provider/custom/dashscope/dashscopeProvider';
import { createDmxapiProvider } from '../../provider/custom/dmxapi/dmxapiProvider';
import type { ImageTransportDescriptor } from '../../provider/custom/imageGenerationModel';
import { createModelscopeProvider } from '../../provider/custom/modelscope/modelscopeProvider';
import { createPpioProvider } from '../../provider/custom/ppio/ppioProvider';
import { createTokenhubProvider } from '../../provider/custom/tokenhub/tokenhub-provider';
import { splitImageParamValues } from '../imageOptions';
import { buildImageProviderOptions } from '../imageProviderOptions';

const imageUrl = 'https://images.example.com/result.png';
const referenceImage = 'data:image/png;base64,AQID';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Exercise the same parameter partition and provider envelope used by AiService. */
function callOptions(
  providerId: string,
  modelId: string,
  paramValues: Record<string, unknown>,
  modelDescriptor?: ImageTransportDescriptor,
): ImageModelV3CallOptions {
  const provider: Provider = {
    id: `copy-${providerId}`,
    presetProviderId: providerId,
    name: providerId,
    isEnabled: true,
    authType: 'api-key',
    apiKeys: [],
    apiFeatures: {
      arrayContent: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    settings: {},
  };
  const { structured, vendorBag } = splitImageParamValues(paramValues);
  return {
    prompt: 'a fox',
    n: structured.n ?? 1,
    size: structured.size as ImageModelV3CallOptions['size'],
    aspectRatio: structured.aspectRatio as ImageModelV3CallOptions['aspectRatio'],
    seed: structured.seed,
    mask: undefined,
    files: [{ type: 'file', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }],
    providerOptions: buildImageProviderOptions({
      aiSdkProviderId: providerId,
      modelId,
      provider,
      paramValues,
      vendorBag: { ...vendorBag, ...(modelDescriptor && { modelDescriptor }) },
    }),
  };
}

describe('painting parameters through the image provider to the HTTP request', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['qwen-image-3.0', 'qwen-image-3.0-pro'])(
    'sends %s reference images and negative prompt to the synchronous multimodal route',
    async (modelId) => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          output: { choices: [{ message: { content: [{ image: imageUrl }] } }] },
        }),
      );
      const provider = createDashScopeProvider({
        apiKey: 'test-key',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      });
      const endpoint = '/api/v1/services/aigc/multimodal-generation/generation';
      const result = await provider
        .imageModel(modelId)
        .doGenerate(
          callOptions(
            'dashscope',
            modelId,
            { negativePrompt: 'blur', size: '1024x1024', seed: 7, addWatermark: false },
            { id: modelId, endpoint, isSync: true, mode: 'edit' },
          ),
        );

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(`https://dashscope.aliyuncs.com${endpoint}`);
      const request = fetch.mock.calls[0]?.[1];
      expect(request?.headers).not.toHaveProperty('X-DashScope-Async');
      expect(JSON.parse(request?.body as string)).toEqual({
        model: modelId,
        input: {
          messages: [{ role: 'user', content: [{ text: 'a fox' }, { image: referenceImage }] }],
        },
        parameters: { size: '1024*1024', seed: 7, negative_prompt: 'blur', watermark: false },
      });
      expect(result.images).toEqual([imageUrl]);
    },
  );

  it.each([
    ['qwen-image-3.0', 'generate', 4],
    ['qwen-image-3.0-pro', 'edit', 6],
  ] as const)('keeps %s %s as one native batch of %i images', async (modelId, mode, n) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({
        output: {
          choices: [
            { message: { content: Array.from({ length: n }, () => ({ image: referenceImage })) } },
          ],
        },
      }),
    );
    const provider = createDashScopeProvider({
      apiKey: 'test-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    const options = callOptions(
      'dashscope',
      modelId,
      { numImages: n, seed: 7 },
      {
        id: modelId,
        endpoint: '/api/v1/services/aigc/multimodal-generation/generation',
        isSync: true,
        mode,
      },
    );

    const result = await generateImage({
      model: provider.imageModel(modelId),
      prompt: mode === 'edit' ? { text: 'a fox', images: [referenceImage] } : 'a fox',
      n: options.n,
      seed: options.seed,
      providerOptions: options.providerOptions,
      maxRetries: 0,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      model: modelId,
      parameters: { n, seed: 7 },
    });
    expect(result.images).toHaveLength(n);
  });

  it('keeps a four-image batch intact through DashScope async submit and poll', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, request) =>
      jsonResponse(
        request?.method === 'POST'
          ? { output: { task_id: 'batch-task' } }
          : {
              output: {
                task_status: 'SUCCEEDED',
                results: Array.from({ length: 4 }, () => ({ url: referenceImage })),
              },
            },
      ),
    );
    const provider = createDashScopeProvider({
      apiKey: 'test-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    const options = callOptions(
      'dashscope',
      'qwen-image',
      { numImages: 4, seed: 7 },
      {
        id: 'qwen-image',
        endpoint: '/api/v1/services/aigc/text2image/image-synthesis',
        mode: 'generate',
      },
    );

    const result = await generateImage({
      model: provider.imageModel('qwen-image'),
      prompt: 'a fox',
      n: options.n,
      seed: options.seed,
      providerOptions: options.providerOptions,
      maxRetries: 0,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      parameters: { n: 4, seed: 7 },
    });
    expect(fetch.mock.calls[1]?.[1]?.method).toBe('GET');
    expect(result.images).toHaveLength(4);
  });

  it.each(['qwen-image', 'wan2.6-t2i'])(
    'preserves the native four-image batch for DMXAPI %s',
    async (modelId) => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        jsonResponse(
          modelId === 'qwen-image'
            ? {
                extra: {
                  output: {
                    task_status: 'SUCCEEDED',
                    results: Array.from({ length: 4 }, () => ({ url: referenceImage })),
                  },
                },
              }
            : {
                output: [{ content: Array.from({ length: 4 }, () => ({ image: referenceImage })) }],
              },
        ),
      );
      const provider = createDmxapiProvider({
        apiKey: 'test-key',
        baseURL: 'https://dmx.example.com/v1',
      });

      const result = await generateImage({
        model: provider.imageModel(modelId),
        prompt: 'a fox',
        n: 4,
        maxRetries: 0,
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject(
        modelId === 'qwen-image' ? { n: 4 } : { parameters: { n: 4 } },
      );
      expect(result.images).toHaveLength(4);
    },
  );

  it('retains single-image calls for TokenHub models without native n support', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => jsonResponse({ data: [{ url: referenceImage }] }));
    const provider = createTokenhubProvider({
      apiKey: 'test-key',
      baseURL: 'https://tokenhub.example.com/v1',
      fetch,
    });
    const options = callOptions(
      'tokenhub',
      'hy-image-v3',
      { numImages: 2 },
      {
        id: 'hy-image-v3',
        endpoint: '/v1/wand/hunyuan-image/v3-generation',
        isSync: true,
        mode: 'generate',
      },
    );

    const result = await generateImage({
      model: provider.imageModel('hy-image-v3'),
      prompt: 'a fox',
      n: options.n,
      providerOptions: options.providerOptions,
      maxRetries: 0,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.images).toHaveLength(2);
  });

  it('preserves ModelScope steps, guidance and negative prompt through async generation', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ task_status: 'SUCCEED', output_images: [imageUrl] }));
    const modelId = 'Qwen/Qwen-Image-Edit';
    const provider = createModelscopeProvider({
      apiKey: 'test-key',
      baseURL: 'https://api-inference.modelscope.cn/v1',
    });
    const result = await provider.imageModel(modelId).doGenerate(
      callOptions('modelscope', modelId, {
        numInferenceSteps: 25,
        guidanceScale: 7,
        negativePrompt: 'blur',
        seed: 0,
        size: '1024x1024',
      }),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api-inference.modelscope.cn/v1/images/generations',
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      model: modelId,
      prompt: 'a fox',
      image_url: referenceImage,
      size: '1024x1024',
      steps: 25,
      guidance: 7,
      negative_prompt: 'blur',
      seed: 0,
    });
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api-inference.modelscope.cn/v1/tasks/task-1');
    expect(result.images).toEqual([imageUrl]);
  });

  it.each([
    ['seedream-4-0', '/v3/seedream-4.0', { images: [referenceImage] }],
    ['seedream-4.0', '/v3/seedream-4.0', { images: [referenceImage] }],
    ['seedream-4-5', '/v3/seedream-4.5', { image: ['AQID'] }],
    ['seedream-4.5', '/v3/seedream-4.5', { image: ['AQID'] }],
    ['seedream-5-0-lite', '/v3/seedream-5.0-lite', { image: ['AQID'] }],
    ['seedream-5.0-lite', '/v3/seedream-5.0-lite', { image: ['AQID'] }],
  ] as const)(
    'keeps PPIO %s edit images for saved catalog IDs',
    async (modelId, endpoint, images) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ images: [imageUrl] }));
      const provider = createPpioProvider({
        apiKey: 'test-key',
        baseURL: 'https://api.ppinfra.com/v3/openai',
      });
      const result = await provider.imageModel(modelId).doGenerate(
        callOptions(
          'ppio',
          modelId,
          { size: '2560x1440', addWatermark: false },
          {
            id: modelId,
            endpoint,
            isSync: true,
            mode: 'edit',
          },
        ),
      );

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(`https://api.ppio.com${endpoint}`);
      expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
        prompt: 'a fox',
        size: '2560x1440',
        watermark: false,
        sequential_image_generation: 'disabled',
        ...images,
      });
      expect(result.images).toEqual([imageUrl]);
    },
  );

  it('routes TokenHub provider options to wand without duplicating the API version', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ data: [{ url: imageUrl }] }));
    const modelId = 'hy-image-v3';
    const endpoint = '/v1/wand/hunyuan-image/v3-generation';
    const provider = createTokenhubProvider({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example.com/tokenhub/v1/',
      fetch,
    });
    const result = await provider.imageModel(modelId).doGenerate(
      callOptions(
        'tokenhub',
        modelId,
        { promptEnhancement: false, seed: 0, size: '1280x768' },
        {
          id: modelId,
          endpoint,
          isSync: true,
          mode: 'edit',
        },
      ),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://proxy.example.com/tokenhub${endpoint}`);
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      model: modelId,
      prompt: 'a fox',
      images: [referenceImage],
      revise: false,
      seed: 0,
      size: '1280x768',
    });
    expect(result.images).toEqual([imageUrl]);
  });
});
