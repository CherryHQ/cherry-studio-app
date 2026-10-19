import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  getWebSearchProviderPresetsByCapability,
} from '../webSearchProviders';

test('keeps Exa MCP available for both keyword search and page reading', () => {
  for (const capability of ['searchKeywords', 'fetchUrls'] as const) {
    expect(
      getWebSearchProviderPresetsByCapability(capability).some((item) => item.id === 'exa-mcp'),
    ).toBe(true);
  }
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
