import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import bochaResponse from '../../__tests__/fixtures/bocha-response.json';
import { BochaProvider } from '../BochaProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('BochaProvider', () => {
  test('accepts nullable Bocha fields and normalizes content fallbacks from fixtures', async () => {
    const requester = createMockJsonRequester(bochaResponse);

    const provider = new BochaProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        operation: 'search',
        providerId: 'bocha',
        signal: undefined,
        url: 'https://api.bochaai.com/v1/web-search',
      }),
    );
    expect(requester.mock.calls[0]?.[0].body).toEqual({
      query: 'hello',
      count: 4,
      summary: true,
    });
    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer bocha-key',
      'Content-Type': 'application/json',
    });
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
    const requester = createMockJsonRequester({
      code: 401,
      msg: 'invalid api key',
      data: { queryContext: { originalQuery: 'hello' }, webPages: { value: [] } },
    });

    const provider = new BochaProvider(createProvider(), new ApiKeyRotationState(), requester);

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Bocha search failed: invalid api key',
    );
  });
});

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
