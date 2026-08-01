import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';
import { resolveProviderApiHost } from '../../utils/provider';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';
import { assertRecord, readObjectArray, readOptionalString } from './schemaUtils';

type ZhipuWebSearchRequest = {
  search_query: string;
  search_engine: string;
  search_intent: boolean;
};

type ZhipuWebSearchResponse = {
  search_result: {
    title?: string;
    content?: string;
    link?: string;
  }[];
};

type ZhipuSearchContext = ApiKeyRequestSearchContext<ZhipuWebSearchRequest>;

export class ZhipuProvider extends BaseWebSearchProvider {
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
  ): ZhipuSearchContext {
    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: resolveProviderApiHost(this.provider, 'searchKeywords'),
      requestBody: {
        search_query: query,
        search_engine: 'search_std',
        search_intent: false,
      },
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: ZhipuSearchContext): Promise<ZhipuWebSearchResponse> {
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
      await this.throwHttpError('Zhipu search failed', response);
    }

    return this.parseJsonResponse(response, parseZhipuSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: ZhipuSearchContext,
    searchPayload: ZhipuWebSearchResponse,
  ): WebSearchResponse {
    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.search_result.slice(0, context.maxResults).map((result) => ({
        title: result.title?.trim() || '',
        content: result.content?.trim() || '',
        url: result.link || '',
        sourceInput: context.query,
      })),
    };
  }
}

function parseZhipuSearchResponse(payload: unknown): ZhipuWebSearchResponse {
  const record = assertRecord(payload);

  return {
    search_result: readObjectArray(record.search_result ?? [], 'payload.search_result').map(
      (item, index) => ({
        title: readOptionalString(item.title, `payload.search_result[${index}].title`),
        content: readOptionalString(item.content, `payload.search_result[${index}].content`),
        link: readOptionalString(item.link, `payload.search_result[${index}].link`),
      }),
    ),
  };
}
