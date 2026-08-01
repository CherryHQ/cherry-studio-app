import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import bochaResponse from '../../__tests__/fixtures/bocha-response.json';
import { BochaProvider } from '../BochaProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  excludeDomains: ['example.com'],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('BochaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('accepts nullable Bocha fields and normalizes content fallbacks from fixtures', async () => {
    const fetchMock = mockJsonResponse(bochaResponse);

    const provider = new BochaProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(fetchMock).toHaveBeenCalledWith('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: undefined,
    });
    // Decode before asserting: the request schema's `parse` rebuilds the object
    // in schema-shape order, so pinning the serialized string would pin a key
    // order the API does not care about.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      query: 'hello',
      count: 4,
      exclude: 'example.com',
      summary: true,
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer bocha-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    // The fixture is a verbatim Bocha payload: `msg` is null, and its four
    // results cover every branch of `summary || snippet || ''`.
    expect(result).toEqual({
      query: 'hello',
      providerId: 'bocha',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          // snippet only, summary null
          title: 'Bocha Title',
          content: 'Bocha Content',
          url: 'https://bocha.example/result',
          sourceInput: 'hello',
        },
        {
          // summary only, snippet null
          title: 'Bocha Summary Title',
          content: 'Bocha Summary Content',
          url: 'https://bocha.example/summary-result',
          sourceInput: 'hello',
        },
        {
          // both present, summary wins
          title: 'Bocha Preferred Summary Title',
          content: 'Bocha Preferred Summary Content',
          url: 'https://bocha.example/preferred-summary-result',
          sourceInput: 'hello',
        },
        {
          // both null, falls back to an empty string
          title: 'Bocha Empty Content Title',
          content: '',
          url: 'https://bocha.example/empty-content-result',
          sourceInput: 'hello',
        },
      ],
    });
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

function mockJsonResponse(payload: unknown): jest.Mock {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
  global.fetch = fetchMock;
  return fetchMock;
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
