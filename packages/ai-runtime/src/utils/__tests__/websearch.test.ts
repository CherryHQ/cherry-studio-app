import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';

import {
  buildProviderBuiltinWebSearchConfig,
  type CherryWebSearchConfig,
  getWebSearchParams,
} from '../websearch';

function createModel(overrides: Partial<Model> = {}): Model {
  const providerId = overrides.providerId ?? 'openai';
  const modelId = overrides.modelId ?? 'gpt-4o';
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
    ...overrides,
  };
}

const webSearchConfig = (
  overrides: Partial<CherryWebSearchConfig> = {},
): CherryWebSearchConfig => ({
  maxResults: 5,
  ...overrides,
});

describe('buildProviderBuiltinWebSearchConfig', () => {
  it('emits a bare openai config for Doubao Responses', () => {
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig(),
        createModel({
          apiModelId: 'doubao-seed-2-1-pro',
          modelId: 'doubao-seed-2-1-pro',
          providerId: 'doubao',
        }),
      ),
    ).toEqual({ openai: {} });
  });

  it.each([
    'qwen3.7-max',
    'qwen3.6-plus',
    'qwen3.6-flash',
    'qwen3.5-plus',
    'qwen3.5-flash',
    'qwen3-max',
  ])('emits a bare openai config for DashScope Responses model %s', (apiModelId) => {
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig(),
        createDashscopeModel(apiModelId),
      ),
    ).toEqual({ openai: {} });
  });

  it.each([
    'qwen-plus',
    'qwen-flash',
    'qwen-plus-character',
    'qwq-plus',
    'deepseek-v3.2',
    'MiniMax-M2.1',
  ])('suppresses the Responses tool for DashScope Chat-only model %s', (apiModelId) => {
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig(),
        createDashscopeModel(apiModelId),
      ),
    ).toBeUndefined();
  });

  it('maps low/medium/high search-context size for openai from maxResults', () => {
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig({ maxResults: 10 }),
        createModel(),
      ),
    ).toEqual({ openai: { searchContextSize: 'low' } });
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig({ maxResults: 50 }),
        createModel(),
      ),
    ).toEqual({ openai: { searchContextSize: 'medium' } });
    expect(
      buildProviderBuiltinWebSearchConfig(
        'openai',
        webSearchConfig({ maxResults: 90 }),
        createModel(),
      ),
    ).toEqual({ openai: { searchContextSize: 'high' } });
  });

  it('forces medium search-context size for deep research models', () => {
    const model = createModel({ providerId: 'openai', modelId: 'o3-deep-research' });
    expect(
      buildProviderBuiltinWebSearchConfig('openai', webSearchConfig({ maxResults: 90 }), model),
    ).toEqual({ openai: { searchContextSize: 'medium' } });
  });

  it('routes azure-responses through the same openai config shape', () => {
    expect(
      buildProviderBuiltinWebSearchConfig('azure-responses', webSearchConfig({ maxResults: 90 })),
    ).toEqual({ openai: { searchContextSize: 'high' } });
  });

  it('maps openai-chat under its own key', () => {
    expect(
      buildProviderBuiltinWebSearchConfig('openai-chat', webSearchConfig({ maxResults: 10 })),
    ).toEqual({ 'openai-chat': { searchContextSize: 'low' } });
  });

  it('maps anthropic maxUses from maxResults', () => {
    expect(
      buildProviderBuiltinWebSearchConfig('anthropic', webSearchConfig({ maxResults: 3 })),
    ).toEqual({ anthropic: { maxUses: 3 } });
  });

  it('enables image understanding on both xai search tools', () => {
    expect(buildProviderBuiltinWebSearchConfig('xai-responses', webSearchConfig())).toEqual({
      'xai-responses': {
        webSearch: { enableImageUnderstanding: true },
        xSearch: { enableImageUnderstanding: true },
      },
    });
  });

  it('builds openrouter plugin config from maxResults', () => {
    expect(
      buildProviderBuiltinWebSearchConfig('openrouter', webSearchConfig({ maxResults: 7 })),
    ).toEqual({
      openrouter: { plugins: [{ id: 'web', max_results: 7 }] },
    });
  });

  it('resolves cherryin by proxying to the endpoint-derived provider', () => {
    const model = createModel({
      providerId: 'cherryin',
      endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
    });
    expect(
      buildProviderBuiltinWebSearchConfig('cherryin', webSearchConfig({ maxResults: 3 }), model),
    ).toEqual({ anthropic: { maxUses: 3 } });
  });

  it('returns an empty config for cherryin with no resolvable endpoint', () => {
    const model = createModel({ providerId: 'cherryin', endpointTypes: undefined });
    expect(buildProviderBuiltinWebSearchConfig('cherryin', webSearchConfig(), model)).toEqual({});
  });

  it('falls back to an empty config for unhandled providers', () => {
    expect(buildProviderBuiltinWebSearchConfig('unknown-provider', webSearchConfig())).toEqual({});
  });
});

describe('getWebSearchParams', () => {
  it('returns Hunyuan search params', () => {
    expect(getWebSearchParams(createModel({ providerId: 'hunyuan' }))).toEqual({
      enable_enhancement: true,
      citation: true,
      search_info: true,
    });
  });

  it('enables DashScope Chat search without a strategy for standard models', () => {
    expect(getWebSearchParams(createDashscopeModel('qwen-plus'))).toEqual({
      enable_search: true,
      search_options: { forced_search: true },
    });
  });

  it.each(['qwen3-max', 'qwen-omni-turbo', 'qwen3-vl-plus'])(
    'uses the agent strategy for DashScope model %s',
    (apiModelId) => {
      expect(getWebSearchParams(createDashscopeModel(apiModelId))).toEqual({
        enable_search: true,
        search_options: { forced_search: true, search_strategy: 'agent' },
      });
    },
  );

  it('uses web_search_options only for OpenAI search-preview models', () => {
    expect(getWebSearchParams(createModel({ modelId: 'gpt-4o-search-preview' }))).toEqual({
      web_search_options: {},
    });
    expect(
      getWebSearchParams(
        createModel({
          capabilities: [MODEL_CAPABILITY.WEB_SEARCH],
          endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
          modelId: 'gpt-4o',
        }),
      ),
    ).toEqual({});
  });
});

function createDashscopeModel(apiModelId: string): Model {
  return createModel({ apiModelId, modelId: apiModelId, providerId: 'dashscope' });
}
