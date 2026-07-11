import type { WebSearchService } from '@/services/webSearch/WebSearchService';

import {
  createWebSearchTool,
  WEB_LOOKUP_ERROR_NOTE,
  webSearchInputSchema,
} from '../createWebSearchTool';

jest.mock('@/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

describe('createWebSearchTool', () => {
  it.each([
    'Default web search provider is not configured for capability searchKeywords',
    'Unknown web search provider: removed-provider',
    'Web search provider jina does not support capability searchKeywords',
    'Web search provider jina does not implement capability searchKeywords',
    'Web search provider firecrawl is not supported on mobile',
  ])('marks permanent configuration errors as non-retryable: %s', async (message) => {
    const webSearchService = {
      searchKeywords: jest.fn(async () => {
        throw new Error(message);
      }),
    } as unknown as WebSearchService;
    const searchTool = createWebSearchTool(webSearchService);

    await expect(
      searchTool.execute?.(
        { query: 'Cherry Studio mobile' },
        {
          abortSignal: new AbortController().signal,
          messages: [],
          toolCallId: 'web-search-1',
        },
      ),
    ).resolves.toEqual({
      error: expect.stringMatching(/configure.*Settings.*do not retry/i),
    });
  });

  it('returns a stable retry note for transient provider failures', async () => {
    const webSearchService = {
      searchKeywords: jest.fn(async () => {
        throw new Error('HTTP 503 upstream unavailable');
      }),
    } as unknown as WebSearchService;
    const searchTool = createWebSearchTool(webSearchService);

    await expect(
      searchTool.execute?.(
        { query: 'Cherry Studio mobile' },
        { messages: [], toolCallId: 'web-search-1' },
      ),
    ).resolves.toEqual({ error: WEB_LOOKUP_ERROR_NOTE });
  });

  it('requires concise, self-contained queries', () => {
    expect(webSearchInputSchema.safeParse({ query: 'x' }).success).toBe(false);
    expect(webSearchInputSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false);
    expect(webSearchInputSchema.safeParse({ query: 'current Cherry Studio release' }).success).toBe(
      true,
    );
  });
});
