import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import firecrawlResponse from '../../__tests__/fixtures/firecrawl-response.json';
import { FirecrawlProvider } from '../FirecrawlProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('FirecrawlProvider', () => {
  test('posts a search request and maps scraped markdown', async () => {
    const requester = createMockJsonRequester(firecrawlResponse);

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        operation: 'search',
        providerId: 'firecrawl',
        signal: undefined,
        url: 'https://api.firecrawl.example/v2/search',
      }),
    );
    expect(requester.mock.calls[0]?.[0].body).toEqual({
      query: 'hello',
      limit: 4,
      scrapeOptions: { formats: ['markdown'] },
    });
    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer firecrawl-key',
      'Content-Type': 'application/json',
    });
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
    const requester = createMockJsonRequester({ success: true, data: { web: [] } });

    const provider = new FirecrawlProvider(
      createProvider({ apiKeys: [] }),
      new ApiKeyRotationState(),
      requester,
    );
    await provider.searchKeywords('hello', runtimeConfig);

    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  test('scrapes a URL and maps the markdown response', async () => {
    const requester = createMockJsonRequester({
      success: true,
      data: {
        markdown: 'Scraped page',
        metadata: { title: ['Page title'], sourceURL: 'https://example.com/final' },
      },
    });
    const provider = new FirecrawlProvider(
      createProvider({
        capabilities: [
          { feature: 'searchKeywords', apiHost: 'https://api.firecrawl.example' },
          { feature: 'fetchUrls', apiHost: 'https://api.firecrawl.example' },
        ],
      }),
      new ApiKeyRotationState(),
      requester,
    );

    const result = await provider.fetchUrls('https://example.com', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { url: 'https://example.com', formats: ['markdown'] },
        method: 'POST',
        operation: 'scrape',
        providerId: 'firecrawl',
        signal: undefined,
        url: 'https://api.firecrawl.example/v2/scrape',
      }),
    );
    expect(result).toEqual({
      query: 'https://example.com',
      providerId: 'firecrawl',
      capability: 'fetchUrls',
      inputs: ['https://example.com'],
      results: [
        {
          title: 'Page title',
          content: 'Scraped page',
          url: 'https://example.com/final',
          sourceInput: 'https://example.com',
        },
      ],
    });
  });

  test('throws when the payload reports success: false', async () => {
    const requester = createMockJsonRequester({ success: false, error: 'Rate limit exceeded' });

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState(), requester);

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Firecrawl search failed: Rate limit exceeded',
    );
  });

  test('falls back to description, then to an empty string', async () => {
    const requester = createMockJsonRequester({
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

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.content)).toEqual(['Fallback Description', '']);
  });

  test('tolerates a payload without a data object', async () => {
    const requester = createMockJsonRequester({ success: true });

    const provider = new FirecrawlProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });
});

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
