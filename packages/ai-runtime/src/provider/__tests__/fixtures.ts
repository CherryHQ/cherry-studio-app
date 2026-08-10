import type { Model } from '@cherrystudio/universal/data/types/model';
import {
  DEFAULT_API_FEATURES,
  DEFAULT_PROVIDER_SETTINGS,
  type EndpointConfig,
  type Provider,
} from '@cherrystudio/universal/data/types/provider';

export function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: 'openai::gpt-4',
    isEnabled: true,
    isHidden: false,
    name: 'GPT-4',
    providerId: 'openai',
    supportsStreaming: true,
    ...overrides,
  } as Model;
}

export function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authType: 'api-key',
    id: 'fake',
    isEnabled: true,
    name: 'Fake',
    settings: { ...DEFAULT_PROVIDER_SETTINGS },
    ...overrides,
  } as Provider;
}

export function makeEndpointConfig(overrides: Partial<EndpointConfig> = {}): EndpointConfig {
  return { ...overrides };
}
