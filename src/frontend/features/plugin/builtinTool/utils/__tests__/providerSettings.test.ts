import {
  getWebSearchProviderCheckPlacement,
  getWebSearchProviderDetailSections,
  getWebSearchProviderPreset,
  isSelfHostedWebSearchProvider,
  mergeWebSearchProviderOverride,
  parseWebSearchApiHostInput,
} from '../providerSettings';

type ProviderId = Parameters<typeof getWebSearchProviderPreset>[0];
type Capability = 'fetchUrls' | 'searchKeywords';

function sectionTypes(providerId: ProviderId, capability: Capability = 'searchKeywords') {
  return getWebSearchProviderDetailSections(getWebSearchProviderPreset(providerId), capability).map(
    (section) => section.type,
  );
}

describe('web search provider settings', () => {
  test('derives each provider settings from its preset', () => {
    expect(sectionTypes('tavily')).toEqual(['apiKeys', 'apiHost']);
    expect(sectionTypes('deepseek')).toEqual(['apiKeys', 'apiHost']);
    expect(sectionTypes('deepseek', 'fetchUrls')).toEqual(['apiKeys', 'apiHost']);
    expect(sectionTypes('firecrawl', 'fetchUrls')).toEqual(['apiKeys', 'apiHost']);
    expect(sectionTypes('crawl4ai', 'fetchUrls')).toEqual(['apiKeys', 'apiHost']);
    // Zhipu reuses the model provider key; Exa MCP reuses the Exa key.
    expect(sectionTypes('zhipu')).toEqual(['zhipuApiKeyShortcut', 'apiHost']);
    expect(sectionTypes('exa-mcp')).toEqual(['apiHost']);
    expect(sectionTypes('searxng')).toEqual(['apiHost', 'basicAuth']);
    expect(sectionTypes('fetch', 'fetchUrls')).toEqual([]);
  });

  test('marks only providers without a built-in address as self-hosted', () => {
    const selfHosted = (id: ProviderId, capability: Capability) =>
      isSelfHostedWebSearchProvider(getWebSearchProviderPreset(id), capability);

    expect(selfHosted('searxng', 'searchKeywords')).toBe(true);
    expect(selfHosted('crawl4ai', 'fetchUrls')).toBe(true);
    expect(selfHosted('tavily', 'searchKeywords')).toBe(false);
    expect(selfHosted('fetch', 'fetchUrls')).toBe(false);
  });

  test('puts the check beside the setting it depends on', () => {
    const placement = (id: ProviderId, capability: Capability) =>
      getWebSearchProviderCheckPlacement(getWebSearchProviderPreset(id), capability);

    expect(placement('tavily', 'searchKeywords')).toBe('apiKeys');
    expect(placement('deepseek', 'searchKeywords')).toBe('apiKeys');
    expect(placement('deepseek', 'fetchUrls')).toBe('apiKeys');
    expect(placement('jina', 'fetchUrls')).toBe('apiKeys');
    expect(placement('crawl4ai', 'fetchUrls')).toBe('apiHost');
    expect(placement('searxng', 'searchKeywords')).toBe('apiHost');
    expect(placement('exa-mcp', 'searchKeywords')).toBe('apiHost');
    expect(placement('fetch', 'fetchUrls')).toBeNull();
  });

  test('normalizes an address, restores the default when empty, and rejects other schemes', () => {
    expect(parseWebSearchApiHostInput(' http://192.168.1.20:8080/// ')).toEqual({
      apiHost: 'http://192.168.1.20:8080',
      valid: true,
    });
    expect(parseWebSearchApiHostInput('   ')).toEqual({ apiHost: undefined, valid: true });
    expect(parseWebSearchApiHostInput('192.168.1.20:8080')).toEqual({ valid: false });
    expect(parseWebSearchApiHostInput('ftp://example.com')).toEqual({ valid: false });
  });

  test('merges provider overrides without dropping sibling fields', () => {
    const nextOverrides = mergeWebSearchProviderOverride(
      {
        jina: {
          apiKeys: ['existing-key'],
          capabilities: {
            searchKeywords: { apiHost: 'https://s.example.com' },
          },
        },
      },
      'jina',
      {
        capabilities: {
          fetchUrls: { apiHost: 'https://r.example.com' },
        },
      },
    );

    expect(nextOverrides.jina).toEqual({
      apiKeys: ['existing-key'],
      capabilities: {
        searchKeywords: { apiHost: 'https://s.example.com' },
        fetchUrls: { apiHost: 'https://r.example.com' },
      },
    });
  });
});
