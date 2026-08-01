import type { WebSearchConfigErrorCode } from '@/backend/services/webSearch/WebSearchConfigError';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createWebSearchTool, WEB_LOOKUP_ERROR_NOTE, webSearchInputSchema } from '../WebSearchTool';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

describe('createWebSearchTool', () => {
  it('returns citation IDs that are unique across lookup calls', async () => {
    const webSearchService = {
      searchKeywords: jest.fn(async () => ({
        results: [
          { content: 'A', title: 'A', url: 'https://example.com/a' },
          { content: 'B', title: 'B', url: 'https://example.com/b' },
        ],
      })),
    } as unknown as WebSearchService;
    const searchTool = createWebSearchTool(webSearchService);

    const first = await searchTool.execute?.(
      { query: 'Cherry Studio mobile' },
      { messages: [], toolCallId: 'web-search-1' },
    );
    const second = await searchTool.execute?.(
      { query: 'Cherry Studio desktop' },
      { messages: [], toolCallId: 'web-search-2' },
    );

    expect(first).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f]{8}-1$/) }),
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f]{8}-2$/) }),
    ]);
    expect((first as { id: string }[])[0].id).not.toBe((second as { id: string }[])[0].id);
  });

  it.each([
    'provider_not_configured',
    'provider_unknown',
    'capability_unsupported',
    'api_key_missing',
    'api_host_missing',
    'api_host_invalid',
    'provider_unsupported_on_platform',
  ] satisfies WebSearchConfigErrorCode[])(
    'marks permanent configuration errors as non-retryable: %s',
    async (code) => {
      const webSearchService = {
        searchKeywords: jest.fn(async () => {
          throw new WebSearchConfigError(code, `web search failed with ${code}`);
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
        i18nKey: 'web_search_provider_not_configured',
        retryable: false,
        terminal: true,
        userMessage: expect.stringMatching(/configure.*Settings.*do not retry/i),
      });
    },
  );

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
