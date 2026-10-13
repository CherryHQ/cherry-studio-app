import * as z from 'zod';

import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';

const Crawl4AIMarkdownResponseSchema = z.object({
  url: z.string(),
  markdown: z.string(),
  success: z.boolean(),
});

// The instance renders the page in a browser before answering.
const FETCH_TIMEOUT_MS = 60_000;

export class Crawl4AIProvider extends BaseWebSearchProvider {
  async fetchUrls(
    query: string,
    _config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const url = query.trim();
    // A self-hosted instance may run open or behind a token.
    const apiKey = this.resolveApiKey(false);
    const payload = await this.requestJson({
      body: { url, f: 'fit' },
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      operation: 'fetch',
      responseSchema: Crawl4AIMarkdownResponseSchema,
      signal: httpOptions?.signal ?? undefined,
      timeoutMs: FETCH_TIMEOUT_MS,
      url: this.resolveApiUrl('fetchUrls', '/md'),
    });

    if (!payload.success) {
      throw new Error(`Crawl4AI fetch failed for ${url}`);
    }
    const content = payload.markdown.trim();
    if (!content) {
      throw new Error(`Crawl4AI fetch returned empty content for ${url}`);
    }

    return {
      query: url,
      providerId: this.provider.id,
      capability: 'fetchUrls',
      inputs: [url],
      results: [{ title: payload.url || url, content, url: payload.url || url, sourceInput: url }],
    };
  }
}
