import * as z from 'zod';

import { loggerService } from '@/shared/core/logger/LoggerService';
import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { isValidUrl } from '../../utils/url';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { UrlSearchContext } from '../base/context';

const logger = loggerService.withContext('SearxngProvider');

type SearxngSearchContext = UrlSearchContext;

const SearxngSearchResponseSchema = z.object({
  query: z.string().optional(),
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        snippet: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .default([]),
});

function trimStringList(values: readonly string[]): string[] {
  return values.flatMap((value) => value.trim() || []);
}

function encodeBasicAuth(username: string, password: string): string {
  const raw = `${username}:${password}`;

  if (typeof btoa === 'function') {
    return btoa(raw);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw).toString('base64');
  }

  throw new Error('Basic auth encoding is not available in this runtime');
}

export class SearxngProvider extends BaseWebSearchProvider {
  private getBasicAuthHeaders(): Record<string, string> {
    const basicAuthUsername = this.provider.basicAuthUsername.trim();
    if (!basicAuthUsername) {
      return {};
    }
    const basicAuthPassword = this.provider.basicAuthPassword.trim();

    return {
      Authorization: `Basic ${encodeBasicAuth(basicAuthUsername, basicAuthPassword)}`,
    };
  }

  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareSearchContext(query, config, httpOptions);
    const searchPayload = await this.executeSearch(context);

    return this.buildFinalResponse(context, searchPayload);
  }

  private prepareSearchContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): SearxngSearchContext {
    const searchParams = new URLSearchParams({
      q: query,
      language: 'auto',
      format: 'json',
    });
    const configuredEngines = trimStringList(this.provider.engines);
    if (configuredEngines.length > 0) {
      searchParams.set('engines', configuredEngines.join(','));
    }

    return {
      query,
      maxResults: config.maxResults,
      searchUrl: `${this.resolveApiUrl('searchKeywords', '/search')}?${searchParams.toString()}`,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: SearxngSearchContext) {
    return this.requestJson({
      method: 'GET',
      headers: this.getBasicAuthHeaders(),
      operation: 'search',
      responseSchema: SearxngSearchResponseSchema,
      signal: context.signal,
      url: context.searchUrl,
    });
  }

  private buildFinalResponse(
    context: SearxngSearchContext,
    searchPayload: z.infer<typeof SearxngSearchResponseSchema>,
  ): WebSearchResponse {
    const results = searchPayload.results
      // These URLs are rendered as tappable citations, and a Searxng instance is
      // whatever host the user pointed at, so require http(s) rather than just
      // non-empty (desktop SearxngProvider.ts:152).
      .filter((item) => isValidUrl(item.url ?? ''))
      .slice(0, context.maxResults)
      .map((item) => ({
        title: item.title?.trim() || '',
        content: item.content?.trim() || item.snippet?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      }));

    if (results.length === 0 && searchPayload.results.length > 0) {
      logger.warn('All Searxng search URLs failed validation', {
        query: context.query,
        total: searchPayload.results.length,
      });
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results,
    };
  }
}
