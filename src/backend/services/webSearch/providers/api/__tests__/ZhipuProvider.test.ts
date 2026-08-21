import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import zhipuResponseFixture from '../../__tests__/fixtures/zhipu-response.json';
import { ZhipuProvider } from '../ZhipuProvider';

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 2,
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('ZhipuProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('posts a search request and maps the fixture response', async () => {
    const fetchMock = mockJsonResponse(zhipuResponseFixture);

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(fetchMock).toHaveBeenCalledWith('https://open.bigmodel.cn/api/paas/v4/web_search', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: undefined,
    });
    // The body is round-tripped through `ZhipuWebSearchRequestSchema.parse`, so
    // compare the decoded object rather than the serialized key order.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      search_query: 'hello',
      search_engine: 'search_std',
      search_intent: false,
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer zhipu-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-App-Name')).toBe('CherryStudioMobile');
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
    mockJsonResponse({ request_id: 'req-1' });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([]);
  });

  test('trims result fields and falls back to empty strings', async () => {
    mockJsonResponse({
      search_result: [{ title: '  Padded Title  ', content: '  Padded Content  ' }],
    });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      { title: 'Padded Title', content: 'Padded Content', url: '', sourceInput: 'hello' },
    ]);
  });

  test('caps the mapped results at maxResults', async () => {
    mockJsonResponse({
      search_result: [
        { title: 'First', content: 'One', link: 'https://zhipu.example/1' },
        { title: 'Second', content: 'Two', link: 'https://zhipu.example/2' },
        { title: 'Third', content: 'Three', link: 'https://zhipu.example/3' },
      ],
    });

    const provider = new ZhipuProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.title)).toEqual(['First', 'Second']);
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
