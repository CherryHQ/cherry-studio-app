/**
 * Web search and fetch.
 *
 * The system catalog creates fresh tools for each turn. Keep request reuse
 * here so it cannot outlive that turn. Provider resolution,
 * mapping, and error classification live in `webLookup`.
 */

import {
  WEB_FETCH_TOOL_NAME,
  webFetchInputSchema,
  WEB_SEARCH_TOOL_NAME,
  webSearchInputSchema,
} from '@cherrystudio/universal/ai/builtinTools';
import * as z from 'zod';

import { boundWebFetchResults } from '@/backend/services/webSearch/postProcessing';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import { raceAbort } from '../../runtime';
import { toRuntimeInputSchema } from '../runtimeToolSchema';
import {
  createWebLookupError,
  fetchWeb,
  isWebLookupError,
  searchWeb,
  WEB_FETCH_DESCRIPTION,
  WEB_SEARCH_DESCRIPTION,
  type WebLookupResult,
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
  const runSearch = createLookupRunner();
  const runFetch = createLookupRunner();
  return [
    {
      ref: { source: 'builtin', capabilityId: WEB_SEARCH_TOOL_NAME },
      providerName: WEB_SEARCH_TOOL_NAME,
      displayName: 'Web search',
      description: WEB_SEARCH_DESCRIPTION,
      inputSchema: toRuntimeInputSchema(webSearchInputSchema),
      approval: 'auto',
      failureGroup: 'web',
      execute: async ({ input, signal }) => {
        const parsed = webSearchInputSchema.safeParse(input);
        if (!parsed.success) {
          return invalidInput(parsed.error);
        }
        const query = parsed.data.query.replace(/\s+/gu, ' ');
        return webLookupToolResult(
          await runSearch(query, () => searchWeb(deps.webSearch, query, signal), signal),
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
      failureGroup: 'web',
      execute: async ({ input, signal }) => {
        const parsed = webFetchInputSchema.safeParse(input);
        if (!parsed.success) {
          return invalidInput(parsed.error);
        }
        const urls = [...new Set(parsed.data.urls)].sort();
        // Cache each URL so overlapping batches reuse sources and citation ids.
        const outputs = await Promise.all(
          urls.map((url) => runFetch(url, () => fetchWeb(deps.webSearch, [url], signal), signal)),
        );
        const failures = outputs.filter(isWebLookupError);
        const results = boundWebFetchResults(
          outputs.flatMap((output) => (isWebLookupError(output) ? output.results : output)),
        );
        return webLookupToolResult(
          failures.length > 0
            ? createWebLookupError(
                failures.flatMap((output) => output.failures),
                'fetchUrls',
                results,
                failures[0].providerId,
              )
            : results,
        );
      },
    },
  ];
}

/** Share pending/completed lookups, including failures that must not be retried this turn. */
function createLookupRunner() {
  const lookups = new Map<string, Promise<WebLookupResult>>();

  return async (
    key: string,
    lookup: () => Promise<WebLookupResult>,
    signal: AbortSignal,
  ): Promise<WebLookupResult> => {
    signal.throwIfAborted();
    const cached = lookups.get(key);
    if (cached) return raceAbort(cached, signal);

    const result = lookup().catch((error: unknown) => {
      lookups.delete(key);
      throw error;
    });
    lookups.set(key, result);
    return raceAbort(result, signal);
  };
}

/** A malformed call is the model's to fix, so it settles as a value it can read. */
function invalidInput(error: z.ZodError): RuntimeToolResult {
  const message = `Invalid input: ${z.prettifyError(error)}`;
  return {
    failure: {
      scope: 'call',
      error: { code: 'invalid_tool_input', message, retryable: true, origin: 'tool' },
    },
    value: {
      status: 'error',
      message,
      retryable: true,
    },
    artifacts: [],
  };
}
