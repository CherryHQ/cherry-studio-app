import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model, type ModelCapability } from '@/shared/data/types/model';
import {
  DEFAULT_API_FEATURES,
  DEFAULT_PROVIDER_SETTINGS,
  type Provider,
} from '@/shared/data/types/provider';

import { buildModelPickerGroups, getModelPickerModelItem } from '../modelPickerData';
import { buildModelPickerListItems } from '../modelPickerListItems';

function createProvider(input: {
  defaultChatEndpoint?: Provider['defaultChatEndpoint'];
  id: string;
  isEnabled?: boolean;
  name: string;
  presetProviderId?: string;
}): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: input.defaultChatEndpoint,
    id: input.id,
    isEnabled: input.isEnabled ?? true,
    name: input.name,
    presetProviderId: input.presetProviderId,
    settings: { ...DEFAULT_PROVIDER_SETTINGS },
  };
}

function createModel(input: {
  capabilities?: ModelCapability[];
  group?: string;
  inputModalities?: Model['inputModalities'];
  isEnabled?: boolean;
  isHidden?: boolean;
  modelId: string;
  name: string;
  outputModalities?: Model['outputModalities'];
  providerId: string;
}): Model {
  return {
    capabilities: input.capabilities ?? [],
    endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    group: input.group,
    id: createUniqueModelId(input.providerId, input.modelId),
    inputModalities: input.inputModalities ?? [MODALITY.TEXT],
    isDeprecated: false,
    isEnabled: input.isEnabled ?? true,
    isHidden: input.isHidden ?? false,
    modelId: input.modelId,
    name: input.name,
    outputModalities: input.outputModalities ?? [MODALITY.TEXT],
    providerId: input.providerId,
    supportsStreaming: true,
  };
}

const providers: readonly Provider[] = [
  createProvider({
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    id: 'openai',
    name: 'OpenAI',
    presetProviderId: 'openai',
  }),
  createProvider({
    defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    id: 'anthropic',
    name: 'Anthropic',
    presetProviderId: 'anthropic',
  }),
  createProvider({
    defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
    id: 'gemini',
    name: 'Gemini',
    presetProviderId: 'gemini',
  }),
  createProvider({
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    id: 'deepseek',
    name: 'DeepSeek',
    presetProviderId: 'deepseek',
  }),
  createProvider({
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    id: 'disabled-provider',
    isEnabled: false,
    name: 'Disabled Provider',
    presetProviderId: 'openai',
  }),
];

const models: readonly Model[] = [
  createModel({
    capabilities: [
      MODEL_CAPABILITY.IMAGE_RECOGNITION,
      MODEL_CAPABILITY.FUNCTION_CALL,
      MODEL_CAPABILITY.WEB_SEARCH,
    ],
    inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    modelId: 'gpt-4o',
    name: 'GPT-4o',
    providerId: 'openai',
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    providerId: 'openai',
  }),
  createModel({
    capabilities: [
      MODEL_CAPABILITY.IMAGE_RECOGNITION,
      MODEL_CAPABILITY.REASONING,
      MODEL_CAPABILITY.FUNCTION_CALL,
    ],
    inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    modelId: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    providerId: 'anthropic',
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.FUNCTION_CALL],
    inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    modelId: 'gemini-1-5-flash',
    name: 'Gemini 1.5 Flash',
    providerId: 'gemini',
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'deepseek-r1',
    name: 'DeepSeek R1',
    providerId: 'deepseek',
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'hidden-model',
    name: 'Hidden Model',
    providerId: 'openai',
    isHidden: true,
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'disabled-model',
    name: 'Disabled Model',
    providerId: 'openai',
    isEnabled: false,
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'orphan-model',
    name: 'Orphan Model',
    providerId: 'missing-provider',
  }),
  createModel({
    capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    modelId: 'disabled-provider-model',
    name: 'Disabled Provider Model',
    providerId: 'disabled-provider',
  }),
];

describe('model picker data helpers', () => {
  test('groups selectable models under their provider', () => {
    const groups = buildModelPickerGroups({ models, providers, searchText: '' });

    expect(groups.map((group) => group.provider.id)).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'deepseek',
    ]);
    expect(groups[0]?.items.map((item) => item.modelId)).toEqual([
      'openai::gpt-4o',
      'openai::gpt-4o-mini',
    ]);
  });

  test('searches across model and provider text', () => {
    const groups = buildModelPickerGroups({
      models,
      providers,
      searchText: 'openai gpt',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.provider.id).toBe('openai');
    expect(groups[0]?.items.map((item) => item.modelId)).toEqual([
      'openai::gpt-4o',
      'openai::gpt-4o-mini',
    ]);
  });

  test('gets a selected model item with provider details from explicit data', () => {
    expect(getModelPickerModelItem('openai::gpt-4o', { models, providers })).toMatchObject({
      model: { name: 'GPT-4o' },
      provider: { name: 'OpenAI' },
    });
  });

  test('filters hidden, disabled, orphan, and disabled-provider models', () => {
    const groups = buildModelPickerGroups({ models, providers, searchText: '' });

    expect(groups.flatMap((group) => group.items.map((item) => item.model.name))).not.toEqual(
      expect.arrayContaining([
        'Hidden Model',
        'Disabled Model',
        'Orphan Model',
        'Disabled Provider Model',
      ]),
    );
    expect(getModelPickerModelItem('openai::hidden-model', { models, providers })).toBeUndefined();
  });

  test('shows only enabled image-generation models for the painting picker', () => {
    const imageModels = [
      ...models,
      createModel({
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        modelId: 'gpt-image-2',
        name: 'GPT Image 2',
        providerId: 'openai',
      }),
      createModel({
        capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
        isEnabled: false,
        modelId: 'disabled-image',
        name: 'Disabled Image',
        providerId: 'openai',
      }),
    ];
    const groups = buildModelPickerGroups({
      modelType: 'image',
      models: imageModels,
      providers,
      searchText: '',
    });

    expect(groups.flatMap((group) => group.items.map((item) => item.modelId))).toEqual([
      'openai::gpt-image-2',
    ]);
  });

  test('builds list items up to the visible limit without a trailing empty group', () => {
    const groups = buildModelPickerGroups({ models, providers, searchText: '' });
    const listItems = buildModelPickerListItems(groups, 3);

    expect(listItems.map((item) => item.key)).toEqual([
      'header:provider:openai',
      'openai::gpt-4o:provider',
      'openai::gpt-4o-mini:provider',
    ]);
    expect(listItems.at(-1)).toMatchObject({
      key: 'openai::gpt-4o-mini:provider',
      type: 'model',
    });
  });
});
