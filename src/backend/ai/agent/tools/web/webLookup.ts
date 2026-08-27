/**
 * Web search / fetch core — mirrors desktop `src/main/ai/tools/webLookup.ts`.
 *
 * Desktop shares this between its builtin tools and its Claude Code MCP bridge,
 * so the tool file there is a thin wrapper; mobile keeps the same split to make
 * the two readable side by side.
 *
 * Never throws on lookup failure: a failed lookup returns a structured error so
 * callers can distinguish transient failures from failures that cannot succeed
 * without a configuration change. A cancellation (aborted signal) is the
 * exception — it rethrows so it propagates as the cancellation it is.
 */

import type { WebSearchOutput } from '@cherrystudio/universal/ai/builtinTools';
import * as z from 'zod';

import { isPermanentWebSearchConfigError } from '@/backend/services/webSearch/utils/config';
import { isAbortError } from '@/backend/services/webSearch/utils/errors';
import type { WebSearchConfigErrorCode } from '@/backend/services/webSearch/WebSearchConfigError';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { WebSearchResponse } from '@/shared/data/types/webSearch';

import type { RuntimeToolResult } from '../../runtime';
import { citeId, newCitePrefix } from './citationIds';

const logger = loggerService.withContext('WebLookup');

/** The narrowest slice of the search service these lookups need. */
export type WebLookupService = Pick<WebSearchService, 'fetchUrls' | 'searchKeywords'>;

export const WEB_SEARCH_DESCRIPTION = `Search the web for current information, news, and real-time data.

Use this when:
- The user asks about recent events, current prices, or live data
- You need to verify facts you're uncertain about or that may have changed
- The user references something you don't have context on

Don't use for:
- Math, code reasoning, or things you can answer from your training
- Well-known facts unlikely to have changed

You may call this multiple times with different queries to broaden coverage:
- If the topic likely has more authoritative sources in another language
  (English for tech / scientific topics, the local language for regional news,
  Japanese for anime / manga, etc.), repeat the search with the topic translated
  into the most likely source language.
- If the first results miss an angle, refine with synonyms or sub-aspects.

Cite: append [cite:id] immediately after each statement a result supports, using the result's exact \`id\` field.`;

export const WEB_FETCH_DESCRIPTION = `Fetch the readable content from one or more known web page URLs.

Use this when:
- You already have specific URLs from the user, prior context, or web_search
- You need page content from an article, documentation page, or reference URL
- Search snippets are not enough and you need the source page text

Don't use this when you only have a topic or question; call web_search first.

Cite: append [cite:id] immediately after each statement a result supports, using the result's exact \`id\` field.`;

/**
 * A failed lookup must be distinguishable from "ran fine, found nothing": both
 * would otherwise be `[]`. Success returns the results array (matching
 * `webSearchOutputSchema`); failure returns `{ error }`.
 */
export const webLookupErrorSchema = z.object({
  error: z.string(),
  retryable: z.boolean().optional(),
  terminal: z.literal(true).optional(),
  userMessage: z.string().optional(),
  i18nKey: z.string().optional(),
});
export type WebLookupError = z.infer<typeof webLookupErrorSchema>;
export type WebLookupResult = WebSearchOutput | WebLookupError;

/** Transient failure (network/provider hiccup) — a retry can succeed. */
export const WEB_LOOKUP_ERROR_NOTE =
  'Web lookup failed (network/provider error); retry or inform the user.';

/**
 * Permanent failure: no usable web-search provider for the requested capability. Retrying can never
 * succeed, so the note must steer away from a retry loop.
 */
export const WEB_PROVIDER_NOT_CONFIGURED_NOTE =
  'No usable web search provider for this capability (none configured, or the configured one does not support it). Tell the user to configure one in Settings (Web Search); do not retry — it cannot succeed until then.';

export const WEB_PROVIDER_CONFIGURATION_ERROR_NOTE =
  'The configured web search provider has a missing API key or a missing/invalid API host. Tell the user to fix it in Settings (Web Search); do not retry — it cannot succeed until then.';

export const WEB_NETWORK_ERROR_NOTE =
  'Web access failed because of the current network environment. Tell the user to check their network connection and try again; do not retry automatically or provide configuration-specific guidance.';

const WEB_NETWORK_ERROR_MESSAGE = 'Web access failed. Check your network connection and try again.';
const WEB_PROVIDER_NOT_CONFIGURED_MESSAGE =
  'Web search is unavailable because no compatible provider is configured. Configure one in Settings → Web Search, then try again.';
const WEB_API_KEY_MISSING_MESSAGE =
  'Web search is unavailable because the configured provider is missing an API key. Add one in Settings → Web Search, then try again.';
const WEB_API_HOST_MISSING_MESSAGE =
  'Web search is unavailable because the configured provider is missing an API host. Add one in Settings → Web Search, then try again.';
const WEB_API_HOST_INVALID_MESSAGE =
  "Web search is unavailable because the configured provider's API host is invalid. Enter a valid HTTP(S) URL in Settings → Web Search, then try again.";
const WEB_PROVIDER_UNSUPPORTED_MESSAGE =
  'Web search is unavailable because the configured provider is not supported on this device. Choose a different provider in Settings → Web Search, then try again.';

