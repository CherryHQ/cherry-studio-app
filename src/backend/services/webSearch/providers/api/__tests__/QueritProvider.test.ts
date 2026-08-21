import type { WebSearchProvider } from '@/shared/data/preference';
import type { WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import queritResponse from '../../__tests__/fixtures/querit-response.json';
import { QueritProvider } from '../QueritProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('QueritProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts the search request and maps the fixture response', async () => {
    const fetchMock = mockJsonResponse(queritResponse);

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(fetchMock).toHaveBeenCalledWith('https://api.querit.ai/v1/search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: undefined,
    });
    expect(readRequestBody(fetchMock)).toEqual({ query: 'hello', count: 4 });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer querit-key');
    expect(headers.get('Content-Type')).toBe('application/json');

    expect(result).toEqual({
      query: 'hello',
      providerId: 'querit',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Querit Title',
          content: 'Querit Content',
          url: 'https://querit.example/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('surfaces the payload error message when error_code is not 200', async () => {
    mockJsonResponse({
      error_code: 401,
      error_msg: 'invalid api key',
      query_context: { query: 'hello' },
      results: { result: [] },
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Querit search failed: invalid api key',
    );
  });

  test('defaults to an empty result list when the payload omits results.result', async () => {
    mockJsonResponse({
      error_code: 200,
      error_msg: '',
      query_context: { query: 'hello' },
      results: {},
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });

  test('falls back to empty content when a result has no snippet', async () => {
    mockJsonResponse({
      error_code: 200,
      error_msg: '',
      query_context: { query: 'hello' },
      results: {
        result: [{ title: 'No Snippet', url: 'https://querit.example/no-snippet' }],
      },
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      {
        title: 'No Snippet',
        content: '',
        url: 'https://querit.example/no-snippet',
        sourceInput: 'hello',
      },
    ]);
  });

  test('raises an HTTP error before parsing when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('upstream is down', { status: 503 }));

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Querit search failed: HTTP 503 upstream is down',
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

function readRequestBody(fetchMock: jest.Mock): unknown {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

function createProvider(): WebSearchProvider {
  return {
    id: 'querit',
    name: 'Querit',
    type: 'api',
    apiKeys: ['querit-key'],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.querit.ai' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
