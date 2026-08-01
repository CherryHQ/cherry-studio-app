import type { PreferenceService } from '@/backend/data/PreferenceService';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type {
  PreferenceDefaultScopeType,
  PreferenceKeyType,
} from '@cherrystudio/universal/data/preference';

describe('WebSearchService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('checks provider with temporary selected api key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'test query',
          request_id: 'request-1',
          response_time: 0.1,
          results: [{ title: 'OK', content: 'content', url: 'https://example.com' }],
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock;

    const service = new WebSearchService(createPreferenceService());

    await expect(
      service.checkProvider({
        provider: {
          id: 'tavily',
          name: 'Tavily',
          type: 'api',
          apiKeys: ['selected-key'],
          capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.tavily.com' }],
          engines: [],
          basicAuthUsername: '',
          basicAuthPassword: '',
        },
      }),
    ).resolves.toEqual({ valid: true });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer selected-key');
  });

  test('returns partial results and filters blacklisted URLs', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: 'first',
            request_id: 'request-1',
            response_time: 0.1,
            results: [
              { title: 'Allowed', content: 'allowed content', url: 'https://allowed.example/a' },
              { title: 'Blocked', content: 'blocked content', url: 'https://blocked.example/a' },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('nope', { status: 500 }));
    global.fetch = fetchMock;

    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_search_keywords_provider': 'tavily',
        'chat.web_search.exclude_domains': ['https://blocked.example/*'],
        'chat.web_search.provider_overrides': {
          tavily: {
            apiKeys: ['key'],
          },
        },
      }),
    );

    await expect(
      service.searchKeywords({ keywords: [' first ', 'second'] }),
    ).resolves.toMatchObject({
      query: 'first | second',
      providerId: 'tavily',
      results: [
        {
          title: 'Allowed',
          content: 'allowed content',
          url: 'https://allowed.example/a',
          sourceInput: 'first',
        },
      ],
    });
  });

  test.each([
    { capability: 'fetchUrls' as const, id: 'fetch' as const, name: 'fetch' },
    { capability: 'searchKeywords' as const, id: 'firecrawl' as const, name: 'Firecrawl' },
  ])('reports unsupported mobile provider $id during checks', async ({ capability, id, name }) => {
    const service = new WebSearchService(createPreferenceService());

    await expect(
      service.checkProvider({
        provider: {
          id,
          name,
          type: 'api',
          apiKeys: [],
          capabilities: [{ feature: capability }],
          engines: [],
          basicAuthUsername: '',
          basicAuthPassword: '',
        },
        capability,
      }),
    ).resolves.toEqual({
      valid: false,
      error: `Web search provider ${id} is not supported on mobile`,
    });
  });
});

function createPreferenceService(values: Partial<PreferenceDefaultScopeType> = {}) {
  const defaults: Partial<PreferenceDefaultScopeType> = {
    'chat.web_search.default_fetch_urls_provider': null,
    'chat.web_search.default_search_keywords_provider': null,
    'chat.web_search.exclude_domains': [],
    'chat.web_search.max_results': 5,
    'chat.web_search.compression.method': 'none',
    'chat.web_search.compression.cutoff_limit': 2000,
    'chat.web_search.provider_overrides': {},
  };

  return {
    get: <K extends PreferenceKeyType>(key: K) =>
      (values[key] ?? defaults[key]) as PreferenceDefaultScopeType[K],
  } as PreferenceService;
}
