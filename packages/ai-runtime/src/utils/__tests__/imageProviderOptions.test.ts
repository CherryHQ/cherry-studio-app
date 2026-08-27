import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { splitImageParamValues } from '../imageOptions';
import { buildImageProviderOptions, mergeImageProviderOptions } from '../imageProviderOptions';

function provider(id: string, presetProviderId?: string): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    apiKeys: [],
    authType: 'api-key',
    id,
    isEnabled: true,
    name: id,
    presetProviderId,
    settings: {},
  };
}

function build(
  aiSdkProviderId: string,
  paramValues: Record<string, unknown>,
  currentProvider = provider(aiSdkProviderId),
) {
  const { vendorBag } = splitImageParamValues(paramValues);
  return buildImageProviderOptions({
    aiSdkProviderId,
    paramValues,
    provider: currentProvider,
    vendorBag,
  });
}

describe('image provider option routing', () => {
  it('routes OpenRouter image fields and only sends compression for JPEG or WebP', () => {
    expect(
      build('openrouter', {
        background: 'transparent',
        outputCompression: 80,
        outputFormat: 'webp',
        quality: 'high',
        resolution: '2K',
      }),
    ).toEqual({
      openrouter: {
        background: 'transparent',
        output_compression: 80,
        output_format: 'webp',
        quality: 'high',
        resolution: '2K',
      },
    });
    expect(build('openrouter', { outputCompression: 0, quality: 'high' })).toEqual({
      openrouter: { quality: 'high' },
    });
  });

  it('deep-merges Google imageConfig contributions', () => {
    expect(
      build('google', {
        aspectRatio: 'ASPECT_16_9',
        imageResolution: '2K',
        personGeneration: 'ALLOW_ADULT',
      }),
    ).toEqual({
      google: {
        imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
        personGeneration: 'allow_adult',
      },
    });
  });

  it('dual-keys OpenAI-family options and excludes native seed from its body', () => {
    expect(
      build('openai', {
        background: 'transparent',
        quality: 'high',
        seed: 7,
        style: 'vivid',
      }),
    ).toEqual({
      openai: { background: 'transparent', quality: 'high', style: 'vivid' },
    });
  });

  it('uses diffusion passthrough for unregistered providers', () => {
    expect(
      build(
        'openai-compatible',
        { cfg: 7.5, negativePrompt: 'blur', numInferenceSteps: 25, seed: 4 },
        provider('custom-provider'),
      ),
    ).toEqual({
      'custom-provider': {
        cfg: 7.5,
        negative_prompt: 'blur',
        num_inference_steps: 25,
        seed: 4,
      },
    });
  });

  it('deep-merges image options into existing provider options', () => {
    expect(
      mergeImageProviderOptions(
        {
          google: {
            imageConfig: { outputMimeType: 'image/webp' },
            safetySetting: 'strict',
          },
        },
        {
          google: {
            imageConfig: { aspectRatio: '16:9' },
          },
        },
      ),
    ).toEqual({
      google: {
        imageConfig: { aspectRatio: '16:9', outputMimeType: 'image/webp' },
        safetySetting: 'strict',
      },
    });
  });
});
