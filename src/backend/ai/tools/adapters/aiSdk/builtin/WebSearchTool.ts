/**
 * Web search tool — agentic.
 *
 * The model picks search queries and may call multiple times with refined
 * terms. The actual lookup (provider resolution, mapping, error handling)
 * lives in `webLookup`, mirroring desktop; this file is just the AI-SDK
 * `tool()` wrapper.
 */

import { markTrustedLocalToolTerminalFailure } from '@cherrystudio/ai-runtime/runtime';
import {
  WEB_SEARCH_TOOL_NAME,
  webSearchInputSchema,
  webSearchOutputSchema,
} from '@cherrystudio/universal/ai/builtinTools';
import { tool } from 'ai';
import * as z from 'zod';

import {
  searchWeb,
  WEB_SEARCH_DESCRIPTION,
  webLookupErrorSchema,
  webLookupModelOutput,
} from '@/backend/ai/tools/webLookup';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { ToolEntry } from '../../../types';

export { WEB_SEARCH_TOOL_NAME, webSearchInputSchema };
export { WEB_LOOKUP_ERROR_NOTE, WEB_SEARCH_DESCRIPTION } from '@/backend/ai/tools/webLookup';

const webSearchResultSchema = z.union([webSearchOutputSchema, webLookupErrorSchema]);

export function createWebSearchTool(webSearchService: WebSearchService) {
  return tool({
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchResultSchema,
    // Provider-level constrained decoding where supported. Repair fallback
    // (in AiService) handles providers that don't honour `strict`.
    strict: true,
    execute: async ({ query }, options) =>
      markTrustedLocalToolTerminalFailure(
        await searchWeb(webSearchService, query, options.abortSignal),
      ),
    toModelOutput: ({ output }) => webLookupModelOutput(output),
  });
}

export function createWebSearchToolEntry(webSearch: WebSearchService): ToolEntry {
  return {
    applies: (scope) => Boolean(scope.assistant?.settings?.enableWebSearch),
    defer: 'auto',
    description: WEB_SEARCH_DESCRIPTION,
    name: WEB_SEARCH_TOOL_NAME,
    namespace: 'web',
    tool: createWebSearchTool(webSearch),
  };
}
