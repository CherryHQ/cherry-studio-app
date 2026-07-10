import type { WebSearchService } from '@/services/webSearch/WebSearchService';

import { createWebSearchTool } from '../createWebSearchTool';

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
});
