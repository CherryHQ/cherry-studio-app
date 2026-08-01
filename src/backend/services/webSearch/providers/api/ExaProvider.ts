import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { ApiKeyRequestSearchContext } from '../base/context';
import { assertRecord, readObjectArray, readOptionalString } from './schemaUtils';

type ExaSearchRequest = {
  query: string;
  numResults: number;
  contents: {
    text: boolean;
  };
};

type ExaSearchResponse = {
  results: {
    title?: string | null;
    text?: string;
    url?: string;
  }[];
  autopromptString?: string;
};

type ExaSearchContext = ApiKeyRequestSearchContext<ExaSearchRequest>;

export class ExaProvider extends BaseWebSearchProvider {
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
  ): ExaSearchContext {
    return {
      apiKey: this.resolveApiKey(),
      query,
      maxResults: config.maxResults,
      requestUrl: this.resolveApiUrl('searchKeywords', '/search'),
      requestBody: {
        query,
        numResults: config.maxResults,
        contents: {
          text: true,
        },
      },
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: ExaSearchContext): Promise<ExaSearchResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'POST',
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        'x-api-key': context.apiKey,
      }),
      body: JSON.stringify(context.requestBody),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Exa search failed', response);
    }

    return this.parseJsonResponse(response, parseExaSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private buildFinalResponse(
    context: ExaSearchContext,
    searchPayload: ExaSearchResponse,
  ): WebSearchResponse {
    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: searchPayload.results.slice(0, context.maxResults).map((item) => ({
        title: item.title?.trim() || '',
        content: item.text?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      })),
    };
  }
}

function parseExaSearchResponse(payload: unknown): ExaSearchResponse {
  const record = assertRecord(payload);

  return {
    autopromptString: readOptionalString(record.autopromptString, 'payload.autopromptString'),
    results: readObjectArray(record.results ?? [], 'payload.results').map((item, index) => ({
      title:
        item.title === null
          ? null
          : readOptionalString(item.title, `payload.results[${index}].title`),
      text: readOptionalString(item.text, `payload.results[${index}].text`),
      url: readOptionalString(item.url, `payload.results[${index}].url`),
    })),
  };
}
