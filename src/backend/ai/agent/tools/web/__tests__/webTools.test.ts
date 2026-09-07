import { HttpError } from '@/backend/services/http';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';
import type { WebSearchFetchUrlsRequest } from '@/shared/data/types/webSearch';

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

  test('keeps a provider hiccup retryable', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new Error('socket hang up');
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(result.value).toMatchObject({ status: 'error', retryable: true });
  });

  test('reuses concurrent and completed searches, including their citation ids', async () => {
    const webSearch = createWebSearch({});
    const tool = toolNamed(webSearch, 'web_search');
    const [first, concurrent] = await Promise.all([
      execute(tool, { query: 'cherry  studio' }),
      execute(tool, { query: ' cherry studio ' }),
    ]);
    const repeated = await execute(tool, { query: 'cherry studio' });

    expect(webSearch.searchKeywords).toHaveBeenCalledTimes(1);
    expect(concurrent).toEqual(first);
    expect(repeated).toEqual(first);
  });

  test('allows a different query and starts fresh in the next turn', async () => {
    const webSearch = createWebSearch({});
    const tool = toolNamed(webSearch, 'web_search');
    await execute(tool, { query: 'cherry studio' });
    await execute(tool, { query: 'cherry studio release date' });
    await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(webSearch.searchKeywords).toHaveBeenCalledTimes(3);
  });

  test.each([400, 401, 403, 404, 422, 429])(
    'does not retry a lookup rejected with HTTP %i',
    async (status) => {
      const webSearch = createWebSearch({
        searchKeywords: async () => {
          throw new HttpError('Provider rejected request', { kind: 'http', status });
        },
      });
      const tool = toolNamed(webSearch, 'web_search');
      const first = await execute(tool, { query: 'cherry studio' });
      const repeated = await execute(tool, { query: 'cherry studio' });

      expect(first.value).toMatchObject({ status: 'error', retryable: false });
      expect(first.value).toMatchObject({
        message: expect.stringContaining(status === 429 ? 'rate limited' : `HTTP ${status}`),
      });
      expect(repeated).toEqual(first);
      expect(webSearch.searchKeywords).toHaveBeenCalledTimes(1);
    },
  );

  test('stops retrying a transient failure after one retry', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new HttpError('Provider unavailable', { kind: 'http', status: 503 });
      },
    });
    const tool = toolNamed(webSearch, 'web_search');
    const first = await execute(tool, { query: 'cherry studio' });
    const retry = await execute(tool, { query: 'cherry studio' });
    const repeated = await execute(tool, { query: 'cherry studio' });

    expect(first.value).toMatchObject({ status: 'error', retryable: true });
    expect(retry.value).toMatchObject({ status: 'error', retryable: false });
    expect(repeated).toEqual(retry);
    expect(webSearch.searchKeywords).toHaveBeenCalledTimes(2);
  });

  test('caches the result of a successful retry', async () => {
    let attempts = 0;
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new HttpError('Request timed out', { kind: 'http', status: 408 });
        }
        return RESPONSE;
      },
    });
    const tool = toolNamed(webSearch, 'web_search');
    await execute(tool, { query: 'cherry studio' });
    const retry = await execute(tool, { query: 'cherry studio' });
    const repeated = await execute(tool, { query: 'cherry studio' });

    expect(retry.value).toEqual([expect.objectContaining({ content: 'Body' })]);
    expect(repeated).toEqual(retry);
    expect(webSearch.searchKeywords).toHaveBeenCalledTimes(2);
  });

  test('honors cancellation even when the requested result is cached', async () => {
    const webSearch = createWebSearch({});
    const tool = toolNamed(webSearch, 'web_search');
    await execute(tool, { query: 'cherry studio' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      tool.execute({
        input: { query: 'cherry studio' },
        signal: controller.signal,
        toolCallId: 'cancelled-call',
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(webSearch.searchKeywords).toHaveBeenCalledTimes(1);
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

  test('deduplicates URLs and reuses an already fetched batch regardless of order', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async ({ urls }) => pageResponse(urls[0]),
    });
    const tool = toolNamed(webSearch, 'web_fetch');
    const first = await execute(tool, {
      urls: ['https://example.com/a', 'https://example.com/a', 'https://example.com/b'],
    });
    const repeated = await execute(tool, {
      urls: ['https://example.com/b', 'https://example.com/a'],
    });

    expect(webSearch.fetchUrls.mock.calls.map(([request]) => request.urls)).toEqual([
      ['https://example.com/a'],
      ['https://example.com/b'],
    ]);
    expect(repeated).toEqual(first);
  });

  test('retries only the failed page in a partially successful batch', async () => {
    let failedPageAttempts = 0;
    const webSearch = createWebSearch({
      fetchUrls: async ({ urls }) => {
        if (urls[0].endsWith('/b') && ++failedPageAttempts === 1) {
          throw new HttpError('Temporarily unavailable', { kind: 'http', status: 503 });
        }
        return pageResponse(urls[0]);
      },
    });
    const tool = toolNamed(webSearch, 'web_fetch');
    const input = { urls: ['https://example.com/a', 'https://example.com/b'] };
    const first = await execute(tool, input);
    const retry = await execute(tool, input);
    const repeated = await execute(tool, input);

    expect(first.value).toEqual([expect.objectContaining({ url: input.urls[0] })]);
    expect(retry.value).toEqual([
      ...(first.value as unknown[]),
      expect.objectContaining({ url: input.urls[1] }),
    ]);
    expect(repeated).toEqual(retry);
    expect(webSearch.fetchUrls.mock.calls.map(([request]) => request.urls)).toEqual([
      [input.urls[0]],
      [input.urls[1]],
      [input.urls[1]],
    ]);
  });

  test.each([
    { status: 503, attempts: 2 },
    { status: 429, attempts: 1 },
  ])(
    'bounds retries for an HTTP $status page even in overlapping batches',
    async ({ status, attempts }) => {
      const webSearch = createWebSearch({
        fetchUrls: async ({ urls }) => {
          if (urls[0].endsWith('/b')) {
            throw new HttpError('Page failed', { kind: 'http', status });
          }
          return pageResponse(urls[0]);
        },
      });
      const tool = toolNamed(webSearch, 'web_fetch');
      const first = await execute(tool, {
        urls: ['https://example.com/a', 'https://example.com/b'],
      });
      await execute(tool, { urls: ['https://example.com/b', 'https://example.com/c'] });
      const repeated = await execute(tool, {
        urls: ['https://example.com/a', 'https://example.com/b'],
      });
      const failed = await execute(tool, { urls: ['https://example.com/b'] });

      expect(repeated).toEqual(first);
      expect(failed.value).toMatchObject({ status: 'error', retryable: false });
      expect(
        webSearch.fetchUrls.mock.calls.filter(([request]) => request.urls[0].endsWith('/b')),
      ).toHaveLength(attempts);
      expect(webSearch.fetchUrls).toHaveBeenCalledTimes(2 + attempts);
    },
  );

  test('shares pending page reads across overlapping batches', async () => {
    const webSearch = createWebSearch({ fetchUrls: async ({ urls }) => pageResponse(urls[0]) });
    const tool = toolNamed(webSearch, 'web_fetch');
    const [first, second] = await Promise.all([
      execute(tool, { urls: ['https://example.com/a', 'https://example.com/b'] }),
      execute(tool, { urls: ['https://example.com/b', 'https://example.com/c'] }),
    ]);

    expect(webSearch.fetchUrls).toHaveBeenCalledTimes(3);
    expect((first.value as unknown[])[1]).toEqual((second.value as unknown[])[0]);
  });

  test('bounds combined cached pages without truncating their stored content', async () => {
    const webSearch = createWebSearch({
      fetchUrls: async ({ urls }) => pageResponse(urls[0], '文'.repeat(4_000)),
    });
    const tool = toolNamed(webSearch, 'web_fetch');
    const urls = Array.from({ length: 20 }, (_, index) => `https://example.com/${index}`);
    const batch = await execute(tool, { urls });
    const results = batch.value as {
      content: string;
      id: string;
      url: string;
      truncated: boolean;
    }[];
    expect(results).toHaveLength(20);
    expect(results.every((result) => result.content.length === 800 && result.truncated)).toBe(true);

    const single = await execute(tool, { urls: [urls[0]] });
    expect(single.value).toEqual([
      expect.objectContaining({
        content: '文'.repeat(4_000),
        id: results.find((result) => result.url === urls[0])?.id,
      }),
    ]);
    expect(webSearch.fetchUrls).toHaveBeenCalledTimes(20);
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
  fetchUrls?: (request: WebSearchFetchUrlsRequest) => Promise<typeof RESPONSE>;
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

function pageResponse(url: string, content = 'Body'): typeof RESPONSE {
  return { results: [{ content, title: url, url }], query: url };
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
