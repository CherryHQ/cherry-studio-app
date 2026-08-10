import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '@/backend/services/webSearch/utils/provider';

import { JinaProvider } from '../JinaProvider';

const config: WebSearchExecutionConfig = {
  compression: { cutoffLimit: 2000, method: 'none' },
  excludeDomains: [],
  maxResults: 5,
};

describe('JinaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

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
      const fetchMock = jest.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(JSON.stringify(response), { status: 200 }),
      );
      global.fetch = fetchMock;

      await expect(invoke(createProvider([]))).resolves.toBeDefined();

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
      expect(headers.has('Authorization')).toBe(false);
    },
  );

  test('uses a configured API key when available', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    global.fetch = fetchMock;

    await createProvider(['jina-key']).searchKeywords('Cherry Studio', config);

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jina-key');
  });
});

function createProvider(apiKeys: string[]) {
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

  return new JinaProvider(provider, new ApiKeyRotationState());
}
