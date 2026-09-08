import { sliceByTokens } from 'tokenx';

import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
  WebSearchResult,
} from '@/shared/data/types/webSearch';

const FETCH_PAGE_TOKEN_LIMIT = 4_000;
const FETCH_TOTAL_TOKEN_LIMIT = 16_000;
// tokenx estimates tokens; whitespace and numeric runs can otherwise be arbitrarily long.
const MAX_CHARS_PER_TOKEN = 6;

export type WebSearchPostProcessingResult = {
  response: WebSearchResponse;
};

export async function postProcessWebSearchResponse(
  response: WebSearchResponse,
  runtimeConfig: WebSearchExecutionConfig,
): Promise<WebSearchPostProcessingResult> {
  if (response.results.length <= 0) {
    return { response };
  }

  if (response.capability === 'fetchUrls') {
    return { response: { ...response, results: boundWebFetchResults(response.results) } };
  }

  const { compression } = runtimeConfig;
  const perResultLimit =
    compression.method === 'cutoff'
      ? Math.floor(compression.cutoffLimit / response.results.length)
      : undefined;

  if (perResultLimit !== undefined) {
    return {
      response: {
        ...response,
        results: applyCutoff(response.results, Math.max(0, perResultLimit)),
      },
    };
  }

  return { response };
}

/** Reapply the shared page and batch limits when cached page results are combined. */
export function boundWebFetchResults<
  TResult extends Pick<WebSearchResult, 'content' | 'truncated'>,
>(results: TResult[]): TResult[] {
  if (results.length === 0) return results;
  return applyCutoff(
    results,
    Math.min(FETCH_PAGE_TOKEN_LIMIT, Math.floor(FETCH_TOTAL_TOKEN_LIMIT / results.length)),
  );
}

function applyCutoff<TResult extends Pick<WebSearchResult, 'content' | 'truncated'>>(
  results: TResult[],
  perResultLimit: number,
): TResult[] {
  return results.map((result) => {
    const boundedContent = result.content.slice(0, perResultLimit * MAX_CHARS_PER_TOKEN);
    const sliced = sliceByTokens(boundedContent, 0, perResultLimit).replace(/[\uD800-\uDBFF]$/, '');
    if (sliced.length >= result.content.length) return result;

    return {
      ...result,
      content: sliced,
      truncated: true,
    };
  });
}
