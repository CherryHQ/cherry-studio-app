import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { SerplyProvider } from '../SerplyProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 2,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('SerplyProvider', () => {
  test('encodes the query into the request path and maps link and description', async () => {
    const requester = createMockJsonRequester({
      results: [
        { title: ' A ', description: ' about a ', link: 'https://a.example' },
        { title: null, description: null, link: 'https://b.example' },
        { title: 'Beyond the limit', description: 'dropped', link: 'https://c.example' },
      ],
    });

    const provider = new SerplyProvider(createProvider(), new ApiKeyRotationState(), requester);
    const response = await provider.searchKeywords('what & why?', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Accept: 'application/json', 'X-Api-Key': 'serply-key' },
        method: 'GET',
        url: 'https://api.serply.io/v1/search/q=what%20%26%20why%3F&num=2',
      }),
    );
    expect(response.results).toEqual([
      { title: 'A', content: 'about a', url: 'https://a.example', sourceInput: 'what & why?' },
      { title: '', content: '', url: 'https://b.example', sourceInput: 'what & why?' },
    ]);
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'serply',
    name: 'Serply',
    type: 'api',
    apiKeys: ['serply-key'],
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.serply.io',
      },
    ],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
