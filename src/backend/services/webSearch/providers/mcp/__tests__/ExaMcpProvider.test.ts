import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { ExaMcpProvider } from '../ExaMcpProvider';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 4,
  compression: { method: 'none', cutoffLimit: 2000 },
};

// The SSE body is a byte-for-byte copy of a real Exa MCP response, shared with
// desktop's fixture of the same name, so both ends pin the same wire shape.
const SSE_RESULT_FRAME = readFileSync(
  path.join(__dirname, '../../__tests__/fixtures/exa-mcp-response.txt'),
  'utf8',
);
const HIGHLIGHTS_RESULT_FRAME = readFileSync(
  path.join(__dirname, '../../__tests__/fixtures/exa-mcp-highlights-response.txt'),
  'utf8',
);
const FETCH_RESULT_FRAME = readFileSync(
  path.join(__dirname, '../../__tests__/fixtures/exa-mcp-fetch-response.txt'),
  'utf8',
);

describe('ExaMcpProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('posts a JSON-RPC tools/call and maps the SSE text payload', async () => {
    const fetchMock = mockTextResponse(SSE_RESULT_FRAME);

    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(fetchMock).toHaveBeenCalledWith('https://mcp.exa.ai/mcp', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    // Decode before asserting: the request schema's `parse` rebuilds the object
    // in schema-shape order, and pinning the serialized string would pin a key
    // order that neither JSON-RPC nor the server cares about.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: 'hello',
          type: 'auto',
          numResults: 4,
          livecrawl: 'fallback',
        },
      },
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('accept')).toBe('application/json, text/event-stream');
    expect(headers.get('content-type')).toBe('application/json');
    expect(result).toEqual({
      query: 'hello',
      providerId: 'exa-mcp',
      capability: 'searchKeywords',
      inputs: ['hello'],
      results: [
        {
          title: 'Exa MCP Title',
          content: 'Exa MCP Content',
          url: 'https://mcp.exa.ai/result',
          sourceInput: 'hello',
        },
      ],
    });
  });

  test('keeps the source text from the hosted service current Highlights response', async () => {
    mockTextResponse(HIGHLIGHTS_RESULT_FRAME);
    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

    const response = await provider.searchKeywords('React Native networking', runtimeConfig);

    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toMatchObject({
      url: 'https://reactnative.dev/docs/network',
      content: expect.stringContaining('Using Fetch'),
    });
    expect(response.results.every((result) => result.content.trim().length > 0)).toBe(true);
  });

  test('fetches page text through hosted Exa without a user API key', async () => {
    const fetchMock = mockTextResponse(FETCH_RESULT_FRAME);
    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

    const response = await provider.fetchUrls('https://example.com', runtimeConfig);

    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({
      method: 'tools/call',
      params: { name: 'web_fetch_exa', arguments: { urls: ['https://example.com'] } },
    });
    expect((request.headers as Headers).has('x-api-key')).toBe(false);
    expect(response).toMatchObject({
      providerId: 'exa-mcp',
      capability: 'fetchUrls',
      results: [
        {
          title: 'Example Domain',
          url: 'https://example.com',
          sourceInput: 'https://example.com',
          content: expect.stringContaining('This domain is for use in documentation examples'),
        },
      ],
    });
  });

  test('preserves paragraph breaks inside a search result', async () => {
    mockTextResponse(
      JSON.stringify({
        result: {
          content: [
            {
              type: 'text',
              text: 'Title: Article\nURL: https://example.com/article\nText: First paragraph.\n\nSecond paragraph.\n\nTitle: Another\nURL: https://example.com/another\nText: Another body.',
            },
          ],
        },
      }),
    );
    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

    const response = await provider.searchKeywords('articles', runtimeConfig);

    expect(response.results).toHaveLength(2);
    expect(response.results[0].content).toBe('First paragraph.\n\nSecond paragraph.');
  });

  test.each([
    { result: { isError: true, content: [{ type: 'text', text: 'Rate limit exceeded' }] } },
    { error: { code: -32603, message: 'Rate limit exceeded' } },
  ])('does not turn a remote tool error into empty successful search results', async (payload) => {
    mockTextResponse(`data: ${JSON.stringify(payload)}\n\n`);
    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('query', runtimeConfig)).rejects.toThrow(
      'Rate limit exceeded',
    );
  });

  test.each([
    { apiHost: '', code: 'api_host_missing' },
    { apiHost: 'not-a-url', code: 'api_host_invalid' },
  ])('rejects an unusable API host before fetching: $code', async ({ apiHost, code }) => {
    const fetchMock = mockTextResponse(SSE_RESULT_FRAME);

    const provider = new ExaMcpProvider(
      createProvider({ capabilities: [{ feature: 'searchKeywords', apiHost }] }),
      new ApiKeyRotationState(),
    );

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toMatchObject({
      name: 'WebSearchConfigError',
      code,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('preserves HTTP status and retry hints while sending an optional configured key', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response('Rate limit exceeded', { status: 429, headers: { 'retry-after': '60' } }),
      );
    const provider = new ExaMcpProvider(
      createProvider({ apiKeys: ['configured-key'] }),
      new ApiKeyRotationState(),
    );

    await expect(provider.fetchUrls('https://example.com', runtimeConfig)).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      retryAfter: '60',
    });
    const headers = jest.mocked(global.fetch).mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-api-key')).toBe('configured-key');
  });

  test('skips malformed SSE frames and keeps parsing later frames', async () => {
    mockTextResponse(['data: [DONE]', 'data: {"invalid": true}', SSE_RESULT_FRAME].join('\n'));

    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results).toEqual([
      {
        title: 'Exa MCP Title',
        content: 'Exa MCP Content',
        url: 'https://mcp.exa.ai/result',
        sourceInput: 'hello',
      },
    ]);
  });

  test('throws when a non-empty response contains no parseable payload', async () => {
    mockTextResponse('data: {"invalid": true}');

    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toMatchObject({
      message: 'Exa MCP response parsing failed: no parseable content found',
      kind: 'invalid_response',
      code: 'MCP_INVALID_RESPONSE',
    });
  });

  test.each(['', 'Invalid API key'])(
    'preserves HTTP rejection status in lookup diagnostics (%s)',
    async (body) => {
      global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 401 }));
      const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());

      await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toMatchObject({
        name: 'HttpError',
        kind: 'http',
        status: 401,
      });
    },
  );

  test('surfaces the internal timeout as a TimeoutError rather than an AbortError', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init?: RequestInit) => {
      const signal = init?.signal;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const provider = new ExaMcpProvider(createProvider(), new ApiKeyRotationState());
    const searchPromise = provider.searchKeywords('hello', runtimeConfig);
    const timeoutAssertion = expect(searchPromise).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Exa MCP search timed out after 25000ms',
    });

    await jest.advanceTimersByTimeAsync(25000);
    await timeoutAssertion;
  });
});

function mockTextResponse(body: string): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  global.fetch = fetchMock;
  return fetchMock;
}

function createProvider(overrides: Partial<WebSearchProvider> = {}): WebSearchProvider {
  return {
    id: 'exa-mcp',
    name: 'Exa MCP',
    type: 'mcp',
    apiKeys: [],
    capabilities: [
      { feature: 'searchKeywords', apiHost: 'https://mcp.exa.ai/mcp' },
      { feature: 'fetchUrls', apiHost: 'https://mcp.exa.ai/mcp' },
    ],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
    ...overrides,
  };
}
