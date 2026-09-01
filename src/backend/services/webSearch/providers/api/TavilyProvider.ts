import * as z from 'zod';

import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';

const TavilySearchRequestSchema = z.object({
  query: z.string(),
  max_results: z.number().int().positive(),
});

const TavilySearchResponseSchema = z.object({
  query: z.string(),
  request_id: z.string(),
  response_time: z.union([z.number(), z.string()]),
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .default([]),
});

type TavilySearchContext = ApiKeyRequestSearchContext<z.infer<typeof TavilySearchRequestSchema>>;

export class TavilyProvider extends BaseWebSearchProvider {
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
  ): TavilySearchContext {
    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/search'),
      requestBody: TavilySearchRequestSchema.parse({
        query,
        max_results: config.maxResults,
      }),
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: TavilySearchContext) {
    return this.requestJson({
      body: context.requestBody,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        'Content-Type': 'application/json',
      },
      operation: 'search',
      responseSchema: TavilySearchResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: TavilySearchContext,
    searchPayload: z.infer<typeof TavilySearchResponseSchema>,
  ): WebSearchResponse {
    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.results.slice(0, context.maxResults).map((item) => ({
        title: item.title?.trim() || '',
        content: item.content?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      })),
    };
  }
}
