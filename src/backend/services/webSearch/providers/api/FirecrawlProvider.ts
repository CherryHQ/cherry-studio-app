import * as z from 'zod';

import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';

const FirecrawlSearchRequestSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().optional(),
  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional(),
    })
    .optional(),
});

const FirecrawlScrapeRequestSchema = z.object({
  url: z.string(),
  formats: z.array(z.string()),
});

const FirecrawlScrapeResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z
        .looseObject({
          title: z.union([z.string(), z.array(z.string())]).optional(),
          sourceURL: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const FirecrawlSearchResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
  data: z
    .object({
      web: z
        .array(
          z.object({
            title: z.string().optional(),
            markdown: z.string().optional(),
            description: z.string().optional(),
            url: z.string().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

type FirecrawlSearchContext = ApiKeyRequestSearchContext<
  z.infer<typeof FirecrawlSearchRequestSchema>
>;
type FirecrawlScrapeContext = ApiKeyRequestSearchContext<
  z.infer<typeof FirecrawlScrapeRequestSchema>
>;

export class FirecrawlProvider extends BaseWebSearchProvider {
  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareSearchContext(query, config, httpOptions);
    const searchPayload = await this.executeSearch(context);

    return this.buildFinalResponse(context, searchPayload);
  }

  async fetchUrls(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareScrapeContext(query, config, httpOptions);
    const scrapePayload = await this.executeScrape(context);

    return this.buildScrapeResponse(context, scrapePayload);
  }

  private prepareSearchContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): FirecrawlSearchContext {
    return {
      apiKey: this.resolveApiKey(false),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/v2/search'),
      requestBody: FirecrawlSearchRequestSchema.parse({
        query,
        limit: config.maxResults,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: FirecrawlSearchContext) {
    return this.requestJson({
      body: context.requestBody,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
      },
      operation: 'search',
      responseSchema: FirecrawlSearchResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: FirecrawlSearchContext,
    searchPayload: z.infer<typeof FirecrawlSearchResponseSchema>,
  ): WebSearchResponse {
    if (searchPayload.success === false) {
      throw new Error(`Firecrawl search failed: ${searchPayload.error ?? 'unknown error'}`);
    }

    const webResults = searchPayload.data?.web ?? [];

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: webResults.slice(0, context.maxResults).map((item) => ({
        title: item.title?.trim() || '',
        content: item.markdown?.trim() || item.description?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      })),
    };
  }

  private prepareScrapeContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): FirecrawlScrapeContext {
    const url = query.trim();

    return {
      apiKey: this.resolveApiKey(false),
      query: url,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('fetchUrls', '/v2/scrape'),
      requestBody: FirecrawlScrapeRequestSchema.parse({ url, formats: ['markdown'] }),
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeScrape(context: FirecrawlScrapeContext) {
    return this.requestJson({
      body: context.requestBody,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
      },
      operation: 'scrape',
      responseSchema: FirecrawlScrapeResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private buildScrapeResponse(
    context: FirecrawlScrapeContext,
    scrapePayload: z.infer<typeof FirecrawlScrapeResponseSchema>,
  ): WebSearchResponse {
    if (scrapePayload.success === false) {
      throw new Error(`Firecrawl scrape failed: ${scrapePayload.error ?? 'unknown error'}`);
    }

    const content = scrapePayload.data?.markdown?.trim() || '';
    if (!content) {
      throw new Error(`Firecrawl scrape returned empty content for ${context.query}`);
    }

    const metadata = scrapePayload.data?.metadata;
    const title = Array.isArray(metadata?.title) ? metadata.title[0] : metadata?.title;

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'fetchUrls',
      inputs: [context.query],
      results: [
        {
          title: title?.trim() || context.query,
          content,
          url: metadata?.sourceURL || context.query,
          sourceInput: context.query,
        },
      ],
    };
  }
}
