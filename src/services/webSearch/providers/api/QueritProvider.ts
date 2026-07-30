import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';
import {
  assertRecord,
  readNumber,
  readObject,
  readObjectArray,
  readOptionalString,
  readString,
} from './schemaUtils';

type QueritSearchRequest = {
  query: string;
  count: number;
  filters?: {
    sites?: {
      exclude: string[];
    };
  };
};

type QueritSearchResponse = {
  error_code: number;
  error_msg: string;
  query_context: {
    query: string;
  };
  results: {
    result: {
      title: string;
      snippet?: string;
      url: string;
    }[];
  };
};

type QueritSearchContext = ApiKeyRequestSearchContext<QueritSearchRequest>;

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

  private prepareSearchContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): QueritSearchContext {
    const requestBody: QueritSearchRequest = {
      query,
      count: config.maxResults,
    };

    if (config.excludeDomains.length > 0) {
      requestBody.filters = {
        sites: {
          exclude: config.excludeDomains,
        },
      };
    }

    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/v1/search'),
      requestBody,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: QueritSearchContext): Promise<QueritSearchResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'POST',
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.apiKey}`,
      }),
      body: JSON.stringify(context.requestBody),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Querit search failed', response);
    }

    return this.parseJsonResponse(response, parseQueritSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: QueritSearchContext,
    searchPayload: QueritSearchResponse,
  ): WebSearchResponse {
    if (searchPayload.error_code !== 200) {
      throw new Error(`Querit search failed: ${searchPayload.error_msg}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.results.result.map((result) => ({
        title: result.title,
        content: result.snippet || '',
        url: result.url,
        sourceInput: context.query,
      })),
    };
  }
}

function parseQueritSearchResponse(payload: unknown): QueritSearchResponse {
  const record = assertRecord(payload);
  const queryContext = readObject(record.query_context, 'payload.query_context');
  const results = readObject(record.results, 'payload.results');

  return {
    error_code: readNumber(record.error_code, 'payload.error_code'),
    error_msg: readString(record.error_msg, 'payload.error_msg'),
    query_context: {
      query: readString(queryContext.query, 'payload.query_context.query'),
    },
    results: {
      result: readObjectArray(results.result ?? [], 'payload.results.result').map(
        (item, index) => ({
          title: readString(item.title, `payload.results.result[${index}].title`),
          snippet: readOptionalString(item.snippet, `payload.results.result[${index}].snippet`),
          url: readString(item.url, `payload.results.result[${index}].url`),
        }),
      ),
    },
  };
}
