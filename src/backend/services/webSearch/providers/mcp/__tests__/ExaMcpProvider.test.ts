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

    await expect(provider.searchKeywords('hello', runtimeConfig)).rejects.toThrow(
      'Exa MCP response parsing failed: no parseable content found',
    );
  });

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
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://mcp.exa.ai/mcp' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
    ...overrides,
  };
}
