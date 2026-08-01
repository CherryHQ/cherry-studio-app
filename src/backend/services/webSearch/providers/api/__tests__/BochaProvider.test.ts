import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { BochaProvider } from '../BochaProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 5,
  excludeDomains: [],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('BochaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('accepts a null msg on a successful response', async () => {
    mockJsonResponse({
      code: 200,
      msg: null,
      data: {
        queryContext: { originalQuery: 'hello' },
        webPages: {
          value: [
            {
              name: 'Bocha Title',
              summary: 'Bocha Summary',
              url: 'https://bocha.example/result',
            },
          ],
        },
      },
    });

    const provider = new BochaProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      {
        title: 'Bocha Title',
        content: 'Bocha Summary',
        url: 'https://bocha.example/result',
        sourceInput: 'hello',
      },
    ]);
  });

  test('surfaces the error message on a non-200 payload code', async () => {
    mockJsonResponse({
      code: 401,
      msg: 'invalid api key',
      data: { queryContext: { originalQuery: 'hello' }, webPages: { value: [] } },
    });

    const provider = new BochaProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Bocha search failed: invalid api key',
    );
  });
});

function mockJsonResponse(payload: unknown): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
}

function createProvider(): WebSearchProvider {
  return {
    id: 'bocha',
    name: 'Bocha',
    type: 'api',
    apiKeys: ['bocha-key'],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.bochaai.com' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
