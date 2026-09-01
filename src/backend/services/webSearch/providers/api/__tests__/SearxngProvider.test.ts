import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import searxngSearchResponse from '../../__tests__/fixtures/searxng-search-response.json';
import { SearxngProvider } from '../SearxngProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 5,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('SearxngProvider', () => {
  // The fixture is shared with desktop, but the expected result below is not:
  // desktop re-fetches every result URL and replaces the engine's title/content
  // with text extracted from the page, so the same bytes normalize to
  // "Resolved Page Title" there. Mobile keeps what the engine returned. Do not
  // "fix" this to match desktop's snapshot on sync -- the fixture pins the wire
  // shape, not the normalized output.
  test('issues the search request and maps the fixture response', async () => {
    const requester = createMockJsonRequester(searxngSearchResponse);

    const provider = new SearxngProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
        method: 'GET',
        operation: 'search',
        providerId: 'searxng',
        signal: undefined,
        url: 'http://localhost:8080/search?q=hello&language=auto&format=json',
      }),
    );
    expect(result).toEqual({
      query: 'hello',
      providerId: 'searxng',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Searxng Title',
          content: 'Searxng Content',
          url: 'https://searx.example/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('keeps only http(s) result URLs', async () => {
    const requester = createMockJsonRequester({
      query: 'hello',
      results: [
        { title: 'Https', content: 'A', url: 'https://example.com/a' },
        { title: 'Http', content: 'B', url: 'http://example.com/b' },
        { title: 'Javascript', content: 'C', url: 'javascript:alert(1)' },
        { title: 'File', content: 'D', url: 'file:///etc/passwd' },
        { title: 'Relative', content: 'E', url: '/relative/path' },
        { title: 'Blank', content: 'F', url: '   ' },
        { title: 'Missing', content: 'G' },
      ],
    });

    const provider = new SearxngProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.url)).toEqual([
      'https://example.com/a',
      'http://example.com/b',
    ]);
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'searxng',
    name: 'Searxng',
    type: 'api',
    apiKeys: [],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'http://localhost:8080' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
