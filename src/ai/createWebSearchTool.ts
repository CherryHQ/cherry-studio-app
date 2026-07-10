import { tool } from 'ai';
import * as z from 'zod';

import { loggerService } from '@/core/logger/LoggerService';
import { isAbortError, isPermanentWebSearchConfigError } from '@/services/webSearch/utils/errors';
import type { WebSearchService } from '@/services/webSearch/WebSearchService';

const logger = loggerService.withContext('WebSearchTool');

export const WEB_SEARCH_TOOL_NAME = 'web_search';

export const WEB_SEARCH_PROVIDER_NOT_CONFIGURED_MESSAGE =
  'No usable web search provider is configured. Tell the user to configure one in Settings (Web Search); do not retry because it cannot succeed until the configuration is fixed.';

const WEB_SEARCH_DESCRIPTION = `Search the web for current information, news, and real-time data.

Use this when facts may have changed or when the user asks for current information. You may refine
the query and search more than once. Cite sources by their [id] in the final answer.`;

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

export function createWebSearchTool(webSearchService: WebSearchService) {
  return tool({
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: z.object({ query: z.string().trim().min(1) }),
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
            : message,
        };
      }
    },
  });
}
