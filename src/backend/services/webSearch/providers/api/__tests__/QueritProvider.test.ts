import { HttpError } from '@/backend/services/http';
import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import queritResponse from '../../__tests__/fixtures/querit-response.json';
import { QueritProvider } from '../QueritProvider';
import {
  createMockJsonRequester,
  createRejectedJsonRequester,
} from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('QueritProvider', () => {
  test('posts the search request and maps the fixture response', async () => {
    const requester = createMockJsonRequester(queritResponse);

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { query: 'hello', count: 4 },
        method: 'POST',
        operation: 'search',
        providerId: 'querit',
        signal: undefined,
        url: 'https://api.querit.ai/v1/search',
      }),
    );
    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer querit-key',
      'Content-Type': 'application/json',
    });

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
    const requester = createMockJsonRequester({
      error_code: 401,
      error_msg: 'invalid api key',
      query_context: { query: 'hello' },
      results: { result: [] },
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState(), requester);

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Querit search failed: invalid api key',
    );
  });

  test('defaults to an empty result list when the payload omits results.result', async () => {
    const requester = createMockJsonRequester({
      error_code: 200,
      error_msg: '',
      query_context: { query: 'hello' },
      results: {},
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });

  test('falls back to empty content when a result has no snippet', async () => {
    const requester = createMockJsonRequester({
      error_code: 200,
      error_msg: '',
      query_context: { query: 'hello' },
      results: {
        result: [{ title: 'No Snippet', url: 'https://querit.example/no-snippet' }],
      },
    });

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState(), requester);
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
    const requester = createRejectedJsonRequester(
      new HttpError('HTTP request failed with status 503.', { kind: 'http', status: 503 }),
    );

    const provider = new QueritProvider(createProvider(), new ApiKeyRotationState(), requester);

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'HTTP request failed with status 503.',
    );
  });
});

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
