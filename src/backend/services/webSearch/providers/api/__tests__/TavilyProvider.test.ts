import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import tavilyResponse from '../../__tests__/fixtures/tavily-response.json';
import { TavilyProvider } from '../TavilyProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('TavilyProvider', () => {
  test('posts a search request and maps the fixture response', async () => {
    const requester = createMockJsonRequester(tavilyResponse);

    const provider = new TavilyProvider(createProvider(), new ApiKeyRotationState(), requester);
    const response = await provider.searchKeywords('hello', runtimeConfig, {
      signal: AbortSignal.abort(),
    });

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        operation: 'search',
        providerId: 'tavily',
        signal: expect.any(AbortSignal),
        url: 'https://api.tavily.com/search',
      }),
    );
    expect(requester.mock.calls[0]?.[0].body).toEqual({
      query: 'hello',
      max_results: 4,
    });
    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer key-a',
      'Content-Type': 'application/json',
    });
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
