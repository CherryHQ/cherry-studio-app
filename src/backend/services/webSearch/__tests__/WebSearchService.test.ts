import type { PreferenceService } from '@/backend/data/PreferenceService';
import { HttpError } from '@/backend/services/http';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';
import { PreferenceDefaults } from '@/shared/data/preference';

import { requestWebSearchJson, type WebSearchJsonRequester } from '../http/requestWebSearchJson';

jest.mock('../http/requestWebSearchJson', () => ({
  requestWebSearchJson: jest.fn(),
}));

const requestWebSearchJsonMock =
  requestWebSearchJson as jest.MockedFunction<WebSearchJsonRequester>;

describe('WebSearchService', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    requestWebSearchJsonMock.mockReset();
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('fetches with the fresh-install defaults and no provider keys', async () => {
    global.fetch = jest.fn().mockResolvedValue(exaPageResponse('https://example.com', 'Page body'));
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));

    const response = await service.fetchUrls({ urls: ['https://example.com'] });

    expect(response).toMatchObject({ providerId: 'exa-mcp', results: [{ content: 'Page body' }] });
    expect(requestWebSearchJsonMock).not.toHaveBeenCalled();
    const headers = jest.mocked(global.fetch).mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has('x-api-key')).toBe(false);
  });

  test('searches with fresh-install defaults without discarding hosted Highlights', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            content: [
              {
                type: 'text',
                text: 'Title: Example\nURL: https://example.com\nHighlights: Search content',
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));

    await expect(service.searchKeywords({ keywords: ['example'] })).resolves.toMatchObject({
      providerId: 'exa-mcp',
      results: [{ content: 'Search content', url: 'https://example.com' }],
    });
  });

  test('recovers existing Jina defaults through Exa inside the same fetch call', async () => {
    requestWebSearchJsonMock.mockRejectedValue(
      new HttpError('Jina timed out', { kind: 'timeout' }),
    );
    global.fetch = jest.fn().mockResolvedValue(exaPageResponse('https://example.com', 'Recovered'));
    const service = new WebSearchService(
      createPreferenceService({
        'chat.web_search.default_fetch_urls_provider': 'jina',
      }),
    );

    await expect(service.fetchUrls({ urls: ['https://example.com'] })).resolves.toMatchObject({
      providerId: 'exa-mcp',
      results: [{ content: 'Recovered' }],
    });
    expect(requestWebSearchJsonMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries only failed URLs on the backup and keeps the successful pages', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(exaPageResponse('https://example.com/a', 'First'))
      .mockRejectedValueOnce(new Error('unavailable'));
    requestWebSearchJsonMock.mockResolvedValue({
      data: { title: 'Second', content: 'Second', url: 'https://example.com/b' },
    });
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));

    const response = await service.fetchUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
    });

    expect(response.results.map((result) => result.content)).toEqual(['First', 'Second']);
    expect(response.providerIds).toEqual(['exa-mcp', 'jina']);
    expect(requestWebSearchJsonMock).toHaveBeenCalledTimes(1);
    expect(requestWebSearchJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://r.jina.ai/https://example.com/b' }),
    );
  });

  test('does not cycle providers when every fetch route fails', async () => {
    requestWebSearchJsonMock.mockRejectedValue(new Error('Jina unavailable'));
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));

    await expect(service.fetchUrls({ urls: ['https://example.com'] })).rejects.toMatchObject({
      errors: [expect.any(Error), expect.any(Error)],
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(requestWebSearchJsonMock).toHaveBeenCalledTimes(1);
  });

  test('does not start a backup request after the caller cancels', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error('interrupted');
    });
    const service = new WebSearchService(createPreferenceService(PreferenceDefaults));

    await expect(
      service.fetchUrls({ urls: ['https://example.com'] }, { signal: controller.signal }),
    ).rejects.toBeDefined();
    expect(requestWebSearchJsonMock).not.toHaveBeenCalled();
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

function exaPageResponse(url: string, content: string): Response {
  return new Response(
    JSON.stringify({
      result: { content: [{ type: 'text', text: `# Page\nURL: ${url}\n\n${content}` }] },
    }),
    { status: 200 },
  );
}

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
