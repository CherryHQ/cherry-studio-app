import * as z from 'zod';

import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';

const QueritSearchParamsSchema = z.object({
  query: z.string(),
  count: z.number().int().positive(),
});

const QueritSearchResponseSchema = z.object({
  error_code: z.number(),
  error_msg: z.string(),
  query_context: z.object({
    query: z.string(),
  }),
  results: z.object({
    result: z
      .array(
        z.looseObject({
          title: z.string().optional(),
          snippet: z.string().optional(),
          url: z.string().optional(),
          site_name: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

const QueritContentsParamsSchema = z.object({
  urls: z.array(z.string()).min(1).max(10),
  format: z.string(),
  extrasMeta: z.boolean(),
});

const QueritContentsResponseSchema = z.object({
  error_code: z.number(),
  error_msg: z.string(),
  results: z
    .array(
      z.object({
        url: z.string().optional(),
        content: z.string().optional(),
        extrasMeta: z
          .looseObject({
            title: z.string().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

const CONTENTS_TIMEOUT_MS = 60_000;

type QueritSearchContext = ApiKeyRequestSearchContext<z.infer<typeof QueritSearchParamsSchema>>;
type QueritContentsContext = ApiKeyRequestSearchContext<z.infer<typeof QueritContentsParamsSchema>>;

export class QueritProvider extends BaseWebSearchProvider {
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
    const context = this.prepareContentsContext(query, config, httpOptions);
    const contentsPayload = await this.executeContents(context);

    return this.buildContentsResponse(context, contentsPayload);
  }

  private prepareSearchContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): QueritSearchContext {
    const requestBody = QueritSearchParamsSchema.parse({
      query,
      count: config.maxResults,
    });

    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/v1/search'),
      requestBody,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: QueritSearchContext) {
    return this.requestJson({
      body: context.requestBody,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.apiKey}`,
      },
      operation: 'search',
      responseSchema: QueritSearchResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: QueritSearchContext,
    searchPayload: z.infer<typeof QueritSearchResponseSchema>,
  ): WebSearchResponse {
    if (searchPayload.error_code !== 200) {
      throw new Error(`Querit search failed: ${searchPayload.error_msg}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      // One result without a URL must not cost the whole result set.
      results: searchPayload.results.result.flatMap((result) => {
        const url = result.url?.trim();
        if (!url) return [];

        return [
          {
            title:
              result.title?.trim() || result.site_name?.trim() || result.snippet?.trim() || url,
            content: result.snippet || '',
            url,
            sourceInput: context.query,
          },
        ];
      }),
    };
  }

  private prepareContentsContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): QueritContentsContext {
    const url = query.trim();

    return {
      apiKey: this.resolveApiKey(),
      query: url,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('fetchUrls', '/v1/contents'),
      requestBody: QueritContentsParamsSchema.parse({
        urls: [url],
        format: 'markdown',
        // Querit only returns the page title when metadata is requested.
        extrasMeta: true,
      }),
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeContents(context: QueritContentsContext) {
    return this.requestJson({
      body: context.requestBody,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.apiKey}`,
      },
      operation: 'contents',
      responseSchema: QueritContentsResponseSchema,
      signal: context.signal,
      timeoutMs: CONTENTS_TIMEOUT_MS,
      url: context.requestUrl,
    });
  }

  private buildContentsResponse(
    context: QueritContentsContext,
    contentsPayload: z.infer<typeof QueritContentsResponseSchema>,
  ): WebSearchResponse {
    if (contentsPayload.error_code !== 200) {
      throw new Error(`Querit contents failed: ${contentsPayload.error_msg}`);
    }

    const page = contentsPayload.results[0];
    const content = page?.content?.trim();

    if (!page || !content) {
      throw new Error(`Querit contents returned empty content for ${context.query}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'fetchUrls',
      inputs: [context.query],
      results: [
        {
          title: page.extrasMeta?.title?.trim() || context.query,
          content,
          url: page.url || context.query,
          sourceInput: context.query,
        },
      ],
    };
  }
}
