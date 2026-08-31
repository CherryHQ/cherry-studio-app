import {
  getWebSearchProviderDetailSections,
  mergeWebSearchProviderOverride,
} from '../providerSettings';

describe('web search provider settings', () => {
  test('returns provider detail sections', () => {
    expect(getWebSearchProviderDetailSections('tavily')).toEqual([{ type: 'apiKeys' }]);
    expect(getWebSearchProviderDetailSections('fetch')).toEqual([]);
    expect(getWebSearchProviderDetailSections('zhipu')).toEqual([{ type: 'zhipuApiKeyShortcut' }]);
    expect(getWebSearchProviderDetailSections('searxng')).toEqual([]);
    expect(getWebSearchProviderDetailSections('exa-mcp')).toEqual([]);
    expect(getWebSearchProviderDetailSections('firecrawl')).toEqual([{ type: 'apiKeys' }]);
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
