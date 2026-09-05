import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import zhipuResponseFixture from '../../__tests__/fixtures/zhipu-response.json';
import { ZhipuProvider } from '../ZhipuProvider';
import { createMockJsonRequester } from './_webSearchJsonRequesterMocks';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 2,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('ZhipuProvider', () => {
  test('posts a search request and maps the fixture response', async () => {
    const requester = createMockJsonRequester(zhipuResponseFixture);

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        operation: 'search',
        providerId: 'zhipu',
        signal: undefined,
        url: 'https://open.bigmodel.cn/api/paas/v4/web_search',
      }),
    );
    expect(requester.mock.calls[0]?.[0].body).toEqual({
      search_query: 'hello',
      search_engine: 'search_std',
      search_intent: false,
    });
    expect(requester.mock.calls[0]?.[0].headers).toEqual({
      Authorization: 'Bearer zhipu-key',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual({
      query: 'hello',
      providerId: 'zhipu',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Zhipu Title',
          content: 'Zhipu Content',
          url: 'https://zhipu.example/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('tolerates a payload without search_result', async () => {
    const requester = createMockJsonRequester({ request_id: 'req-1' });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });

  test('trims result fields and falls back to empty strings', async () => {
    const requester = createMockJsonRequester({
      search_result: [{ title: '  Padded Title  ', content: '  Padded Content  ' }],
    });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      { title: 'Padded Title', content: 'Padded Content', url: '', sourceInput: 'hello' },
    ]);
  });

  test('caps the mapped results at maxResults', async () => {
    const requester = createMockJsonRequester({
      search_result: [
        { title: 'First', content: 'One', link: 'https://zhipu.example/1' },
        { title: 'Second', content: 'Two', link: 'https://zhipu.example/2' },
        { title: 'Third', content: 'Three', link: 'https://zhipu.example/3' },
      ],
    });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState(), requester);
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.title)).toEqual(['First', 'Second']);
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'zhipu',
    name: 'Zhipu',
    type: 'api',
    apiKeys: ['zhipu-key'],
    capabilities: [
      { feature: 'searchKeywords', apiHost: 'https://open.bigmodel.cn/api/paas/v4/web_search' },
    ],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
