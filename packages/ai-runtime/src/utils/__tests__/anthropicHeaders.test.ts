import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@cherrystudio/universal/data/types/assistant';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { addAnthropicHeaders } from '../anthropicHeaders';

function createModel(modelId: string): Model {
  const providerId = 'anthropic';
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

function createProvider(overrides: Partial<Provider> = {}): Provider {
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
    id: 'anthropic',
    isEnabled: true,
    name: 'Anthropic',
    settings: {},
    ...overrides,
  };
}

function createAssistant(overrides: Partial<Assistant['settings']> = {}): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, ...overrides },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('addAnthropicHeaders', () => {
  it('adds interleaved-thinking for a Claude 4.5 reasoning model on direct Anthropic', () => {
    const headers = addAnthropicHeaders(
      createAssistant(),
      createModel('claude-sonnet-4-5'),
      createProvider(),
    );
    expect(headers).toEqual(['interleaved-thinking-2025-05-14']);
  });

  it('omits interleaved-thinking for a Claude 4.5 reasoning model on Vertex', () => {
    const headers = addAnthropicHeaders(
      createAssistant(),
      createModel('claude-sonnet-4-5'),
      createProvider({ authType: 'iam-gcp' }),
    );
    expect(headers).toEqual([]);
  });

  it('omits interleaved-thinking for a Claude 4.5 reasoning model on Bedrock', () => {
    const headers = addAnthropicHeaders(
      createAssistant(),
      createModel('claude-sonnet-4-5'),
      createProvider({ authType: 'iam-aws' }),
    );
    expect(headers).toEqual([]);
  });

  it('adds web-search for a Claude 4 series model on Vertex with web search enabled', () => {
    const headers = addAnthropicHeaders(
      createAssistant({ enableWebSearch: true }),
      createModel('claude-sonnet-4'),
      createProvider({ authType: 'iam-gcp' }),
    );
    expect(headers).toEqual(['web-search-2025-03-05']);
  });

  it('omits web-search for a Claude 4 series model on Vertex when web search is disabled', () => {
    const headers = addAnthropicHeaders(
      createAssistant({ enableWebSearch: false }),
      createModel('claude-sonnet-4'),
      createProvider({ authType: 'iam-gcp' }),
    );
    expect(headers).toEqual([]);
  });

  it('omits web-search for a Claude 4 series model off Vertex even with web search enabled', () => {
    const headers = addAnthropicHeaders(
      createAssistant({ enableWebSearch: true }),
      createModel('claude-sonnet-4'),
      createProvider(),
    );
    expect(headers).toEqual([]);
  });

  it('returns no headers for a non-Claude model', () => {
    const headers = addAnthropicHeaders(createAssistant(), createModel('gpt-5'), createProvider());
    expect(headers).toEqual([]);
  });

  it('treats a missing provider as non-Vertex', () => {
    const headers = addAnthropicHeaders(
      createAssistant(),
      createModel('claude-sonnet-4-5'),
      undefined,
    );
    expect(headers).toEqual(['interleaved-thinking-2025-05-14']);
  });
});
