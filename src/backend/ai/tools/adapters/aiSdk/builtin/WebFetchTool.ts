import {
  WEB_FETCH_TOOL_NAME,
  webFetchInputSchema,
  webFetchOutputSchema,
} from '@cherrystudio/universal/ai/builtinTools';
import { tool } from 'ai';
import * as z from 'zod';

import { markTrustedLocalToolTerminalFailure } from '@/backend/ai/runtime/aiSdk/loop/localToolTerminalOutcome';
import {
  fetchWeb,
  WEB_FETCH_DESCRIPTION,
  webLookupErrorSchema,
  webLookupModelOutput,
} from '@/backend/ai/tools/webLookup';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { ToolEntry } from '../../../types';

export { WEB_FETCH_TOOL_NAME, webFetchInputSchema };

const webFetchResultSchema = z.union([webFetchOutputSchema, webLookupErrorSchema]);

export function createWebFetchTool(webSearchService: WebSearchService) {
  return tool({
    description: WEB_FETCH_DESCRIPTION,
    inputSchema: webFetchInputSchema,
    outputSchema: webFetchResultSchema,
    strict: true,
    execute: async ({ urls }, options) =>
      markTrustedLocalToolTerminalFailure(
        await fetchWeb(webSearchService, urls, options.abortSignal),
      ),
    toModelOutput: ({ output }) => webLookupModelOutput(output),
  });
}

export function createWebFetchToolEntry(webSearch: WebSearchService): ToolEntry {
  return {
    applies: (scope) => Boolean(scope.assistant?.settings?.enableWebSearch),
    defer: 'auto',
    description: 'Fetch readable content from known web page URLs',
    name: WEB_FETCH_TOOL_NAME,
    namespace: 'web',
    tool: createWebFetchTool(webSearch),
  };
}
