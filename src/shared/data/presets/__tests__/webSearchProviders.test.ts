import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  WebSearchProviderOverridesSchema,
  getWebSearchProviderPresetsByCapability,
} from '../webSearchProviders';

test('admits DeepSeek search and fetch with separate host settings and required keys', () => {
  for (const capability of ['searchKeywords', 'fetchUrls'] as const) {
    expect(
      getWebSearchProviderPresetsByCapability(capability).find((item) => item.id === 'deepseek'),
    ).toMatchObject({
      name: 'DeepSeek',
      capabilities: expect.arrayContaining([
        {
          feature: capability,
          requiresApiHost: true,
          requiresApiKey: true,
          apiHost: 'https://api.deepseek.com',
        },
      ]),
    });
  }
  const saved = {
    jina: { apiKeys: ['existing'] },
    deepseek: {
      apiKeys: ['deepseek-key'],
      capabilities: {
        searchKeywords: { apiHost: 'https://search.example.com' },
        fetchUrls: { apiHost: 'https://fetch.example.com' },
      },
    },
  };
  expect(WebSearchProviderOverridesSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  expect(WebSearchProviderOverridesSchema.safeParse({ unknown: {} }).success).toBe(false);
});

test('keeps Exa MCP available for both keyword search and page reading', () => {
  for (const capability of ['searchKeywords', 'fetchUrls'] as const) {
    expect(
      getWebSearchProviderPresetsByCapability(capability).some((item) => item.id === 'exa-mcp'),
    ).toBe(true);
  }
});

test('offers Yuanbao for keyword search and persists its service credentials', () => {
  expect(getWebSearchProviderPresetsByCapability('searchKeywords')).toContainEqual({
    id: 'yuanbao',
    name: 'Yuanbao',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.wsa.cloud.tencent.com',
      },
    ],
  });
  expect(
    getWebSearchProviderPresetsByCapability('fetchUrls').some((item) => item.id === 'yuanbao'),
  ).toBe(false);
  const overrides = { yuanbao: { apiKeys: ['service-key'] }, jina: { apiKeys: ['existing-key'] } };
  expect(WebSearchProviderOverridesSchema.parse(JSON.parse(JSON.stringify(overrides)))).toEqual(
    overrides,
  );
});

test('requires a user-supplied SearXNG address instead of a desktop localhost default', () => {
  expect(WEB_SEARCH_PROVIDER_PRESET_MAP.searxng.capabilities).toEqual([
    {
      feature: 'searchKeywords',
      requiresApiHost: true,
      requiresApiKey: false,
      apiHost: '',
    },
  ]);
});

test('offers SearchApi only for search and retains its saved credentials and custom host', () => {
  expect(getWebSearchProviderPresetsByCapability('searchKeywords')).toContainEqual({
    id: 'searchapi',
    name: 'SearchApi',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://www.searchapi.io',
      },
    ],
  });
  expect(
    getWebSearchProviderPresetsByCapability('fetchUrls').some((item) => item.id === 'searchapi'),
  ).toBe(false);
  const saved = {
    jina: { apiKeys: ['existing-key'] },
    searchapi: {
      apiKeys: ['searchapi-key'],
      capabilities: { searchKeywords: { apiHost: 'https://search.example.com' } },
    },
  };
  expect(WebSearchProviderOverridesSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
});

test('retains hostless local extraction separately from remote protocols', () => {
  expect(WEB_SEARCH_PROVIDER_PRESET_MAP.fetch.capabilities).toEqual([
    {
      feature: 'fetchUrls',
      requiresApiHost: false,
      requiresApiKey: false,
    },
  ]);
});

test('requires a Jina key for searches while allowing anonymous page reads', () => {
  expect(WEB_SEARCH_PROVIDER_PRESET_MAP.jina.capabilities).toEqual([
    expect.objectContaining({ feature: 'searchKeywords', requiresApiKey: true }),
    expect.objectContaining({ feature: 'fetchUrls', requiresApiKey: false }),
  ]);
});
