import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import {
  buildProviderBuiltinWebSearchConfig,
  type CherryWebSearchConfig,
  getWebSearchParams,
  mapRegexToPatterns,
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
  excludeDomains: [],
  ...overrides,
});

describe('mapRegexToPatterns', () => {
  it('lowercases bare domains', () => {
    expect(mapRegexToPatterns(['Example.com'])).toEqual(['example.com']);
  });

  it('extracts the domain from full URLs', () => {
    expect(mapRegexToPatterns(['https://example.com/path'])).toEqual(['example.com']);
  });

  it('extracts domains from /regex/-wrapped patterns', () => {
    expect(mapRegexToPatterns(['/example\\.com/'])).toEqual(['example.com']);
  });

  it('dedupes and drops empty entries', () => {
    expect(mapRegexToPatterns(['example.com', 'example.com', ''])).toEqual(['example.com']);
  });
});

describe('buildProviderBuiltinWebSearchConfig', () => {
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

  it('builds anthropic maxUses + blockedDomains, omitting blockedDomains when empty', () => {
    expect(
      buildProviderBuiltinWebSearchConfig(
        'anthropic',
        webSearchConfig({ maxResults: 3, excludeDomains: ['blocked.com'] }),
      ),
    ).toEqual({ anthropic: { maxUses: 3, blockedDomains: ['blocked.com'] } });

    expect(
      buildProviderBuiltinWebSearchConfig('anthropic', webSearchConfig({ maxResults: 3 })),
    ).toEqual({
      anthropic: { maxUses: 3, blockedDomains: undefined },
    });
  });

  it('caps xai excludedDomains at 5 and always enables image understanding', () => {
    const manyDomains = Array.from({ length: 8 }, (_, i) => `d${i}.com`);
    const result = buildProviderBuiltinWebSearchConfig(
      'xai-responses',
      webSearchConfig({ excludeDomains: manyDomains }),
    );
    expect(result).toEqual({
      'xai-responses': {
        webSearch: { enableImageUnderstanding: true, excludedDomains: manyDomains.slice(0, 5) },
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
    ).toEqual({
      anthropic: { maxUses: 3, blockedDomains: undefined },
    });
  });

  it('returns an empty config for cherryin with no resolvable endpoint', () => {
    const model = createModel({ providerId: 'cherryin', endpointTypes: undefined });
    expect(buildProviderBuiltinWebSearchConfig('cherryin', webSearchConfig(), model)).toEqual({});
  });

  it('falls back to an empty config for unhandled providers', () => {
    expect(buildProviderBuiltinWebSearchConfig('unknown-provider', webSearchConfig())).toEqual({});
  });
});

describe('getWebSearchParams (unchanged existing behavior)', () => {
  it('still returns provider-specific extra params', () => {
    expect(getWebSearchParams(createModel({ providerId: 'hunyuan' }))).toEqual({
      enable_enhancement: true,
      citation: true,
      search_info: true,
    });
  });
});
