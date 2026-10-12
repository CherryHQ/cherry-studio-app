import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { ParallelProvider } from '../ParallelProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 2,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('ParallelProvider', () => {
  test('sends the query as objective and search query, and joins excerpts into content', async () => {
    const requester = createMockJsonRequester({
      search_id: 'search-1',
      session_id: 'session-1',
      results: [
        { url: 'https://a.example', title: ' A ', excerpts: [' first ', '', 'second'] },
        { url: 'https://b.example', title: null, excerpts: [] },
        { url: 'https://c.example', title: 'Beyond the limit', excerpts: ['dropped'] },
      ],
    });

    const provider = new ParallelProvider(createProvider(), new ApiKeyRotationState(), requester);
    const response = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          objective: 'hello',
          search_queries: ['hello'],
          advanced_settings: { max_results: 2 },
        },
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'parallel-key' },
        method: 'POST',
        url: 'https://api.parallel.ai/v1/search',
      }),
    );
    expect(response.results).toEqual([
      { title: 'A', content: 'first\n\nsecond', url: 'https://a.example', sourceInput: 'hello' },
      { title: '', content: '', url: 'https://b.example', sourceInput: 'hello' },
    ]);
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'parallel',
    name: 'Parallel',
    type: 'api',
    apiKeys: ['parallel-key'],
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.parallel.ai',
      },
    ],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
