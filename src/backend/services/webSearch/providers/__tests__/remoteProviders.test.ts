import type { WebSearchHttpRequest, WebSearchHttpResponse } from '@cherrystudio/web-search';
import { exaMcp } from '@cherrystudio/web-search/providers/exa-mcp';

import { WEB_SEARCH_PROVIDER_PRESET_MAP } from '@/shared/data/presets/webSearchProviders';
import type { WebSearchExecutionConfig, WebSearchProvider } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../utils/provider';
import { RemoteWebSearchProvider } from '../base/RemoteWebSearchProvider';
import { createWebSearchProvider } from '../factory';

const request = jest.fn<Promise<WebSearchHttpResponse>, [WebSearchHttpRequest]>();
const config: WebSearchExecutionConfig = {
  maxResults: 5,
  compression: { method: 'none', cutoffLimit: 2_000 },
};

beforeEach(() => {
  request.mockReset();
});

test('keeps Exa MCP search and page-reading capabilities with their separate deadlines', async () => {
  request
    .mockResolvedValueOnce(mcpResponse('Title: Example\nURL: https://example.com\nText: Snippet'))
    .mockResolvedValueOnce(mcpResponse('# Example\nURL: https://example.com\n\nPage'));
  const provider = new RemoteWebSearchProvider(
    providerConfig('exa-mcp'),
    new ApiKeyRotationState(),
    exaMcp,
    { request },
  );
  await provider.searchKeywords('query', config);
  await expect(provider.fetchUrls('https://example.com', config)).resolves.toMatchObject({
    capability: 'fetchUrls',
    results: [{ content: 'Page', sourceInput: 'https://example.com' }],
  });
  expect(request.mock.calls.map(([call]) => call.timeoutMs)).toEqual([25_000, 60_000]);
  expect(JSON.parse(request.mock.calls[1][0].body!).params.arguments).toEqual({
    urls: ['https://example.com'],
    maxCharacters: 24_000,
  });
});

test('never enables a protocol capability absent from the host configuration', async () => {
  const configuration = providerConfig('exa-mcp');
  configuration.capabilities = configuration.capabilities.filter(
    (item) => item.feature === 'searchKeywords',
  );
  const provider = new RemoteWebSearchProvider(configuration, new ApiKeyRotationState(), exaMcp, {
    request,
  });
  await expect(provider.fetchUrls('https://example.com', config)).rejects.toMatchObject({
    code: 'capability_unsupported',
  });
  expect(request).not.toHaveBeenCalled();
});

test('keeps SearXNG snippets and instance defaults without discovery or result-page downloads', async () => {
  const configuration = providerConfig('searxng');
  configuration.capabilities[0].apiHost = 'https://search.example';
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      results: [{ title: 'Snippet title', content: 'Snippet body', url: 'https://example.com' }],
    }),
  });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!('query', config)).resolves.toMatchObject({
    results: [{ title: 'Snippet title', content: 'Snippet body' }],
  });
  expect(request.mock.calls.map(([call]) => call.url)).toEqual([
    'https://search.example/search?q=query&language=auto&format=json',
  ]);
});

test('routes DeepSeek search and fetch through the registered protocol with independent hosts', async () => {
  const configuration = providerConfig('deepseek');
  configuration.apiKeys = ['test-key'];
  configuration.capabilities[0].apiHost = 'https://search.example.com';
  configuration.capabilities[1].apiHost = 'https://fetch.example.com';
  const query = '猫😀'.repeat(70);
  request
    .mockResolvedValueOnce({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        results: [{ title: 'Result', url: 'https://example.com', snippet: 'Summary' }],
      }),
    })
    .mockResolvedValueOnce({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({ title: 'Page', content: 'Full page' }),
    });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!(query, config)).resolves.toMatchObject({
    providerId: 'deepseek',
    capability: 'searchKeywords',
    results: [{ title: 'Result', content: 'Summary', sourceInput: query }],
  });
  await expect(provider.fetchUrls!('https://example.com', config)).resolves.toMatchObject({
    providerId: 'deepseek',
    capability: 'fetchUrls',
    results: [{ title: 'Page', content: 'Full page', url: 'https://example.com' }],
  });
  const [search, fetch] = request.mock.calls.map(([call]) => call);
  expect(search).toMatchObject({
    url: 'https://search.example.com/v1/tools/search',
    method: 'POST',
    headers: { Authorization: 'Bearer test-key' },
  });
  expect(JSON.parse(search.body!)).toEqual({ query: '猫😀'.repeat(64), count: 5 });
  expect(fetch).toMatchObject({
    url: 'https://fetch.example.com/v1/tools/fetch',
    method: 'POST',
    headers: { Authorization: 'Bearer test-key' },
  });
  expect(JSON.parse(fetch.body!)).toEqual({ url: 'https://example.com' });
});

test.each(['searchKeywords', 'fetchUrls'] as const)(
  'does not dispatch DeepSeek %s without a key or after cancellation',
  async (capability) => {
    const configuration = providerConfig('deepseek');
    const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
    const input = capability === 'searchKeywords' ? 'query' : 'https://example.com';
    await expect(provider[capability]!(input, config)).rejects.toMatchObject({
      code: 'api_key_missing',
    });
    expect(request).not.toHaveBeenCalled();

    configuration.apiKeys = ['test-key'];
    await expect(
      provider[capability]!(input, config, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(request).not.toHaveBeenCalled();
  },
);

test('preserves a DeepSeek authentication failure without retrying the request', async () => {
  const configuration = providerConfig('deepseek');
  configuration.apiKeys = ['rejected-key'];
  request.mockResolvedValue({ status: 401, headers: {}, bodyText: 'Invalid key' });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!('query', config)).rejects.toMatchObject({
    kind: 'http',
    status: 401,
  });
  expect(request).toHaveBeenCalledTimes(1);
});

function providerConfig(id: 'exa-mcp' | 'searxng' | 'deepseek'): WebSearchProvider {
  const preset = WEB_SEARCH_PROVIDER_PRESET_MAP[id];
  return {
    id,
    ...preset,
    apiKeys: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
    engines: [],
    capabilities: preset.capabilities.map((item) => ({ ...item })),
  };
}

function mcpResponse(text: string) {
  return {
    status: 200,
    headers: {},
    bodyText: JSON.stringify({ result: { content: [{ type: 'text', text }] } }),
  };
}