const WEB_CONFIG_ERROR_PRESENTATION: Record<
  WebSearchConfigErrorCode,
  { userMessage: string; i18nKey: string }
> = {
  provider_not_configured: {
    userMessage: WEB_PROVIDER_NOT_CONFIGURED_MESSAGE,
    i18nKey: 'web_search_provider_unavailable',
  },
  provider_unknown: {
    userMessage: WEB_PROVIDER_NOT_CONFIGURED_MESSAGE,
    i18nKey: 'web_search_provider_unavailable',
  },
  capability_unsupported: {
    userMessage: WEB_PROVIDER_NOT_CONFIGURED_MESSAGE,
    i18nKey: 'web_search_provider_unavailable',
  },
  api_key_missing: {
    userMessage: WEB_API_KEY_MISSING_MESSAGE,
    i18nKey: 'web_search_api_key_missing',
  },
  api_host_missing: {
    userMessage: WEB_API_HOST_MISSING_MESSAGE,
    i18nKey: 'web_search_api_host_missing',
  },
  api_host_invalid: {
    userMessage: WEB_API_HOST_INVALID_MESSAGE,
    i18nKey: 'web_search_api_host_invalid',
  },
  // Mobile-only code; reuses desktop's "pick another provider" key so no new
  // translation string is needed.
  provider_unsupported_on_platform: {
    userMessage: WEB_PROVIDER_UNSUPPORTED_MESSAGE,
    i18nKey: 'web_search_provider_unavailable',
  },
};

function isProxyFakeIpError(message: string): boolean {
  return (
    /Unsafe remote url: DNS resolved to local or private address/i.test(message) &&
    /\b198\.(?:18|19)\.(?:\d{1,3})\.(?:\d{1,3})\b/.test(message)
  );
}

function classifyWebLookupError(error: unknown): WebLookupError {
  const message = error instanceof Error ? error.message : String(error);

  if (isPermanentWebSearchConfigError(error)) {
    return {
      error: message,
      retryable: false,
      terminal: true,
      ...WEB_CONFIG_ERROR_PRESENTATION[error.code],
    };
  }

  if (isProxyFakeIpError(message)) {
    return {
      error: WEB_NETWORK_ERROR_MESSAGE,
      retryable: false,
      terminal: true,
      userMessage: WEB_NETWORK_ERROR_MESSAGE,
      i18nKey: 'web_lookup_network_error',
    };
  }

  return { error: message, retryable: true };
}

/** Branch the model-facing note: permanent failures must not trigger a retry loop. */
function webLookupNote(error: WebLookupError): string {
  if (error.i18nKey === 'web_lookup_network_error' || isProxyFakeIpError(error.error)) {
    return WEB_NETWORK_ERROR_NOTE;
  }
  if (error.i18nKey === 'web_search_provider_unavailable') {
    return WEB_PROVIDER_NOT_CONFIGURED_NOTE;
  }
  if (
    error.i18nKey === 'web_search_api_key_missing' ||
    error.i18nKey === 'web_search_api_host_missing' ||
    error.i18nKey === 'web_search_api_host_invalid'
  ) {
    return WEB_PROVIDER_CONFIGURATION_ERROR_NOTE;
  }
  return WEB_LOOKUP_ERROR_NOTE;
}

export function isWebLookupError(output: WebLookupResult): output is WebLookupError {
  // Success is always the results array; the error object is the only non-array shape. (A non-strict
  // zod object-parse would misclassify a future object-shaped success that happened to carry `error`.)
  return !Array.isArray(output);
}

/**
 * Shared result projection. Success is the results array the renderer and the
 * model both read; a failure carries the note that tells the model whether a
 * retry can help, because a thrown error would reach it as an opaque failure.
 */
export function webLookupToolResult(output: WebLookupResult): RuntimeToolResult {
  if (isWebLookupError(output)) {
    return {
      value: {
        status: 'error',
        message: webLookupNote(output),
        retryable: output.retryable ?? false,
      },
      artifacts: [],
    };
  }
  return { value: output, artifacts: [] };
}

function mapResponse(response: WebSearchResponse): WebSearchOutput {
  const prefix = newCitePrefix();
  return response.results.map((result, index) => ({
    id: citeId(prefix, index),
    title: result.title,
    url: result.url,
    content: result.content,
  }));
}

export async function searchWeb(
  webSearchService: WebLookupService,
  query: string,
  signal?: AbortSignal,
): Promise<WebLookupResult> {
  try {
    const response = await webSearchService.searchKeywords({ keywords: [query] }, { signal });
    return mapResponse(response);
  } catch (error) {
    // A cancellation isn't a provider failure — rethrow so it propagates instead of looking like a
    // retryable error that keeps the tool loop running after the request was already aborted.
    if (signal?.aborted || isAbortError(error)) throw error;
    logger.error('webSearchService.searchKeywords failed', error as Error, { query });
    return classifyWebLookupError(error);
  }
}

export async function fetchWeb(
  webSearchService: WebLookupService,
  urls: string[],
  signal?: AbortSignal,
): Promise<WebLookupResult> {
  try {
    const response = await webSearchService.fetchUrls({ urls }, { signal });
    return mapResponse(response);
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    logger.error('webSearchService.fetchUrls failed', error as Error, { urls });
    return classifyWebLookupError(error);
  }
}
