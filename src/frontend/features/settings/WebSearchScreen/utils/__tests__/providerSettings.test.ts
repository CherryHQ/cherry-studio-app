import {
  getWebSearchFeatureSections,
  getWebSearchProviderDetailSections,
  mergeWebSearchProviderOverride,
  normalizeWebSearchApiHost,
} from '../providerSettings';

describe('web search provider settings', () => {
  test('returns provider detail sections', () => {
    expect(getWebSearchProviderDetailSections('tavily')).toEqual([
      { type: 'apiKeys' },
      { type: 'capabilityApiHosts' },
    ]);
    expect(getWebSearchProviderDetailSections('fetch')).toEqual([]);
    expect(getWebSearchProviderDetailSections('zhipu')).toEqual([{ type: 'zhipuApiKeyShortcut' }]);
    expect(getWebSearchProviderDetailSections('searxng')).toEqual([
      { type: 'capabilityApiHosts' },
      { type: 'basicAuth' },
    ]);
    expect(getWebSearchProviderDetailSections('exa-mcp')).toEqual([{ type: 'capabilityApiHosts' }]);
    expect(getWebSearchProviderDetailSections('firecrawl')).toEqual([
      { type: 'apiKeys' },
      { type: 'capabilityApiHosts' },
    ]);
  });

  test('groups providers by capability', () => {
    const sections = getWebSearchFeatureSections();

    expect(sections).toHaveLength(2);
    expect(sections[0].capability).toBe('searchKeywords');
    expect(sections[0].entries.map((entry) => entry.key)).toEqual([
      'searchKeywords:zhipu',
      'searchKeywords:tavily',
      'searchKeywords:searxng',
      'searchKeywords:exa',
      'searchKeywords:exa-mcp',
      'searchKeywords:bocha',
      'searchKeywords:querit',
      'searchKeywords:jina',
      'searchKeywords:firecrawl',
    ]);
    expect(sections[1].capability).toBe('fetchUrls');
    expect(sections[1].entries.map((entry) => entry.key)).toEqual([
      'fetchUrls:jina',
      'fetchUrls:firecrawl',
    ]);
  });

  test('normalizes api host input without strict url validation', () => {
    expect(normalizeWebSearchApiHost(' https://api.example.com/// ')).toBe(
      'https://api.example.com',
    );
    expect(normalizeWebSearchApiHost(' http://localhost:8080/ ')).toBe('http://localhost:8080');
    expect(normalizeWebSearchApiHost('   ')).toBe('');
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
