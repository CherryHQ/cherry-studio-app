import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import tavilyResponse from '../../__tests__/fixtures/tavily-response.json';
import { TavilyProvider } from '../TavilyProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  excludeDomains: [],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('TavilyProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts a search request and maps the fixture response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(tavilyResponse), { status: 200 }));
    global.fetch = fetchMock;

    const provider = new TavilyProvider(createProvider(), new ApiKeyRotationState());
    const response = await provider.searchKeywords('hello', runtimeConfig, {
      signal: AbortSignal.abort(),
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.tavily.com/search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    // Decode before asserting: the request schema's `parse` rebuilds the object
    // in schema-shape order, so pinning the serialized string would pin a key
    // order the API does not care about.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      query: 'hello',
      max_results: 4,
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer key-a');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(response).toEqual({
      query: 'hello',
      providerId: 'tavily',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Tavily Title',
          content: 'Tavily Content',
          url: 'https://tavily.example/result',
          sourceInput: 'hello',
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
