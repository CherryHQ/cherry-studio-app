import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import exaResponseFixture from '../../__tests__/fixtures/exa-response.json';
import { ExaProvider } from '../ExaProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  excludeDomains: [],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('ExaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts the fixture request and maps the fixture response', async () => {
    const fetchMock = mockJsonResponse(exaResponseFixture);

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe('https://api.exa.ai/search');
    expect(requestInit.method).toBe('POST');
    // `ExaSearchRequestSchema.parse` rebuilds the body in schema-shape order, so
    // decode before comparing: key order on the wire is not a contract.
    expect(JSON.parse(requestInit.body)).toEqual({
      query: 'hello',
      numResults: 4,
      contents: { text: true },
    });

    const headers = requestInit.headers as Headers;
    expect(headers.get('x-api-key')).toBe('exa-key');
    expect(headers.get('Content-Type')).toBe('application/json');

    expect(result).toEqual({
      query: 'hello',
      providerId: 'exa',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Exa Title',
          content: 'Exa Content',
          url: 'https://exa.example/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('normalizes a null title to an empty string', async () => {
    mockJsonResponse({
      autopromptString: 'refined query',
      results: [{ title: null, text: 'Exa Content', url: 'https://exa.example/result' }],
    });

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      {
        title: '',
        content: 'Exa Content',
        url: 'https://exa.example/result',
        sourceInput: 'hello',
      },
    ]);
  });

  test('defaults a missing results array to no results', async () => {
    mockJsonResponse({ autopromptString: 'refined query' });

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
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
    id: 'exa',
    name: 'Exa',
    type: 'api',
    apiKeys: ['exa-key'],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.exa.ai' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
