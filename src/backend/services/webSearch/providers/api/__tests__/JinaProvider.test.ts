import { ApiKeyRotationState } from '@/backend/services/webSearch/utils/provider';
import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { JinaProvider } from '../JinaProvider';
import {
  createMockJsonRequester,
  type MockWebSearchJsonRequester,
} from './_webSearchJsonRequesterMocks';

const config: WebSearchExecutionConfig = {
  compression: { cutoffLimit: 2000, method: 'none' },
  maxResults: 5,
};

describe('JinaProvider', () => {
  test.each([
    {
      invoke: (provider: JinaProvider) => provider.searchKeywords('Cherry Studio', config),
      response: { data: [] },
    },
    {
      invoke: (provider: JinaProvider) => provider.fetchUrls('https://example.com', config),
      response: { data: { content: 'Example content', title: 'Example' } },
    },
  ])(
    'allows anonymous Jina requests without an Authorization header',
    async ({ invoke, response }) => {
      const requester = createMockJsonRequester(response);

      await expect(invoke(createProvider([], requester))).resolves.toBeDefined();

      expect(requester.mock.calls[0]?.[0].headers).not.toHaveProperty('Authorization');
    },
  );

  test('uses a configured API key when available', async () => {
    const requester = createMockJsonRequester({ data: [] });

    await createProvider(['jina-key'], requester).searchKeywords('Cherry Studio', config);

    expect(requester.mock.calls[0]?.[0].headers).toHaveProperty('Authorization', 'Bearer jina-key');
  });
});

function createProvider(apiKeys: string[], requester: MockWebSearchJsonRequester) {
  const provider: WebSearchProvider = {
    apiKeys,
    basicAuthPassword: '',
    basicAuthUsername: '',
    capabilities: [
      { apiHost: 'https://s.jina.ai', feature: 'searchKeywords' },
      { apiHost: 'https://r.jina.ai', feature: 'fetchUrls' },
    ],
    engines: [],
    id: 'jina',
    name: 'Jina',
    type: 'api',
  };

  return new JinaProvider(provider, new ApiKeyRotationState(), requester);
}
