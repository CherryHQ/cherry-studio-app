import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import firecrawlResponse from '../../__tests__/fixtures/firecrawl-response.json';
import { FirecrawlProvider } from '../FirecrawlProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  excludeDomains: [],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('FirecrawlProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts a search request and maps scraped markdown', async () => {
    const fetchMock = mockJsonResponse(firecrawlResponse);

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(fetchMock).toHaveBeenCalledWith('https://api.firecrawl.example/v2/search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: undefined,
    });
    // Decode before asserting: the request schema's `parse` rebuilds the object
    // in schema-shape order, and pinning the serialized string would pin a key
    // order the API does not care about.
    expect(readRequestBody(fetchMock)).toEqual({
      query: 'hello',
      limit: 4,
      scrapeOptions: { formats: ['markdown'] },
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer firecrawl-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(result).toEqual({
      query: 'hello',
      providerId: 'firecrawl',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Firecrawl Title',
          content: 'Scraped Markdown Content',
          url: 'https://firecrawl.example/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('omits the Authorization header so an unset key uses the free quota', async () => {
    const fetchMock = mockJsonResponse({ success: true, data: { web: [] } });

    const provider = new FirecrawlProvider(
      createProvider({ apiKeys: [] }),
      new ApiKeyRotationState(),
    );
    await provider.searchKeywords('hello', runtimeConfig);

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  test('throws when the payload reports success: false', async () => {
    mockJsonResponse({ success: false, error: 'Rate limit exceeded' });

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Firecrawl search failed: Rate limit exceeded',
    );
  });

  test('falls back to description, then to an empty string', async () => {
    mockJsonResponse({
      success: true,
      data: {
        web: [
          {
            title: 'Result with description',
            url: 'https://example.com/desc',
            description: 'Fallback Description',
          },
          { title: 'Result with nothing', url: 'https://example.com/nothing' },
        ],
      },
    });

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.content)).toEqual(['Fallback Description', '']);
  });

  test('tolerates a payload without a data object', async () => {
    mockJsonResponse({ success: true });

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });
});

function mockJsonResponse(payload: unknown): jest.Mock {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
  global.fetch = fetchMock;
  return fetchMock;
}

function readRequestBody(fetchMock: jest.Mock): unknown {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

function createProvider(overrides: Partial<WebSearchProvider> = {}): WebSearchProvider {
  return {
    id: 'firecrawl',
    name: 'Firecrawl',
    type: 'api',
    apiKeys: ['firecrawl-key'],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.firecrawl.example' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
    ...overrides,
  };
}
