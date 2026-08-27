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

  test('keeps a provider hiccup retryable', async () => {
    const webSearch = createWebSearch({
      searchKeywords: async () => {
        throw new Error('socket hang up');
      },
    });

    const result = await execute(toolNamed(webSearch, 'web_search'), { query: 'cherry studio' });

    expect(result.value).toMatchObject({ status: 'error', retryable: true });
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
