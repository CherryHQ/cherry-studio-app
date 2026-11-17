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

test('runs Desearch through the mobile registry with its key, host and caller cancellation', async () => {
  const configuration = providerConfig('desearch');
  configuration.apiKeys = ['desearch-key'];
  configuration.capabilities[0].apiHost = 'https://search.example.com';
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      data: [{ title: 'Result', snippet: 'Summary', link: 'https://example.com' }],
    }),
  });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  const signal = new AbortController().signal;
  await expect(provider.searchKeywords!('猫 & dog', config, { signal })).resolves.toMatchObject({
    providerId: 'desearch',
    capability: 'searchKeywords',
    results: [
      { title: 'Result', content: 'Summary', url: 'https://example.com', sourceInput: '猫 & dog' },
    ],
  });
  expect(request.mock.calls[0][0]).toMatchObject({
    url: 'https://search.example.com/web?query=%E7%8C%AB%20%26%20dog',
    method: 'GET',
    headers: { Authorization: 'desearch-key' },
    signal,
  });
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

test('reads Exa pages through the mobile provider with its configured host and key', async () => {
  const configuration = providerConfig('exa');
  configuration.apiKeys = ['exa-key'];
  configuration.capabilities.find((item) => item.feature === 'fetchUrls')!.apiHost =
    'https://read.example.com';
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      results: [{ title: 'Page', text: ' Full page ', url: 'https://example.com' }],
    }),
  });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.fetchUrls!(' https://example.com ', config)).resolves.toMatchObject({
    providerId: 'exa',
    capability: 'fetchUrls',
    results: [{ title: 'Page', content: 'Full page', sourceInput: 'https://example.com' }],
  });
  const call = request.mock.calls[0][0];
  expect(call).toMatchObject({
    url: 'https://read.example.com/contents',
    method: 'POST',
    headers: { 'x-api-key': 'exa-key' },
    timeoutMs: 60_000,
  });
  expect(JSON.parse(call.body!)).toEqual({ urls: ['https://example.com'], text: true });
});

test.each([
  {
    id: 'stepfun',
    response: { results: [{ title: 'Result', url: 'https://example.com', snippet: 'Summary' }] },
    path: '/v1/search',
    method: 'POST',
    body: { query: 'query', n: 5 },
  },
  {
    id: 'serpkite',
    response: { results: [{ title: 'Result', link: 'https://example.com', snippet: 'Summary' }] },
    path: '/v1/search?q=query&num=5',
    method: 'GET',
    body: undefined,
  },
] as const)('runs $id searches with mobile credentials and result limits', async (scenario) => {
  const configuration = providerConfig(scenario.id);
  configuration.apiKeys = ['search-key'];
  configuration.capabilities[0].apiHost = 'https://search.example.com';
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify(scenario.response),
  });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!('query', config)).resolves.toMatchObject({
    providerId: scenario.id,
    results: [{ title: 'Result', content: 'Summary', url: 'https://example.com' }],
  });
  const call = request.mock.calls[0][0];
  expect(call).toMatchObject({
    url: `https://search.example.com${scenario.path}`,
    method: scenario.method,
    headers: { Authorization: 'Bearer search-key' },
  });
  expect(call.body ? JSON.parse(call.body) : undefined).toEqual(scenario.body);
});

test.each([
  [5, 5],
  [100, 100],
  [101, 100],
  [200, 100],
])(
  'limits SerpKite requests for %i configured results to %i',
  async (maxResults, expectedResults) => {
    const configuration = providerConfig('serpkite');
    configuration.apiKeys = ['search-key'];
    const runtimeConfig = Object.freeze({ ...config, maxResults });
    request.mockResolvedValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({ results: [] }),
    });
    const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), {
      request,
    });

    await provider.searchKeywords!('query', runtimeConfig);

    expect(request.mock.calls[0][0].url).toBe(
      `https://api.serpkite.com/v1/search?q=query&num=${expectedResults}`,
    );
    expect(runtimeConfig.maxResults).toBe(maxResults);
  },
);

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

test('uses the Yuanbao service key and result limit through the mobile provider', async () => {
  const configuration = providerConfig('yuanbao');
  configuration.apiKeys = ['yuanbao-service-key'];
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      Response: {
        Pages: [
          JSON.stringify({
            title: 'Result',
            url: 'https://example.com',
            passage: 'Search passage',
          }),
        ],
      },
    }),
  });
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!('元宝搜索', config)).resolves.toMatchObject({
    providerId: 'yuanbao',
    capability: 'searchKeywords',
    results: [{ title: 'Result', url: 'https://example.com', content: 'Search passage' }],
  });
  const call = request.mock.calls[0][0];
  expect(call).toMatchObject({
    url: 'https://api.wsa.cloud.tencent.com/SearchPro',
    method: 'POST',
    headers: { Authorization: 'Bearer yuanbao-service-key' },
  });
  expect(JSON.parse(call.body!)).toEqual({ Query: '元宝搜索', Cnt: 10 });
});

test('requires Yuanbao credentials and preserves provider errors', async () => {
  const configuration = providerConfig('yuanbao');
  const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
  await expect(provider.searchKeywords!('query', config)).rejects.toMatchObject({
    code: 'api_key_missing',
  });
  expect(request).not.toHaveBeenCalled();

  configuration.apiKeys = ['rejected-key'];
  request.mockResolvedValue({
    status: 200,
    headers: {},
    bodyText: JSON.stringify({
      Response: {
        Error: { Code: 'AuthFailure', Message: 'Invalid service key' },
        RequestId: 'request-1',
      },
    }),
  });
  await expect(provider.searchKeywords!('query', config)).rejects.toMatchObject({
    kind: 'provider',
    code: 'provider_error',
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  [
    'https://api.crawl4ai.com',
    '/scrape',
    { ok: true, markdown: 'Cloud content' },
    { url: 'https://example.com', format: 'md' },
  ],
  [
    'https://crawl.example.com',
    '/md',
    { success: true, url: 'https://example.com', markdown: 'Self-hosted content' },
    { url: 'https://example.com', f: 'fit' },
  ],
] as const)(
  'reads pages through the configured Crawl4AI host: %s',
  async (apiHost, path, response, body) => {
    const configuration = providerConfig('crawl4ai');
    configuration.apiKeys = ['crawl-key'];
    configuration.capabilities[0].apiHost = apiHost;
    request.mockResolvedValue({ status: 200, headers: {}, bodyText: JSON.stringify(response) });
    const provider = createWebSearchProvider(configuration, new ApiKeyRotationState(), { request });
    await expect(provider.fetchUrls!('https://example.com', config)).resolves.toMatchObject({
      results: [{ content: response.markdown, url: 'https://example.com' }],
    });
    expect(request.mock.calls[0][0].url).toBe(`${apiHost}${path}`);
    expect(JSON.parse(request.mock.calls[0][0].body!)).toEqual(body);
  },
);

function providerConfig(id: WebSearchProvider['id']): WebSearchProvider {
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
