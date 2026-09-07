/**
 * Web search and fetch.
 *
 * The system catalog creates fresh tools for each turn. Keep request reuse and
 * retry accounting here so they cannot outlive that turn. Provider resolution,
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
      execute: async ({ input, signal }) => {
        const parsed = webFetchInputSchema.safeParse(input);
        if (!parsed.success) {
          return invalidInput(parsed.error);
        }
        const urls = [...new Set(parsed.data.urls)].sort();
        // A service batch can silently omit failed pages. Request/cache each URL
        // separately so its error classification and one retry remain intact.
        const outputs = await Promise.all(
          urls.map((url) => runFetch(url, () => fetchWeb(deps.webSearch, [url], signal), signal)),
        );
        const successful = outputs.filter((output) => !isWebLookupError(output));
        return webLookupToolResult(
          successful.length > 0 ? boundWebFetchResults(successful.flat()) : outputs[0],
        );
      },
    },
  ];
}

/** Share pending/successful lookups and allow only one retry of the same failed request. */
function createLookupRunner() {
  const lookups = new Map<string, { attempts: number; result?: Promise<WebLookupResult> }>();

  return async (
    key: string,
    lookup: () => Promise<WebLookupResult>,
    signal: AbortSignal,
  ): Promise<WebLookupResult> => {
    signal.throwIfAborted();
    const entry = lookups.get(key) ?? { attempts: 0, result: undefined };
    lookups.set(key, entry);
    if (entry.result) return raceAbort(entry.result, signal);

    entry.attempts += 1;
    entry.result = lookup()
      .then((output) => {
        if (isWebLookupError(output) && output.retryable) {
          if (entry.attempts < 2) {
            entry.result = undefined;
          } else {
            return {
              ...output,
              userMessage:
                'This web lookup failed again after one retry. Do not retry it; answer from available sources and state the limitation.',
              retryable: false,
            };
          }
        }
        return output;
      })
      .catch((error: unknown) => {
        lookups.delete(key);
        throw error;
      });
    return raceAbort(entry.result, signal);
  };
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
