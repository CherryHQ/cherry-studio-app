import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';
import { resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { BaseSearchContext } from '../base/context';
import {
  assertRecord,
  readNumberOrString,
  readOptionalObject,
  readOptionalObjectArray,
  readOptionalString,
} from './schemaUtils';

type JinaContext = BaseSearchContext & {
  apiKey: string;
  requestUrl: string;
};

type JinaSearchResult = {
  title?: string;
  content?: string;
  description?: string;
  url?: string;
};

type JinaSearchResponse = {
  code?: number | string;
  status?: number | string;
  data?: JinaSearchResult[];
  results?: JinaSearchResult[];
};

type JinaReaderResponse = {
  code?: number | string;
  status?: number | string;
  data?: {
    title?: string;
    content?: string;
    text?: string;
    url?: string;
  };
  title?: string;
  content?: string;
  text?: string;
  url?: string;
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

  private async executeSearchKeywords(context: JinaContext): Promise<JinaSearchResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'GET',
      headers: this.buildHeaders({
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Jina search failed', response);
    }

    return this.parseJsonResponse(response, parseJinaSearchResponse, {
      operation: 'search',
      requestUrl: context.requestUrl,
    });
  }

  private async executeFetchUrls(context: JinaContext): Promise<JinaReaderResponse> {
    const response = await fetch(context.requestUrl, {
      method: 'GET',
      headers: this.buildHeaders({
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
        'X-Retain-Images': 'none',
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Jina Reader fetch failed', response);
    }

    return this.parseJsonResponse(response, parseJinaReaderResponse, {
      operation: 'reader',
      requestUrl: context.requestUrl,
    });
  }

  private buildSearchKeywordsResponse(
    context: JinaContext,
    payload: JinaSearchResponse,
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
    payload: JinaReaderResponse,
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

function parseJinaSearchResponse(payload: unknown): JinaSearchResponse {
  const record = assertRecord(payload);

  return {
    code: record.code === undefined ? undefined : readNumberOrString(record.code, 'payload.code'),
    status:
      record.status === undefined ? undefined : readNumberOrString(record.status, 'payload.status'),
    data: parseJinaSearchResults(record.data, 'payload.data'),
    results: parseJinaSearchResults(record.results, 'payload.results'),
  };
}

function parseJinaSearchResults(value: unknown, path: string): JinaSearchResult[] | undefined {
  return readOptionalObjectArray(value, path)?.map((item, index) => ({
    title: readOptionalString(item.title, `${path}[${index}].title`),
    content: readOptionalString(item.content, `${path}[${index}].content`),
    description: readOptionalString(item.description, `${path}[${index}].description`),
    url: readOptionalString(item.url, `${path}[${index}].url`),
  }));
}

function parseJinaReaderResponse(payload: unknown): JinaReaderResponse {
  const record = assertRecord(payload);
  const data = readOptionalObject(record.data, 'payload.data');

  return {
    code: record.code === undefined ? undefined : readNumberOrString(record.code, 'payload.code'),
    status:
      record.status === undefined ? undefined : readNumberOrString(record.status, 'payload.status'),
    data: data
      ? {
          title: readOptionalString(data.title, 'payload.data.title'),
          content: readOptionalString(data.content, 'payload.data.content'),
          text: readOptionalString(data.text, 'payload.data.text'),
          url: readOptionalString(data.url, 'payload.data.url'),
        }
      : undefined,
    title: readOptionalString(record.title, 'payload.title'),
    content: readOptionalString(record.content, 'payload.content'),
    text: readOptionalString(record.text, 'payload.text'),
    url: readOptionalString(record.url, 'payload.url'),
  };
}
