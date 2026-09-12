import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import {
  getProviderModelEndpointSelection,
  getProviderModelEndpointState,
  PROVIDER_DEFAULT_ENDPOINT_SELECTION,
  shouldShowProviderModelEndpointPicker,
} from '../providerModelEndpoint';

describe('provider model endpoint state', () => {
  it('distinguishes explicit and inherited endpoints', () => {
    const provider = createProvider();

    expect(getProviderModelEndpointState(provider, createModel(['anthropic-messages']))).toEqual({
      endpointType: 'anthropic-messages',
      kind: 'explicit',
    });
    expect(getProviderModelEndpointState(provider, createModel([]))).toEqual({
      endpointType: 'openai-chat-completions',
      kind: 'default',
    });
    expect(getProviderModelEndpointSelection(createModel([]))).toBe(
      PROVIDER_DEFAULT_ENDPOINT_SELECTION,
    );
  });

  it('keeps missing and unsupported endpoint values visible for repair', () => {
    const provider = createProvider();
    const missing = createModel(['openai-responses']);
    const unsupported = createModel(['ollama-chat']);

    expect(getProviderModelEndpointState(provider, missing)).toEqual({
      endpointType: 'openai-responses',
      kind: 'unavailable',
    });
    expect(getProviderModelEndpointState(provider, unsupported)).toEqual({
      endpointType: 'ollama-chat',
      kind: 'unsupported',
    });
    expect(shouldShowProviderModelEndpointPicker({ model: missing, provider })).toBe(true);
    expect(shouldShowProviderModelEndpointPicker({ model: unsupported, provider })).toBe(true);
  });

  it('shows the picker for valid text models only when more than one endpoint is configured', () => {
    const provider = createProvider();
    const model = createModel(['anthropic-messages']);

    expect(shouldShowProviderModelEndpointPicker({ model, provider })).toBe(true);
    expect(
      shouldShowProviderModelEndpointPicker({
        model,
        provider: {
          ...provider,
          endpointConfigs: {
            'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
          },
        },
      }),
    ).toBe(false);
  });
});

function createProvider(): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: {
      'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
      'openai-chat-completions': { baseUrl: 'https://openai.example.com/v1' },
    },
    id: 'custom-provider',
    isEnabled: true,
    name: 'Custom Provider',
    settings: {},
  };
}

function createModel(endpointTypes: Model['endpointTypes']): Model {
  return {
    capabilities: [],
    endpointTypes,
    id: createUniqueModelId('custom-provider', 'model'),
    isEnabled: true,
    isHidden: false,
    modelId: 'model',
    name: 'Model',
    providerId: 'custom-provider',
    supportsStreaming: true,
  };
}
