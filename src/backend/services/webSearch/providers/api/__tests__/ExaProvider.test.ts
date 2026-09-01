import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import exaResponseFixture from '../../__tests__/fixtures/exa-response.json';
import { ExaProvider } from '../ExaProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('ExaProvider', () => {
  test('posts the fixture request and maps the fixture response', async () => {
    const requester = createMockJsonRequester(exaResponseFixture);

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    const request = requester.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        operation: 'search',
        providerId: 'exa',
        url: 'https://api.exa.ai/search',
      }),
    );
    expect(request?.body).toEqual({
      query: 'hello',
      numResults: 4,
      contents: { text: true },
    });
    expect(request?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'exa-key',
    });

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
    const requester = createMockJsonRequester({
      autopromptString: 'refined query',
      results: [{ title: null, text: 'Exa Content', url: 'https://exa.example/result' }],
    });

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState(), requester);
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
    const requester = createMockJsonRequester({ autopromptString: 'refined query' });

    const provider = new ExaProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });
});

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
