import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type { AiServiceDependencies } from '@/backend/ai/AiService';
import type { ToolEntry } from '@/backend/ai/tools';
import { ToolResolver } from '@/backend/ai/tools/ToolResolver';

type ContractFixtureOptions = {
  assistantPrompt?: string;
  assistantSettings?: Partial<Assistant['settings']>;
  capabilities?: Model['capabilities'];
  fileUri?: string;
  mcpEntries?: ToolEntry[];
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
  const assistant = createAssistant(model.id, {
    prompt: options.assistantPrompt ?? 'You are a precise assistant.',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, ...options.assistantSettings },
  });
  const recordInvocation = jest.fn(async () => undefined);
  const getFileUri = jest.fn(async () => options.fileUri);
  const getToolEntriesForAssistant = jest.fn(async () => options.mcpEntries ?? []);
  const searchKeywords = jest.fn(async () => ({
    capability: 'searchKeywords' as const,
    inputs: ['Cherry Studio current release'],
    providerId: 'contract-search',
    query: 'Cherry Studio current release',
    results: [
      {
        content: 'Cherry Studio is available on mobile.',
        sourceInput: 'Cherry Studio current release',
        title: 'Cherry Studio',
        url: 'https://example.com/cherry',
      },
    ],
  }));
  const fetchUrls = jest.fn(async () => ({
    capability: 'fetchUrls' as const,
    inputs: ['https://example.com/cherry'],
    providerId: 'contract-search',
    results: [
      {
        content: 'Cherry Studio mobile documentation.',
        sourceInput: 'https://example.com/cherry',
        title: 'Cherry Studio',
        url: 'https://example.com/cherry',
      },
    ],
  }));
  const preference = {
    get: jest.fn(async (key: string) => {
      if (key.startsWith('permissions.')) return 'never';
      return null;
    }),
    getMultipleRawCached: jest.fn(() => ({
      'chat.web_search.exclude_domains': [],
      'chat.web_search.max_results': 5,
    })),
  };
  const webSearch = { fetchUrls, searchKeywords };
  const tools = new ToolResolver({
    devicePermissions: {
      getStatusForPreference: jest.fn(async () => 'unavailable' as const),
    },
    mcpRuntime: { getToolEntriesForAssistant },
    preference: preference as never,
    webSearch: webSearch as never,
  });
  const resolveApiKey = jest.fn(async (_providerId: string, override?: string) => ({
    apiKeySelection: override
      ? { attribution: 'unknown' as const }
      : { attribution: 'explicit' as const, id: 'key-1', masked: 'co****ey' },
    value: override ?? 'contract-key',
  }));

  const services = {
    aiUsageRecord: { recordInvocation },
    assistant: { getById: jest.fn(async () => assistant) },
    fileContent: { getUri: getFileUri },
    model: { getById: jest.fn(async (id: Model['id']) => (id === model.id ? model : undefined)) },
    preference,
    provider: {
      getAuthConfig: jest.fn(async () => null),
      getByProviderId: jest.fn(async () => provider),
      getRotatedApiKey: jest.fn(async () => 'contract-key'),
      resolveApiKey,
    },
    tools,
  } as unknown as AiServiceDependencies;

  return {
    assistant,
    model,
    provider,
    services,
    spies: {
      fetchUrls,
      getToolEntriesForAssistant,
      recordInvocation,
      resolveApiKey,
      getFileUri,
      searchKeywords,
    },
  };
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
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

function createAssistant(modelId: Model['id'], overrides: Partial<Assistant> = {}): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    groupId: null,
    id: '00000000-0000-4000-8000-000000000001',
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId,
    modelName: null,
    name: 'Contract Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
