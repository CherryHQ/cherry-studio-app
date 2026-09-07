import type { PreferenceService } from '@/backend/data/PreferenceService';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';

import { requestWebSearchJson, type WebSearchJsonRequester } from '../http/requestWebSearchJson';

jest.mock('../http/requestWebSearchJson', () => ({
  requestWebSearchJson: jest.fn(),
}));

const requestWebSearchJsonMock =
  requestWebSearchJson as jest.MockedFunction<WebSearchJsonRequester>;

describe('WebSearchService', () => {
  beforeEach(() => {
    requestWebSearchJsonMock.mockReset();
  });

  test('checks provider with temporary selected api key', async () => {
    requestWebSearchJsonMock.mockResolvedValue({
      query: 'test query',
      request_id: 'request-1',
      response_time: 0.1,
      results: [{ title: 'OK', content: 'content', url: 'https://example.com' }],
    });

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

    expect(requestWebSearchJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer selected-key' }),
        method: 'POST',
        providerId: 'tavily',
        url: 'https://api.tavily.com/search',
      }),
    );
  });

  test('returns the results it did get when one keyword request fails', async () => {
    requestWebSearchJsonMock
      .mockResolvedValueOnce({
        query: 'first',
        request_id: 'request-1',
        response_time: 0.1,
        results: [{ title: 'First', content: 'first content', url: 'https://example.com/a' }],
      })
      .mockRejectedValueOnce(new Error('nope'));

    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_search_keywords_provider': 'tavily',
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
          title: 'First',
          content: 'first content',
          url: 'https://example.com/a',
          sourceInput: 'first',
        },
      ],
    });
  });

  test('caps provider page content before returning it even with stored compression disabled', async () => {
    requestWebSearchJsonMock.mockResolvedValue({
      data: {
        title: 'Long article',
        content: '文'.repeat(5_000),
        url: 'https://example.com/article',
      },
    });
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_fetch_urls_provider': 'jina',
        'chat.web_search.compression.method': 'none',
      }),
    );

    const response = await service.fetchUrls({ urls: ['https://example.com/article'] });

    expect(response.results).toEqual([
      {
        title: 'Long article',
        content: '文'.repeat(4_000),
        url: 'https://example.com/article',
        sourceInput: 'https://example.com/article',
        truncated: true,
      },
    ]);
  });

  test('reports the fetch provider as unsupported during checks', async () => {
    const service = new WebSearchService(createPreferenceService());

    await expect(
      service.checkProvider({
        provider: {
          id: 'fetch',
          name: 'fetch',
          type: 'api',
          apiKeys: [],
          capabilities: [{ feature: 'fetchUrls' }],
          engines: [],
          basicAuthUsername: '',
          basicAuthPassword: '',
        },
        capability: 'fetchUrls',
      }),
    ).resolves.toEqual({
      valid: false,
      error: 'Web search provider fetch is not supported on mobile',
    });
  });
});

function createPreferenceService(values: Partial<PreferenceSchema> = {}) {
  // The two default-provider keys are deliberately absent: tests that exercise
  // the unconfigured path rely on `get` resolving them to undefined.
  const defaults: Partial<PreferenceSchema> = {
    'chat.web_search.max_results': 5,
    'chat.web_search.compression.method': 'none',
    'chat.web_search.compression.cutoff_limit': 2000,
    'chat.web_search.provider_overrides': {},
  };

  return {
    get: <K extends PreferenceKeyType>(key: K) =>
      (values[key] ?? defaults[key]) as PreferenceSchema[K],
  } as PreferenceService;
}
