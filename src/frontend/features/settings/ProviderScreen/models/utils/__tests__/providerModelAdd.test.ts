import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelAddInputs,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  getProviderChatEndpointTypes,
  getProviderModelAddMode,
  isNewApiLikeProvider,
  providerModelAddEndpointOptions,
  splitProviderModelIds,
} from '../providerModelAdd';

describe('provider model add helpers', () => {
  test('derives default group names like desktop', () => {
    expect(getDefaultProviderModelGroupName('Qwen/Qwen3-32B')).toBe('qwen');
    expect(getDefaultProviderModelGroupName('qwen3:32b')).toBe('qwen3');
    expect(getDefaultProviderModelGroupName('gpt 4o')).toBe('gpt');
    expect(getDefaultProviderModelGroupName('gpt-3.5-turbo-16k-0613')).toBe('gpt-3.5');
    expect(getDefaultProviderModelGroupName('deepseek_r1_distill')).toBe('deepseek-r1');
    expect(getDefaultProviderModelGroupName('custommodel')).toBe('custommodel');
    expect(getDefaultProviderModelGroupName('deepseek-r1', 'silicon')).toBe('deepseek');
  });

  test('splits comma and chinese comma separated model ids', () => {
    expect(splitProviderModelIds('gpt-4o, gpt-4o-mini，claude-4')).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
      'claude-4',
    ]);
  });

  test('detects mobile supported new-api-like providers', () => {
    expect(isNewApiLikeProvider(provider({ id: 'new-api' }))).toBe(true);
    expect(isNewApiLikeProvider(provider({ id: 'cherryin' }))).toBe(true);
    expect(isNewApiLikeProvider(provider({ id: 'aionly' }))).toBe(true);
    expect(isNewApiLikeProvider(provider({ id: 'custom', presetProviderId: 'new-api' }))).toBe(
      true,
    );
    expect(isNewApiLikeProvider(provider({ id: 'openai' }))).toBe(false);
    expect(isNewApiLikeProvider(undefined)).toBe(false);
  });

  test('uses endpoint selection for gateways, purpose for custom providers, and legacy for presets', () => {
    expect(getProviderModelAddMode(provider({ id: 'new-api' }))).toBe('endpoint-types');
    expect(getProviderModelAddMode(provider({ id: 'custom' }))).toBe('purpose');
    expect(getProviderModelAddMode(provider({ id: 'openai', presetProviderId: 'openai' }))).toBe(
      'legacy',
    );
  });

  test('keeps image endpoints out of the custom provider chat protocol choices', () => {
    expect(
      getProviderChatEndpointTypes({
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: {},
          [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {},
          [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {},
          [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: {},
        },
      }),
    ).toEqual([ENDPOINT_TYPE.OPENAI_RESPONSES, ENDPOINT_TYPE.ANTHROPIC_MESSAGES]);
  });

  test('offers generation and editing endpoints without mobile-unsupported rerank', () => {
    expect(providerModelAddEndpointOptions.map((option) => option.id)).toEqual(
      expect.arrayContaining([
        ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
        ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
      ]),
    );
    expect(providerModelAddEndpointOptions.map((option) => option.id)).not.toContain(
      ENDPOINT_TYPE.JINA_RERANK,
    );
  });

  test('builds single create input with endpoint and numeric fields', () => {
    const formState = {
      ...createInitialProviderModelAddFormState(),
      contextWindow: '128000',
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
      group: 'openai',
      maxInputTokens: '64000',
      maxOutputTokens: '8192',
      modelId: 'gpt-4o',
      name: 'GPT-4o',
    };

    expect(
      buildProviderModelAddInputs({
        existingModels: [],
        formState,
        provider: provider({ id: 'new-api' }),
        providerId: 'new-api',
      }),
    ).toEqual({
      duplicateIds: [],
      inputs: [
        {
          contextWindow: 128000,
          endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
          group: 'openai',
          maxInputTokens: 64000,
          maxOutputTokens: 8192,
          modelId: 'gpt-4o',
          name: 'GPT-4o',
          providerId: 'new-api',
        },
      ],
    });
  });

  test('builds batch inputs with endpoint types and skips duplicates', () => {
    const formState = {
      ...createInitialProviderModelAddFormState(),
      contextWindow: '128000',
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
      maxInputTokens: '64000',
      maxOutputTokens: '8192',
      modelId: 'gpt-4o, gpt-4o-mini，gpt-4o-mini',
      name: 'ignored',
    };

    expect(
      buildProviderModelAddInputs({
        existingModels: [model('gpt-4o', 'new-api')],
        formState,
        provider: provider({ id: 'new-api' }),
        providerId: 'new-api',
      }),
    ).toEqual({
      duplicateIds: ['gpt-4o', 'gpt-4o-mini'],
      inputs: [
        {
          endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
          group: 'gpt-4o',
          modelId: 'gpt-4o-mini',
          name: 'gpt-4o-mini',
          providerId: 'new-api',
        },
      ],
    });
  });

  test.each([
    [
      ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
      {
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
        outputModalities: [MODALITY.IMAGE],
      },
    ],
    [
      ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
      {
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
        inputModalities: [MODALITY.IMAGE],
        outputModalities: [MODALITY.IMAGE],
      },
    ],
  ])('maps a custom provider %s model to desktop-compatible fields', (endpointType, expected) => {
    const formState = {
      ...createInitialProviderModelAddFormState(endpointType),
      modelId: 'custom-image-model',
    };

    expect(
      buildProviderModelAddInputs({
        existingModels: [],
        formState,
        provider: provider({ id: 'custom-provider' }),
        providerId: 'custom-provider',
      }).inputs[0],
    ).toMatchObject(expected);
  });

  test('omits invalid optional number fields', () => {
    const formState = {
      ...createInitialProviderModelAddFormState(),
      contextWindow: 'NaN',
      maxInputTokens: '-1',
      maxOutputTokens: '1.5',
      modelId: 'custom-model',
    };

    expect(
      buildProviderModelAddInputs({
        existingModels: [],
        formState,
        provider: provider({ id: 'openai', presetProviderId: 'openai' }),
        providerId: 'openai',
      }).inputs[0],
    ).toEqual({
      group: 'custom-model',
      modelId: 'custom-model',
      name: 'CUSTOM-MODEL',
      providerId: 'openai',
    });
  });
});

function model(modelId: string, providerId = 'openai'): Model {
  return {
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}

function provider(input: { id: string; presetProviderId?: string }): Provider {
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
    id: input.id,
    isEnabled: true,
    name: input.id,
    presetProviderId: input.presetProviderId,
    settings: {},
  };
}
