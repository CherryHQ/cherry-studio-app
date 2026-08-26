/**
 * Web search and fetch.
 *
 * These are the only built-in tools that reach a third-party service the user
 * configures separately, so the catalog leaves them off until an Agent binding
 * turns them on — the same opt-in the retired per-Assistant web-search switch
 * provided. Provider resolution, mapping, and error classification live in
 * `webLookup`; this file is only the Runtime tool wrapper.
 */

import {
  WEB_FETCH_TOOL_NAME,
  webFetchInputSchema,
  WEB_SEARCH_TOOL_NAME,
  webSearchInputSchema,
} from '@cherrystudio/universal/ai/builtinTools';
import * as z from 'zod';

import type { RuntimeTool, RuntimeToolResult } from '@/backend/ai/agent';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { toRuntimeInputSchema } from '../runtimeToolSchema';
import {
  fetchWeb,
  searchWeb,
  WEB_FETCH_DESCRIPTION,
  WEB_SEARCH_DESCRIPTION,
  webLookupToolResult,
} from './webLookup';

export const WEB_TOOL_IDS = {
  fetch: WEB_FETCH_TOOL_NAME,
  search: WEB_SEARCH_TOOL_NAME,
} as const;

export type WebSearchToolDependencies = {
  webSearch: Pick<WebSearchService, 'fetchUrls' | 'searchKeywords'>;
};

export function createWebTools(deps: WebSearchToolDependencies): RuntimeTool[] {
  return [
    {
      ref: { source: 'builtin', capabilityId: WEB_SEARCH_TOOL_NAME },
      providerName: WEB_SEARCH_TOOL_NAME,
      displayName: 'Web search',
      description: WEB_SEARCH_DESCRIPTION,
      inputSchema: toRuntimeInputSchema(webSearchInputSchema),
      approval: 'auto',
      execute: async (input, context) => {
        const parsed = webSearchInputSchema.safeParse(input);
        if (!parsed.success) {
          return invalidInput(parsed.error);
        }
        return webLookupToolResult(
          await searchWeb(deps.webSearch, parsed.data.query, context.signal),
        );
      },
    },
    {
      ref: { source: 'builtin', capabilityId: WEB_FETCH_TOOL_NAME },
      providerName: WEB_FETCH_TOOL_NAME,
      displayName: 'Fetch web page',
      description: WEB_FETCH_DESCRIPTION,
      inputSchema: toRuntimeInputSchema(webFetchInputSchema),
      approval: 'auto',
      execute: async (input, context) => {
        const parsed = webFetchInputSchema.safeParse(input);
        if (!parsed.success) {
          return invalidInput(parsed.error);
        }
        return webLookupToolResult(
          await fetchWeb(deps.webSearch, parsed.data.urls, context.signal),
        );
      },
    },
  ];
}

/** A malformed call is the model's to fix, so it settles as a value it can read. */
function invalidInput(error: z.ZodError): RuntimeToolResult {
  return {
    value: {
      status: 'error',
      message: `Invalid input: ${z.prettifyError(error)}`,
      retryable: true,
    },
    artifacts: [],
  };
}
