import * as z from 'zod';

import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { BaseSearchContext } from '../base/context';

const JinaReaderResponseSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).optional(),
  status: z.union([z.number(), z.string()]).optional(),
  data: z
    .looseObject({
      title: z.string().optional(),
      content: z.string().optional(),
      text: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

const JinaSearchResponseSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).optional(),
  status: z.union([z.number(), z.string()]).optional(),
  data: z
    .array(
      z.looseObject({
        title: z.string().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  results: z
    .array(
      z.looseObject({
        title: z.string().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
});

type JinaContext = BaseSearchContext & {
  apiKey: string;
  requestUrl: string;
};

export class JinaProvider extends BaseWebSearchProvider {
  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareSearchKeywordsContext(query, config, httpOptions);
    const payload = await this.executeSearchKeywords(context);

    return this.buildSearchKeywordsResponse(context, payload);
  }

  async fetchUrls(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareFetchUrlsContext(query, config, httpOptions);
    const payload = await this.executeFetchUrls(context);

    return this.buildFetchUrlsResponse(context, payload);
  }

  private prepareSearchKeywordsContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): JinaContext {
    const normalizedQuery = query.trim();

    return {
      // Deliberate divergence: desktop requires a key here
      // (JinaProvider.ts:118) and only lets the reader path run anonymously.
      // s.jina.ai answers unauthenticated requests too, and mobile keeps that
      // open so web search works on a fresh install with nothing configured --
      // JinaProvider.test.ts pins the no-Authorization-header behaviour for
      // both paths. Do not "fix" this back to resolveApiKey() on sync.
      apiKey: this.resolveApiKey(false),
      query: normalizedQuery,
      maxResults: config.maxResults,
      requestUrl: `${withoutTrailingSlash(resolveProviderApiHost(this.provider, 'searchKeywords'))}/${encodeURIComponent(
        normalizedQuery,
      )}`,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private prepareFetchUrlsContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): JinaContext {
    const url = query.trim();

    return {
      apiKey: this.resolveApiKey(false),
      query: url,
      maxResults: config.maxResults,
      requestUrl: `${withoutTrailingSlash(resolveProviderApiHost(this.provider, 'fetchUrls'))}/${url}`,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearchKeywords(context: JinaContext) {
    return this.requestJson({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
      },
      operation: 'search',
      responseSchema: JinaSearchResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private async executeFetchUrls(context: JinaContext) {
    return this.requestJson({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
        'X-Retain-Images': 'none',
      },
      operation: 'reader',
      responseSchema: JinaReaderResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private buildSearchKeywordsResponse(
    context: JinaContext,
    payload: z.infer<typeof JinaSearchResponseSchema>,
  ): WebSearchResponse {
    const results = payload.data || payload.results || [];

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: results.slice(0, context.maxResults).map((result) => ({
        title: result.title?.trim() || '',
        content: result.content?.trim() || result.description?.trim() || '',
        url: result.url || '',
        sourceInput: context.query,
      })),
    };
  }

  private buildFetchUrlsResponse(
    context: JinaContext,
    payload: z.infer<typeof JinaReaderResponseSchema>,
  ): WebSearchResponse {
    const data = payload.data || payload;
    const content = data.content?.trim() || data.text?.trim() || '';

    if (!content) {
      throw new Error(`Jina Reader returned empty content for ${context.query}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'fetchUrls',
      inputs: [context.query],
      results: [
        {
          title: data.title?.trim() || context.query,
          content,
          url: data.url || context.query,
          sourceInput: context.query,
        },
      ],
    };
  }
}
