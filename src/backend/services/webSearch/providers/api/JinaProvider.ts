import * as z from 'zod';

import { isDeviceRegionMainlandChina } from '@/backend/services/device';
import { HttpError } from '@/backend/services/http';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type {
  WebSearchCapability,
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@/shared/data/types/webSearch';

import { resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { BaseSearchContext } from '../base/context';

const JinaReaderResponseSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).optional(),
  status: z.union([z.number(), z.string()]).optional(),
  data: z
    .looseObject({
      title: z.string().optional(),
      content: z.string().optional(),
      text: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

const JinaSearchResponseSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).optional(),
  status: z.union([z.number(), z.string()]).optional(),
  data: z
    .array(
      z.looseObject({
        title: z.string().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  results: z
    .array(
      z.looseObject({
        title: z.string().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
});

// Jina serves a mirror that stays reachable from mainland China, where the global hosts may not be.
const JINA_MAINLAND_HOST: Record<string, string> = {
  'https://s.jina.ai': 'https://s.jinaai.cn',
  'https://r.jina.ai': 'https://r.jinaai.cn',
};

const logger = loggerService.withContext('JinaProvider');

type JinaContext = BaseSearchContext & {
  apiKey: string;
  requestUrl: string;
  /** The same request on Jina's other built-in host; absent when the user set their own address. */
  alternateRequestUrl?: string;
};

export class JinaProvider extends BaseWebSearchProvider {
  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareSearchKeywordsContext(query, config, httpOptions);
    const payload = await this.requestOnEitherHost(context, (target) =>
      this.executeSearchKeywords(target),
    );

    return this.buildSearchKeywordsResponse(context, payload);
  }

  async fetchUrls(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareFetchUrlsContext(query, config, httpOptions);
    const payload = await this.requestOnEitherHost(context, (target) =>
      this.executeFetchUrls(target),
    );

    return this.buildFetchUrlsResponse(context, payload);
  }

  /**
   * The built-in address follows the device region, global or mainland mirror. A user's own
   * address is used as entered and has no alternate.
   */
  private resolveRequestUrls(capability: WebSearchCapability, path: string) {
    const configuredHost = withoutTrailingSlash(resolveProviderApiHost(this.provider, capability));
    const mainlandHost = JINA_MAINLAND_HOST[configuredHost];
    if (!mainlandHost) return { requestUrl: `${configuredHost}/${path}` };

    const [host, alternateHost] = isDeviceRegionMainlandChina()
      ? [mainlandHost, configuredHost]
      : [configuredHost, mainlandHost];
    return { requestUrl: `${host}/${path}`, alternateRequestUrl: `${alternateHost}/${path}` };
  }

  /**
   * Device settings are only a guess at what the network can reach, so when a built-in host
   * cannot be connected to, the request is sent once to the other. A timeout or an answer from
   * the service is final: the other host would only repeat it.
   */
  private async requestOnEitherHost<TPayload>(
    context: JinaContext,
    execute: (context: JinaContext) => Promise<TPayload>,
  ): Promise<TPayload> {
    try {
      return await execute(context);
    } catch (error) {
      const unreachable = error instanceof HttpError && error.kind === 'network';
      if (!unreachable || !context.alternateRequestUrl || context.signal?.aborted) {
        throw error;
      }

      logger.warn('Jina host unreachable; retrying its alternate built-in host', {
        error: error.message,
      });
      return execute({ ...context, requestUrl: context.alternateRequestUrl });
    }
  }

  private prepareSearchKeywordsContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): JinaContext {
    const normalizedQuery = query.trim();

    return {
      apiKey: this.resolveApiKey(),
      query: normalizedQuery,
      maxResults: config.maxResults,
      ...this.resolveRequestUrls('searchKeywords', encodeURIComponent(normalizedQuery)),
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
      // Jina Reader answers anonymous requests; a key only raises the limits.
      apiKey: this.resolveApiKey(false),
      query: url,
      maxResults: config.maxResults,
      // The reader expects the raw target URL after the host.
      ...this.resolveRequestUrls('fetchUrls', url),
      signal: httpOptions?.signal ?? undefined,
    };
  }

  private async executeSearchKeywords(context: JinaContext) {
    return this.requestJson({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
      },
      operation: 'search',
      responseSchema: JinaSearchResponseSchema,
      signal: context.signal,
      url: context.requestUrl,
    });
  }

  private async executeFetchUrls(context: JinaContext) {
    return this.requestJson({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}),
        'X-Retain-Images': 'none',
      },
      operation: 'reader',
      responseSchema: JinaReaderResponseSchema,
      signal: context.signal,
      // Remote rendering can outlast the shared API client's 30-second default.
      timeoutMs: 60_000,
      url: context.requestUrl,
    });
  }

  private buildSearchKeywordsResponse(
    context: JinaContext,
    payload: z.infer<typeof JinaSearchResponseSchema>,
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
    payload: z.infer<typeof JinaReaderResponseSchema>,
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
