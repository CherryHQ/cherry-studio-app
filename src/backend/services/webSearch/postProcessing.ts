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

  const { compression } = runtimeConfig;
  const perResultLimit =
    response.capability === 'fetchUrls'
      ? Math.min(
          FETCH_PAGE_TOKEN_LIMIT,
          Math.floor(FETCH_TOTAL_TOKEN_LIMIT / response.results.length),
        )
      : compression.method === 'cutoff'
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

function applyCutoff(results: WebSearchResult[], perResultLimit: number): WebSearchResult[] {
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
