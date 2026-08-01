import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';
import {
  assertRecord,
  readObjectArray,
  readOptionalBoolean,
  readOptionalObject,
  readOptionalString,
} from './schemaUtils';

type FirecrawlSearchRequest = {
  query: string;
  limit: number;
  scrapeOptions: {
    formats: string[];
  };
};

type FirecrawlSearchResponse = {
  success?: boolean;
  error?: string;
  web: {
    title?: string;
    markdown?: string;
    description?: string;
    url?: string;
  }[];
};

type FirecrawlSearchContext = ApiKeyRequestSearchContext<FirecrawlSearchRequest>;

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
      requestBody: {
        query,
        limit: config.maxResults,
        scrapeOptions: {
          formats: ['markdown'],
        },
      },
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: FirecrawlSearchContext): Promise<FirecrawlSearchResponse> {
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

    if (context.apiKey) {
      headers.set('Authorization', `Bearer ${context.apiKey}`);
    }

    const response = await fetch(context.requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(context.requestBody),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Firecrawl search failed', response);
    }

    return this.parseJsonResponse(response, parseFirecrawlSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: FirecrawlSearchContext,
    searchPayload: FirecrawlSearchResponse,
  ): WebSearchResponse {
    if (searchPayload.success === false) {
      throw new Error(`Firecrawl search failed: ${searchPayload.error ?? 'unknown error'}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.web.slice(0, context.maxResults).map((item) => ({
        title: item.title?.trim() || '',
        content: item.markdown?.trim() || item.description?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      })),
    };
  }
}

function parseFirecrawlSearchResponse(payload: unknown): FirecrawlSearchResponse {
  const record = assertRecord(payload);
  const data = readOptionalObject(record.data, 'payload.data');

  return {
    success: readOptionalBoolean(record.success, 'payload.success'),
    error: readOptionalString(record.error, 'payload.error'),
    web: readObjectArray(data?.web ?? [], 'payload.data.web').map((item, index) => ({
      title: readOptionalString(item.title, `payload.data.web[${index}].title`),
      markdown: readOptionalString(item.markdown, `payload.data.web[${index}].markdown`),
      description: readOptionalString(item.description, `payload.data.web[${index}].description`),
      url: readOptionalString(item.url, `payload.data.web[${index}].url`),
    })),
  };
}
