import { HttpError } from '@/backend/services/http';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../../runtime';
import { createWebTools } from '../webTools';

const RESPONSE = {
  query: 'cherry studio',
  results: [{ content: 'Body', title: 'Cherry Studio', url: 'https://example.com/a' }],
};

describe('createWebTools', () => {
  test('returns citable results the renderer and the model both read', async () => {
    const webSearch = createWebSearch({ searchKeywords: async () => RESPONSE });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(webSearch.searchKeywords).toHaveBeenCalledWith(
      { keywords: ['cherry studio'] },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.value).toEqual([
      {
        id: expect.any(String),
        title: 'Cherry Studio',
        url: 'https://example.com/a',
        content: 'Body',
      },
    ]);
    expect(result.artifacts).toEqual([]);
  });

  test('tells the model not to retry when no provider is configured', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new WebSearchConfigError('provider_not_configured', 'No provider');
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(result.value).toMatchObject({ status: 'error', retryable: false });
    expect(String((result.value as { message: string }).message)).toContain('do not retry');
  });

  test('keeps an unclassified failure recoverable with different input', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new Error('The requested page could not be read');
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(result.value).toMatchObject({ status: 'error', retryable: true });
  });

  test('preserves exhausted provider reasons and pauses this tool for the turn', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async () => {
        throw new AggregateError(
          [
            new HttpError('Exa: HTTP 429 rate limit exceeded', { kind: 'http', status: 429 }),
            new HttpError('Jina reader timed out', { kind: 'timeout' }),
          ],
          'Web fetch failed after trying available providers.',
        );
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['https://example.com'],
    });

    expect(result).toMatchObject({
      failure: { scope: 'tool', error: { code: 'web_lookup_unavailable', retryable: false } },
      value: {
        status: 'error',
        retryable: false,
        error: expect.stringContaining('Jina reader timed out'),
      },
    });
    expect(result.failure?.error.message).toContain('HTTP 429');
    expect((result.value as { message: string }).message).toContain('do not retry');
  });

  test('stops network-failed lookups for this turn and explains the connection problem', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async () => {
        throw new AggregateError(
          [
            new HttpError('Jina: Network request failed', { kind: 'network' }),
            new TypeError('Exa: fetch failed'),
          ],
          'Web fetch failed after trying available providers.',
        );
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['https://example.com'],
    });

    expect(result.failure).toMatchObject({ scope: 'tool', error: { retryable: false } });
    expect(result.value).toMatchObject({
      error: expect.stringContaining('Jina: Network request failed'),
      message: expect.stringContaining('check their network connection'),
    });
    expect((result.value as { message: string }).message).toContain('do not retry automatically');
  });

  test('pauses a broken provider protocol instead of asking for a different query', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new AggregateError(
          [
            new HttpError('Exa MCP returned invalid JSON', {
              kind: 'invalid_response',
              code: 'MCP_INVALID_RESPONSE',
            }),
          ],
          'Web search failed',
        );
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(result.failure).toMatchObject({ scope: 'tool', error: { retryable: false } });
  });

  test('keeps other URLs available when the target page cannot be read', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async () => {
        throw new AggregateError(
          [
            new HttpError('Page not found', { kind: 'http', status: 404 }),
            new HttpError('Target page denied access', { kind: 'http', status: 403 }),
          ],
          'Web fetch failed after trying available providers.',
        );
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['https://example.com/missing'],
    });

    expect(result.failure).toMatchObject({
      scope: 'call',
      error: { message: expect.stringContaining('Page not found') },
    });
  });

  test('propagates cancellation without manufacturing a provider failure', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Cancelled', 'AbortError');
    const webSearch = createWebSearch({
      fetchUrls: async () => {
        controller.abort();
        throw abort;
      },
    });

    await expect(
      toolNamed(webSearch, 'web_fetch').execute({
        input: { urls: ['https://example.com'] },
        signal: controller.signal,
        toolCallId: 'cancelled',
      }),
    ).rejects.toBe(abort);
  });

  test('rejects a query the model can rewrite instead of calling the provider', async () => {
    const webSearch = createWebSearch({});

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'a' });

    expect(webSearch.searchKeywords).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ status: 'error', retryable: true });
  });

  test('fetches known page URLs', async () => {
    const webSearch = createWebSearch({ fetchUrls: async () => RESPONSE });

    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['https://example.com/a'],
    });

    expect(webSearch.fetchUrls).toHaveBeenCalledWith(
      { urls: ['https://example.com/a'] },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.value).toHaveLength(1);
  });

  test('rejects a non-http target before any request', async () => {
    const webSearch = createWebSearch({});

    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['file:///etc/passwd'],
    });

    expect(webSearch.fetchUrls).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ status: 'error' });
  });

  test('passes the truncated content and marker to the model and persisted tool output', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async () => ({
        ...RESPONSE,
        results: [{ ...RESPONSE.results[0], content: 'Article prefix', truncated: true }],
      }),
    });
    const result = await execute(toolNamed(webSearch, 'web_fetch'), {
      urls: ['https://example.com/a'],
    });

    expect(result.value).toEqual([
      {
        id: expect.any(String),
        title: 'Cherry Studio',
        url: 'https://example.com/a',
        content: 'Article prefix',
        truncated: true,
      },
    ]);
  });

  test('describes both tools with stable built-in refs', () => {
    const tools = createWebTools({ webSearch: createWebSearch({}) });

    expect(tools.map((tool) => tool.ref)).toEqual([
      { source: 'builtin', capabilityId: 'web_search' },
      { source: 'builtin', capabilityId: 'web_fetch' },
    ]);
  });
});

function createWebSearch(overrides: {
  fetchUrls?: () => Promise<typeof RESPONSE>;
  searchKeywords?: () => Promise<typeof RESPONSE>;
}) {
  return {
    fetchUrls: jest.fn(overrides.fetchUrls ?? (async () => RESPONSE)),
    searchKeywords: jest.fn(overrides.searchKeywords ?? (async () => RESPONSE)),
  } as never as Parameters<typeof createWebTools>[0]['webSearch'] & {
    fetchUrls: jest.Mock;
    searchKeywords: jest.Mock;
  };
}

function toolNamed(
  webSearch: Parameters<typeof createWebTools>[0]['webSearch'],
  name: string,
): RuntimeTool {
  const tool = createWebTools({ webSearch }).find((candidate) => candidate.providerName === name);
  if (!tool) {
    throw new Error(`Missing tool: ${name}`);
  }
  return tool;
}

function execute(tool: RuntimeTool, input: RuntimeJsonValue): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}
