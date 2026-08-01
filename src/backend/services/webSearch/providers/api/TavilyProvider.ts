import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';

import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';
import { assertRecord, readObjectArray, readOptionalString, readString } from './schemaUtils';

type TavilySearchRequest = {
  query: string;
  max_results: number;
};

type TavilySearchResponse = {
  query: string;
  request_id?: string;
  response_time?: number | string;
  results: {
    title?: string;
    content?: string;
    url?: string;
  }[];
};

type TavilySearchContext = ApiKeyRequestSearchContext<TavilySearchRequest>;

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
      requestBody: {
        query,
        max_results: config.maxResults,
      },
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: TavilySearchContext): Promise<TavilySearchResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'POST',
      headers: this.buildHeaders({
        Authorization: `Bearer ${context.apiKey}`,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(context.requestBody),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Tavily search failed', response);
    }

    return this.parseJsonResponse(response, parseTavilySearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: TavilySearchContext,
    searchPayload: TavilySearchResponse,
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

function parseTavilySearchResponse(payload: unknown): TavilySearchResponse {
  const record = assertRecord(payload);

  return {
    query: readString(record.query, 'payload.query'),
    request_id: readOptionalString(record.request_id, 'payload.request_id'),
    response_time:
      typeof record.response_time === 'number' || typeof record.response_time === 'string'
        ? record.response_time
        : undefined,
    results: readObjectArray(record.results ?? [], 'payload.results').map((item, index) => ({
      title: readOptionalString(item.title, `payload.results[${index}].title`),
      content: readOptionalString(item.content, `payload.results[${index}].content`),
      url: readOptionalString(item.url, `payload.results[${index}].url`),
    })),
  };
}
