import {
  getWebSearchFeatureSections,
  getWebSearchProviderDescriptionKey,
  getWebSearchProviderDetailSections,
  getWebSearchProviderOfficialWebsite,
  mergeWebSearchProviderOverride,
  normalizeWebSearchApiHost,
} from '../providerSettings';

describe('web search provider settings', () => {
  test('returns provider display metadata', () => {
    expect(getWebSearchProviderDescriptionKey('fetch')).toBe(
      'settings.websearch.providerDescription.fetch',
    );
    expect(getWebSearchProviderDescriptionKey('exa-mcp')).toBeUndefined();
    expect(getWebSearchProviderOfficialWebsite('jina')).toBe('https://jina.ai/reader');
  });

  test('returns provider detail sections', () => {
    expect(getWebSearchProviderDetailSections('tavily')).toEqual([
      { type: 'apiKeys' },
      { type: 'capabilityApiHosts' },
    ]);
    expect(getWebSearchProviderDetailSections('fetch')).toEqual([{ type: 'description' }]);
    expect(getWebSearchProviderDetailSections('zhipu')).toEqual([
      { type: 'zhipuApiKeyShortcut' },
      { type: 'capabilityApiHosts' },
    ]);
    expect(getWebSearchProviderDetailSections('searxng')).toEqual([
      { type: 'capabilityApiHosts' },
      { type: 'basicAuth' },
    ]);
    expect(getWebSearchProviderDetailSections('exa-mcp')).toEqual([]);
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
    ]);
    expect(sections[1].capability).toBe('fetchUrls');
    expect(sections[1].entries.map((entry) => entry.key)).toEqual([
      'fetchUrls:fetch',
      'fetchUrls:jina',
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
