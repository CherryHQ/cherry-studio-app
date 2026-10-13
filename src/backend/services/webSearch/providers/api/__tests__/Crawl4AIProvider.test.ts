import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { Crawl4AIProvider } from '../Crawl4AIProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 2,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('Crawl4AIProvider', () => {
  test('asks the instance for fit markdown without credentials when no token is set', async () => {
    const requester = createMockJsonRequester({
      url: 'https://example.com/final',
      markdown: ' # Page ',
      success: true,
    });

    const provider = new Crawl4AIProvider(createProvider([]), new ApiKeyRotationState(), requester);
    const response = await provider.fetchUrls(' https://example.com/start ', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { url: 'https://example.com/start', f: 'fit' },
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        url: 'http://192.168.1.20:11235/md',
      }),
    );
    expect(response).toEqual({
      query: 'https://example.com/start',
      providerId: 'crawl4ai',
      capability: 'fetchUrls',
      inputs: ['https://example.com/start'],
      results: [
        {
          title: 'https://example.com/final',
          content: '# Page',
          url: 'https://example.com/final',
          sourceInput: 'https://example.com/start',
        },
      ],
    });
  });

  test('sends a configured token as a bearer credential', async () => {
    const requester = createMockJsonRequester({ url: '', markdown: 'body', success: true });

    const provider = new Crawl4AIProvider(
      createProvider(['token']),
      new ApiKeyRotationState(),
      requester,
    );
    await provider.fetchUrls('https://example.com', runtimeConfig);

    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    });
  });

  test.each([
    [{ url: '', markdown: 'body', success: false }, 'Crawl4AI fetch failed for'],
    [{ url: '', markdown: '  ', success: true }, 'Crawl4AI fetch returned empty content for'],
  ])('fails a page the instance could not read', async (payload, message) => {
    const provider = new Crawl4AIProvider(
      createProvider([]),
      new ApiKeyRotationState(),
      createMockJsonRequester(payload),
    );

    await expect(provider.fetchUrls('https://example.com', runtimeConfig)).rejects.toThrow(
      `${message} https://example.com`,
    );
  });
});

function createProvider(apiKeys: string[]): WebSearchProvider {
  return {
    id: 'crawl4ai',
    name: 'Crawl4AI',
    type: 'api',
    apiKeys,
    capabilities: [
      {
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'http://192.168.1.20:11235/',
      },
    ],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
