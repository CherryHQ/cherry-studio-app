import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { resolveEffectiveEndpoint, resolveProviderOptionsKey } from '../endpoint';

const endpointConfigs = {
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
    adapterFamily: 'aihubmix',
    baseUrl: 'https://aihubmix.com',
  },
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
    adapterFamily: 'aihubmix',
    baseUrl: 'https://aihubmix.com/gemini/v1beta',
  },
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
    adapterFamily: 'aihubmix',
    baseUrl: 'https://aihubmix.com/v1',
  },
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
    adapterFamily: 'aihubmix',
    baseUrl: 'https://aihubmix.com/v1',
  },
} satisfies Provider['endpointConfigs'];

const provider = {
  apiFeatures: {
    arrayContent: true,
    developerRole: true,
    reportsActualCost: false,
    serviceTier: true,
    streamOptions: true,
    verbosity: true,
  },
  apiKeys: [],
  authType: 'api-key',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs,
  id: 'aihubmix',
  isEnabled: true,
  name: 'AiHubMix',
  presetProviderId: 'aihubmix',
  settings: {},
} as Provider;

function createModel(modelId: string): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('aihubmix', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'aihubmix',
    supportsStreaming: true,
  };
}

describe('AiHubMix effective endpoint and provider-options namespace', () => {
  it.each([
    ['claude-opus-4-7', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'anthropic'],
    ['gemini-3-flash-preview', ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, 'google'],
    ['gpt-5.4', ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai'],
    ['o1-mini', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai'],
    ['glm-5', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'aihubmix'],
  ])('routes %s to %s using %s options', (modelId, endpointType, providerOptionsKey) => {
    expect(resolveEffectiveEndpoint(provider, createModel(modelId))).toEqual({
      baseUrl: endpointConfigs[endpointType].baseUrl,
      endpointType,
      providerOptionsKey,
    });
  });

  it('maps regular adapter families to the namespace their SDK model reads', () => {
    expect(resolveProviderOptionsKey('anthropic')).toBe('anthropic');
    expect(resolveProviderOptionsKey('google')).toBe('google');
    expect(resolveProviderOptionsKey('openai-compatible', { actualProviderId: 'custom' })).toBe(
      'custom',
    );
  });
});
