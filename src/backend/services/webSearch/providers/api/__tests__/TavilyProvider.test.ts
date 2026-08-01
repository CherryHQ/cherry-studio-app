import type { WebSearchProvider } from '@/shared/data/preference';

import { ApiKeyRotationState } from '../../../utils/provider';
import { TavilyProvider } from '../TavilyProvider';

describe('TavilyProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts search request and maps response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'latest',
          request_id: 'request-1',
          response_time: 0.1,
          results: [
            {
              title: 'Title',
              content: 'Content',
              url: 'https://example.com',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock;

    const provider = new TavilyProvider(createProvider(), new ApiKeyRotationState());
    const response = await provider.searchKeywords(
      'latest',
      {
        maxResults: 3,
        excludeDomains: [],
        compression: { method: 'none', cutoffLimit: 2000 },
      },
      { signal: AbortSignal.abort() },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://api.tavily.com/search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ query: 'latest', max_results: 3 }),
      signal: expect.any(AbortSignal),
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer key-a');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(response).toEqual({
      query: 'latest',
      providerId: 'tavily',
      capability: 'searchKeywords',
      inputs: ['latest'],
      results: [
        {
          title: 'Title',
          content: 'Content',
          url: 'https://example.com',
          sourceInput: 'latest',
        },
      ],
    });
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'tavily',
    name: 'Tavily',
    type: 'api',
    apiKeys: ['key-a'],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.tavily.com' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
