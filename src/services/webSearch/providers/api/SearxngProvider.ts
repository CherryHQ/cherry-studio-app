import { loggerService } from '@/core/logger/LoggerService';
import type { WebSearchExecutionConfig, WebSearchResponse } from '@/data/types/webSearch';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { UrlSearchContext } from '../base/context';
import { assertRecord, readObjectArray, readOptionalString } from './schemaUtils';

const logger = loggerService.withContext('SearxngProvider');

type SearxngSearchResponse = {
  query?: string;
  results: Array<{
    title?: string;
    content?: string;
    snippet?: string;
    url?: string;
  }>;
};

function trimStringList(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function encodeBasicAuth(username: string, password: string): string {
  const raw = `${username}:${password}`;

  if (typeof btoa === 'function') {
    return btoa(raw);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw).toString('base64');
  }

  throw new Error('Basic auth encoding is not available in this runtime');
}

export class SearxngProvider extends BaseWebSearchProvider {
  private getBasicAuthHeaders(): Record<string, string> {
    const basicAuthUsername = this.provider.basicAuthUsername.trim();
    if (!basicAuthUsername) {
      return {};
    }
    const basicAuthPassword = this.provider.basicAuthPassword.trim();

    return {
      Authorization: `Basic ${encodeBasicAuth(basicAuthUsername, basicAuthPassword)}`,
    };
  }

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
  ): UrlSearchContext {
    const searchParams = new URLSearchParams({
      q: query,
      language: 'auto',
      format: 'json',
    });
    const configuredEngines = trimStringList(this.provider.engines);
    if (configuredEngines.length > 0) {
      searchParams.set('engines', configuredEngines.join(','));
    }

    return {
      query,
      maxResults: config.maxResults,
      searchUrl: `${this.resolveApiUrl('searchKeywords', '/search')}?${searchParams.toString()}`,
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearch(context: UrlSearchContext): Promise<SearxngSearchResponse> {
    const response = await fetch(context.searchUrl, {
      method: 'GET',
      headers: this.buildHeaders(this.getBasicAuthHeaders()),
      signal: context.signal,
    });

    if (!response.ok) {
      await this.throwHttpError('Searxng search failed', response);
    }

    return this.parseJsonResponse(response, parseSearxngSearchResponse, {
      operation: 'search',
      requestUrl: context.searchUrl,
    });
  }

  private buildFinalResponse(
    context: UrlSearchContext,
    searchPayload: SearxngSearchResponse,
  ): WebSearchResponse {
    const results = searchPayload.results
      .filter((item) => item.url?.trim())
      .slice(0, context.maxResults)
      .map((item) => ({
        title: item.title?.trim() || '',
        content: item.content?.trim() || item.snippet?.trim() || '',
        url: item.url || '',
        sourceInput: context.query,
      }));

    if (results.length === 0 && searchPayload.results.length > 0) {
      logger.warn('All Searxng search URLs failed validation', {
        query: context.query,
        total: searchPayload.results.length,
      });
    }

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results,
    };
  }
}

function parseSearxngSearchResponse(payload: unknown): SearxngSearchResponse {
  const record = assertRecord(payload);

  return {
    query: readOptionalString(record.query, 'payload.query'),
    results: readObjectArray(record.results ?? [], 'payload.results').map((item, index) => ({
      title: readOptionalString(item.title, `payload.results[${index}].title`),
      content: readOptionalString(item.content, `payload.results[${index}].content`),
      snippet: readOptionalString(item.snippet, `payload.results[${index}].snippet`),
      url: readOptionalString(item.url, `payload.results[${index}].url`),
    })),
  };
}
