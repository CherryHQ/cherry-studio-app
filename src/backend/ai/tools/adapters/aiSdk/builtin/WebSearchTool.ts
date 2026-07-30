import { tool } from 'ai';
import * as z from 'zod';
import {
  isAbortError,
  isPermanentWebSearchConfigError,
} from '@/backend/services/webSearch/utils/errors';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ToolEntry } from '../types';

const logger = loggerService.withContext('WebSearchTool');

export const WEB_SEARCH_TOOL_NAME = 'web_search';

export const WEB_SEARCH_PROVIDER_NOT_CONFIGURED_MESSAGE =
  'No usable web search provider is configured. Tell the user to configure one in Settings (Web Search); do not retry because it cannot succeed until the configuration is fixed.';

export const WEB_SEARCH_DESCRIPTION = `Search the web for current information, news, and real-time data.

Use this when:
- The user asks about recent events, current prices, or live data
- You need to verify facts you're uncertain about or that may have changed
- The user references something you don't have context on

Don't use for:
- Math, code reasoning, or things you can answer from your training
- Well-known facts unlikely to have changed

You may call this multiple times with different queries to broaden coverage. Cite sources by [id] in
your final answer.`;

export const WEB_LOOKUP_ERROR_NOTE =
  'Web lookup failed (network/provider error); retry or inform the user.';

const webSearchResultSchema = z.object({
  content: z.string(),
  id: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
});

const webSearchOutputSchema = z.union([
  z.array(webSearchResultSchema),
  z.object({ error: z.string() }),
]);

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, 'Query must be at least 2 characters')
    .max(200, 'Query should be concise - break long questions into multiple searches')
    .describe(
      'Self-contained web search query. Do not use pronouns or context-dependent references; expand the topic from earlier messages.',
    ),
});

export function createWebSearchTool(webSearchService: WebSearchService) {
  return tool({
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
    strict: true,
    execute: async ({ query }, options) => {
      try {
        const response = await webSearchService.searchKeywords(
          { keywords: [query] },
          { signal: options.abortSignal },
        );

        return response.results.map((result, index) => ({
          content: result.content,
          id: index + 1,
          title: result.title,
          url: result.url,
        }));
      } catch (error) {
        if (options.abortSignal?.aborted || isAbortError(error)) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        logger.warn('External web search failed', { error: message, query });
        return {
          error: isPermanentWebSearchConfigError(message)
            ? WEB_SEARCH_PROVIDER_NOT_CONFIGURED_MESSAGE
            : WEB_LOOKUP_ERROR_NOTE,
        };
      }
    },
    toModelOutput: ({ output }) =>
      Array.isArray(output)
        ? { type: 'json', value: output }
        : { type: 'text', value: output.error },
  });
}

export function createWebSearchToolEntry(webSearch: WebSearchService): ToolEntry {
  return {
    applies: (scope) => scope.externalWebSearchEnabled,
    defer: 'auto',
    description: WEB_SEARCH_DESCRIPTION,
    name: WEB_SEARCH_TOOL_NAME,
    namespace: 'web',
    tool: createWebSearchTool(webSearch),
  };
}
