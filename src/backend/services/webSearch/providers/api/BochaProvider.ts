import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';

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

type BochaSearchRequest = {
  query: string;
  count: number;
  exclude: string;
  summary: boolean;
};

type BochaSearchResponse = {
  code: number;
  msg: string;
  data: {
    queryContext: {
      originalQuery: string;
    };
    webPages: {
      value: {
        name: string;
        summary?: string;
        snippet?: string;
        url: string;
      }[];
    };
  };
};

type BochaSearchContext = ApiKeyRequestSearchContext<BochaSearchRequest>;

export class BochaProvider extends BaseWebSearchProvider {
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
  ): BochaSearchContext {
    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/v1/web-search'),
      requestBody: {
        query,
        count: config.maxResults,
        exclude: config.excludeDomains.join(','),
        summary: true,
      },
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: BochaSearchContext): Promise<BochaSearchResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'POST',
      body: JSON.stringify(context.requestBody),
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.apiKey}`,
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Bocha search failed', response);
    }

    return this.parseJsonResponse(response, parseBochaSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: BochaSearchContext,
    searchPayload: BochaSearchResponse,
  ): WebSearchResponse {
    if (searchPayload.code !== 200) {
      throw new Error(`Bocha search failed: ${searchPayload.msg}`);
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.data.webPages.value.map((result) => ({
        title: result.name,
        content: result.summary || result.snippet || '',
        url: result.url,
        sourceInput: context.query,
      })),
    };
  }
}

function parseBochaSearchResponse(payload: unknown): BochaSearchResponse {
  const record = assertRecord(payload);
  const data = readObject(record.data, 'payload.data');
  const queryContext = readObject(data.queryContext, 'payload.data.queryContext');
  const webPages = readObject(data.webPages, 'payload.data.webPages');

  return {
    code: readNumber(record.code, 'payload.code'),
    msg: readString(record.msg, 'payload.msg'),
    data: {
      queryContext: {
        originalQuery: readString(
          queryContext.originalQuery,
          'payload.data.queryContext.originalQuery',
        ),
      },
      webPages: {
        value: readObjectArray(webPages.value, 'payload.data.webPages.value').map(
          (item, index) => ({
            name: readString(item.name, `payload.data.webPages.value[${index}].name`),
            summary: readOptionalString(
              item.summary,
              `payload.data.webPages.value[${index}].summary`,
            ),
            snippet: readOptionalString(
              item.snippet,
              `payload.data.webPages.value[${index}].snippet`,
            ),
            url: readString(item.url, `payload.data.webPages.value[${index}].url`),
          }),
        ),
      },
    },
  };
}
