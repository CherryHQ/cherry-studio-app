import { WebSearchTransportError } from '@cherrystudio/web-search';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';
import { PreferenceDefaults } from '@/shared/data/preference';

import { downloadWebPage } from '../http/downloadWebPage';
import { mobileWebSearchTransport } from '../transport';

jest.mock('../transport', () => ({ mobileWebSearchTransport: { request: jest.fn() } }));
jest.mock('../http/downloadWebPage', () => ({ downloadWebPage: jest.fn() }));
jest.mock('@/backend/services/device', () => ({ isDeviceRegionMainlandChina: () => false }));

const request = jest.mocked(mobileWebSearchTransport.request);

beforeEach(() => {
  request.mockReset().mockRejectedValue(new WebSearchTransportError('network', 'offline'));
  jest.mocked(downloadWebPage).mockReset();
});

describe('WebSearchService', () => {
  test.each([
    ['fetch', undefined, true],
    ['crawl4ai', undefined, false],
    ['crawl4ai', 'https://crawl.example.com', true],
    ['crawl4ai', 'ftp://crawl.example.com', false],
  ] as const)(
    'checks %s readiness without network requests',
    async (providerId, apiHost, ready) => {
      const service = new WebSearchService(
        createPreferenceService({
          'chat.web_search.default_fetch_urls_provider': providerId,
          'chat.web_search.provider_overrides': apiHost
            ? { [providerId]: { capabilities: { fetchUrls: { apiHost } } } }
            : {},
        }),
      );
      await expect(service.isConfigured('fetchUrls')).resolves.toBe(ready);
      expect(request).not.toHaveBeenCalled();
      expect(downloadWebPage).not.toHaveBeenCalled();
    },
  );

  test('Jina readiness requires a key only for keyword search', async () => {
    const service = new WebSearchService(
      createPreferenceService({
        ...PreferenceDefaults,
        'chat.web_search.default_search_keywords_provider': 'jina',
      }),
    );
    await expect(service.isConfigured('searchKeywords')).resolves.toBe(false);
    await expect(service.isConfigured('fetchUrls')).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  test('reads anonymously through the fresh-install provider', async () => {
    request.mockResolvedValue(
      jsonResponse({
        data: { title: 'Example', content: 'Page body', url: 'https://example.com' },
      }),
    );
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));
    await expect(service.fetchUrls({ urls: ['https://example.com'] })).resolves.toMatchObject({
      providerId: 'jina',
      results: [{ content: 'Page body' }],
    });
    expect(request.mock.calls[0][0].headers).not.toHaveProperty('Authorization');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('uses hosted Exa MCP and retains Highlights with fresh-install defaults', async () => {
    request.mockResolvedValue(
      mcpResponse('Title: Example\nURL: https://example.com\nHighlights: Search content'),
    );
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));
    await expect(service.searchKeywords({ keywords: ['example'] })).resolves.toMatchObject({
      providerId: 'exa-mcp',
      results: [{ content: 'Search content', url: 'https://example.com' }],
    });
    expect(request.mock.calls[0][0].url).toBe('https://mcp.exa.ai/mcp');
  });

  test('records a timeout without retrying or switching providers', async () => {
    request.mockRejectedValue(new WebSearchTransportError('timeout', 'Timed out'));
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));
    await expect(service.fetchUrls({ urls: ['https://example.com'] })).resolves.toMatchObject({
      providerId: 'jina',
      results: [],
      failures: [{ input: 'https://example.com', kind: 'timeout', code: 'request_timeout' }],
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, 'https://search.example.com'])(
    'searches with saved SearchApi credentials, result limits and host %s',
    async (apiHost) => {
      request.mockResolvedValue(
        jsonResponse({
          organic_results: [
            { title: 'Result', snippet: 'Search content', link: 'https://example.com/first' },
            { title: 'Extra', snippet: 'Outside the limit', link: 'https://example.com/second' },
          ],
        }),
      );
      const service = new WebSearchService(
        createPreferenceService({
          'chat.web_search.default_search_keywords_provider': 'searchapi',
          'chat.web_search.max_results': 1,
          'chat.web_search.provider_overrides': {
            searchapi: {
              apiKeys: ['searchapi-key'],
              capabilities: { searchKeywords: { apiHost } },
            },
          },
        }),
      );
      const response = await service.searchKeywords({ keywords: [' 中文 & query '] });
      expect(response).toMatchObject({
        providerId: 'searchapi',
        capability: 'searchKeywords',
        results: [
          {
            title: 'Result',
            content: 'Search content',
            url: 'https://example.com/first',
            sourceInput: '中文 & query',
          },
        ],
      });
      expect(response.failures).toBeUndefined();
      expect(request).toHaveBeenCalledTimes(1);
      const call = request.mock.calls[0][0];
      const url = new URL(call.url);
      expect(`${url.origin}${url.pathname}`).toBe(
        `${apiHost ?? 'https://www.searchapi.io'}/api/v1/search`,
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({ engine: 'google', q: '中文 & query' });
      expect(call).toMatchObject({
        method: 'GET',
        headers: { Authorization: 'Bearer searchapi-key' },
      });
    },
  );

  test.each([{ apiKeys: [] }, { apiKeys: ['searchapi-key'] }])(
    'checks SearchApi credentials locally: $apiKeys',
    async ({ apiKeys }) => {
      const service = new WebSearchService(
        createPreferenceService({
          'chat.web_search.default_search_keywords_provider': 'searchapi',
          'chat.web_search.provider_overrides': { searchapi: { apiKeys } },
        }),
      );
      await expect(service.isConfigured('searchKeywords')).resolves.toBe(apiKeys.length > 0);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test('keeps Querit failed-page statuses out of content while retaining successful pages', async () => {
    request
      .mockResolvedValueOnce(
        jsonResponse({
          error_code: 200,
          error_msg: '',
          results: [{ id: 'first', url: 'https://example.com/a', content: 'Readable page' }],
          statuses: [{ id: 'first', status: 'success' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          error_code: 200,
          error_msg: '',
          results: [{ id: 'second', url: 'https://example.com/b', content: 'Error page content' }],
          statuses: [{ id: 'second', status: 'failed' }],
        }),
      );
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_fetch_urls_provider': 'querit',
        'chat.web_search.provider_overrides': { querit: { apiKeys: ['querit-key'] } },
      }),
    );
    const response = await service.fetchUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
    });
    expect(response.results.map((item) => item.content)).toEqual(['Readable page']);
    expect(response.failures).toEqual([
      expect.objectContaining({
        input: 'https://example.com/b',
        kind: 'provider',
        code: 'page_fetch_failed',
      }),
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('keeps partial results and the selected provider when another page fails', async () => {
    request
      .mockResolvedValueOnce(mcpResponse('# Page\nURL: https://example.com/a\n\nFirst'))
      .mockResolvedValueOnce(jsonResponse({ message: 'Unavailable' }, 503));
    const service = new WebSearchService(
      createPreferenceService({
        ...PreferenceDefaults,
        'chat.web_search.default_fetch_urls_provider': 'exa-mcp',
      }),
    );
    const response = await service.fetchUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
    });
    expect(response.results.map((item) => item.content)).toEqual(['First']);
    expect(response.providerId).toBe('exa-mcp');
    expect(response.failures).toEqual([
      expect.objectContaining({
        input: 'https://example.com/b',
        kind: 'http',
        status: 503,
      }),
    ]);
    expect(request.mock.calls.map(([call]) => call.url)).toEqual([
      'https://mcp.exa.ai/mcp',
      'https://mcp.exa.ai/mcp',
    ]);
  });

  test('retains every failed input, upstream code and HTTP status when all reads fail', async () => {
    request.mockResolvedValue(jsonResponse({ code: 'UNAVAILABLE', message: 'Unavailable' }, 503));
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));
    const urls = ['https://example.com/a', 'https://example.com/b'];
    await expect(service.fetchUrls({ urls })).resolves.toMatchObject({
      providerId: 'jina',
      results: [],
      failures: urls.map((input) => ({ input, kind: 'http', status: 503, code: 'UNAVAILABLE' })),
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('propagates caller cancellation without returning a lookup failure', async () => {
    const controller = new AbortController();
    request.mockImplementation(async () => {
      controller.abort();
      return jsonResponse({});
    });
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));
    await expect(
      service.fetchUrls({ urls: ['https://example.com'] }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('checks the selected provider using an unsaved key', async () => {
    request.mockResolvedValue(tavilyResponse('test query', 'Content'));
    const service = new WebSearchService(createPreferenceService());
    await expect(
      service.checkProvider({
        providerId: 'tavily',
        capability: 'searchKeywords',
        override: { apiKeys: ['selected-key'] },
      }),
    ).resolves.toEqual({ valid: true });
    expect(request.mock.calls[0][0].headers.Authorization).toBe('Bearer selected-key');
  });

  test('fails a check before requesting a service without its required key', async () => {
    const service = new WebSearchService(createPreferenceService());
    await expect(
      service.checkProvider({ providerId: 'parallel', capability: 'searchKeywords' }),
    ).resolves.toEqual({ valid: false, error: 'API key is required for provider parallel' });
    expect(request).not.toHaveBeenCalled();
  });

  test('reports a missing Crawl4AI Cloud key as a configuration failure', async () => {
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_fetch_urls_provider': 'crawl4ai',
      }),
    );
    await expect(service.fetchUrls({ urls: ['https://example.com'] })).resolves.toMatchObject({
      results: [],
      failures: [{ kind: 'configuration', code: 'api_key_missing' }],
    });
    expect(request).not.toHaveBeenCalled();
  });

  test('keeps successful keywords and reports failed inputs from the same provider', async () => {
    request
      .mockResolvedValueOnce(tavilyResponse('first', 'First content'))
      .mockRejectedValueOnce(new WebSearchTransportError('network', 'offline'));
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_search_keywords_provider': 'tavily',
        'chat.web_search.provider_overrides': { tavily: { apiKeys: ['key'] } },
      }),
    );
    await expect(
      service.searchKeywords({ keywords: [' first ', 'second'] }),
    ).resolves.toMatchObject({
      query: 'first | second',
      providerId: 'tavily',
      failures: [{ input: 'second', kind: 'network' }],
      results: [{ content: 'First content', sourceInput: 'first' }],
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('caps page content even when stored search compression is disabled', async () => {
    request.mockResolvedValue(
      jsonResponse({ data: { title: 'Long', content: '文'.repeat(5_000) } }),
    );
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_fetch_urls_provider': 'jina',
        'chat.web_search.compression.method': 'none',
      }),
    );
    const response = await service.fetchUrls({ urls: ['https://example.com/article'] });
    expect(response.results[0]).toMatchObject({
      content: '文'.repeat(4_000),
      truncated: true,
      sourceInput: 'https://example.com/article',
    });
  });

  test('keeps local extraction and final source URLs outside the shared remote client', async () => {
    jest.mocked(downloadWebPage).mockResolvedValue({
      content: 'Local content',
      isHtml: false,
      url: 'https://example.com/article',
    });
    const service = new WebSearchService(createPreferenceService());
    await expect(
      service.fetchUrls({ providerId: 'fetch', urls: ['https://example.com/start'] }),
    ).resolves.toMatchObject({
      providerId: 'fetch',
      results: [
        {
          content: 'Local content',
          url: 'https://example.com/article',
          sourceInput: 'https://example.com/start',
        },
      ],
    });
    expect(request).not.toHaveBeenCalled();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return { bodyText: JSON.stringify(payload), headers: {}, status };
}

function mcpResponse(text: string) {
  return jsonResponse({ result: { content: [{ type: 'text', text }] } });
}

function tavilyResponse(query: string, content: string) {
  return jsonResponse({
    query,
    request_id: 'request-1',
    response_time: 0.1,
    results: [{ title: 'Result', content, url: 'https://example.com' }],
  });
}

function createPreferenceService(values: Partial<PreferenceSchema> = {}) {
  const preferences: Partial<PreferenceSchema> = {
    'chat.web_search.max_results': 5,
    'chat.web_search.compression.method': 'none',
    'chat.web_search.compression.cutoff_limit': 2000,
    'chat.web_search.provider_overrides': {},
    ...values,
  };
  return {
    get: jest.fn(async (key: PreferenceKeyType) => preferences[key]),
  } as unknown as PreferenceService;
}
