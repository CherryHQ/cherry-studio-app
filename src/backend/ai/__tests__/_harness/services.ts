import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { AiServiceDependencies } from '@/backend/ai/AiService';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

type ContractFixtureOptions = {
  capabilities?: Model['capabilities'];
  modelId?: string;
  modelOverrides?: Partial<Model>;
  providerOverrides?: Partial<Provider>;
};

export type ContractFixture = ReturnType<typeof createContractFixture>;

export function createContractFixture(options: ContractFixtureOptions = {}) {
  const provider = createProvider(options.providerOverrides);
  const model = createModel(provider.id, options.modelId ?? 'gpt-4o-mini', {
    capabilities: options.capabilities ?? [],
    ...options.modelOverrides,
  });
  const recordInvocation = jest.fn(async () => undefined);
  const resolveApiKey = jest.fn(async (_providerId: string, override?: string) => ({
    apiKeySelection: override
      ? { attribution: 'unknown' as const }
      : { attribution: 'explicit' as const, id: 'key-1', masked: 'co****ey' },
    value: override ?? 'contract-key',
  }));
  const services = {
    aiUsageRecord: { recordInvocation },
    model: { getById: jest.fn(async (id: Model['id']) => (id === model.id ? model : undefined)) },
    preference: {
      get: jest.fn(async () => null),
      getMultipleRawCached: jest.fn(() => ({})),
    },
    provider: {
      getAuthConfig: jest.fn(async () => null),
      getByProviderId: jest.fn(async () => provider),
      getRotatedApiKey: jest.fn(async () => 'contract-key'),
      resolveApiKey,
    },
    providerRegistry: { listProviderRegistryModels: jest.fn(() => []) },
    vertexAuth: { getAuthorizationHeaders: jest.fn(async () => ({})) },
  } as unknown as AiServiceDependencies;

  return {
    model,
    provider,
    services,
    spies: { recordInvocation, resolveApiKey },
  };
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://contract.invalid/v1',
      },
      [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://contract.invalid/v1',
      },
    },
    id: 'contract-provider',
    isEnabled: true,
    name: 'Contract Provider',
    settings: {},
    ...overrides,
  };
}

function createModel(providerId: string, modelId: string, overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: `${providerId}::${modelId}`,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
    ...overrides,
  } as Model;
}
