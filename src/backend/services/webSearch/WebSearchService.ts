import { BaseService, DependsOn, Injectable } from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
  WebSearchExecutionConfig,
  WebSearchFetchUrlsRequest,
  WebSearchResponse,
  WebSearchSearchKeywordsRequest,
} from '@/shared/data/types/webSearch';

import { postProcessWebSearchResponse } from './postProcessing';
import type { WebSearchProviderDriver } from './providers/factory';
import { createWebSearchProvider } from './providers/factory';
import { getProviderForCapability, getRuntimeConfig } from './utils/config';
import { isAbortError } from './utils/errors';
import { normalizeWebSearchKeywords, normalizeWebSearchUrls } from './utils/input';
import { ApiKeyRotationState } from './utils/provider';
import { WebSearchConfigError } from './WebSearchConfigError';

const logger = loggerService.withContext('WebSearchService');

type RunCapabilityRequest = {
  providerId?: WebSearchProvider['id'];
  capability: WebSearchCapability;
  inputs: string[];
};

type PreparedWebSearchContext = {
  inputs: string[];
  runtimeConfig: WebSearchExecutionConfig;
  provider: WebSearchProvider;
  providerDriver: WebSearchProviderDriver;
  capability: WebSearchCapability;
};

@Injectable('WebSearchService')
@DependsOn(['PreferenceService'])
export class WebSearchService extends BaseService {
  private readonly apiKeyRotationState = new ApiKeyRotationState();

  constructor(private readonly preferenceService: PreferenceService) {
    super();
  }

  protected onStop(): void {
    this.apiKeyRotationState.clear();
  }

  private async prepareContext(request: RunCapabilityRequest): Promise<PreparedWebSearchContext> {
    const [provider, runtimeConfig] = await Promise.all([
      getProviderForCapability(request.providerId, request.capability, this.preferenceService),
      getRuntimeConfig(this.preferenceService),
    ]);

    const providerDriver = createWebSearchProvider(provider, this.apiKeyRotationState);

    return {
      inputs: request.inputs,
      runtimeConfig,
      provider,
      providerDriver,
      capability: request.capability,
    };
  }

  private async executeCapability(
    context: PreparedWebSearchContext,
    httpOptions?: RequestInit,
  ): Promise<PromiseSettledResult<WebSearchResponse>[]> {
    const capabilityRunner = context.providerDriver[context.capability];

    if (!capabilityRunner) {
      throw new WebSearchConfigError(
        'capability_unsupported',
        `Web search provider ${context.provider.id} does not implement capability ${context.capability}`,
      );
    }

    return Promise.allSettled(
      context.inputs.map((input) =>
        capabilityRunner.call(context.providerDriver, input, context.runtimeConfig, httpOptions),
      ),
    );
  }

  private async buildFinalResponse(
    context: PreparedWebSearchContext,
    searchResults: PromiseSettledResult<WebSearchResponse>[],
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const abortedSearch = searchResults.find(
      (item): item is PromiseRejectedResult =>
        item.status === 'rejected' && isAbortError(item.reason),
    );

    if (abortedSearch && httpOptions?.signal?.aborted) {
      throw abortedSearch.reason;
    }

    searchResults.forEach((item, index) => {
      if (item.status === 'rejected') {
        logger.warn('Partial web search input failed', {
          providerId: context.provider.id,
          capability: context.capability,
          input: context.inputs[index],
          error: item.reason instanceof Error ? item.reason.message : String(item.reason),
        });
      }
    });

    const successfulSearches = searchResults.filter(
      (item): item is PromiseFulfilledResult<WebSearchResponse> => item.status === 'fulfilled',
    );

    if (successfulSearches.length === 0) {
      const firstRejected = searchResults.find((item) => item.status === 'rejected');
      throw firstRejected?.reason ?? new Error('Web search failed with no successful results');
    }

    const mergedResponse: WebSearchResponse = {
      query: context.inputs.join(' | '),
      providerId: context.provider.id,
      capability: context.capability,
      inputs: context.inputs,
      results: successfulSearches.flatMap((item) => item.value.results),
    };

    const postProcessed = await postProcessWebSearchResponse(mergedResponse, context.runtimeConfig);

    return postProcessed.response;
  }

  private async runCapability(
    request: RunCapabilityRequest,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    let context: PreparedWebSearchContext | undefined;

    try {
      context = await this.prepareContext(request);
      const searchResults = await this.executeCapability(context, httpOptions);
      return await this.buildFinalResponse(context, searchResults, httpOptions);
    } catch (error) {
      if (!isAbortError(error) || !httpOptions?.signal?.aborted) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        logger.error('Web search failed', normalizedError, {
          providerId: context?.provider.id ?? request.providerId,
          capability: context?.capability ?? request.capability,
        });
      }
      throw error;
    }
  }

  async searchKeywords(
    request: WebSearchSearchKeywordsRequest,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    return this.runCapability(
      {
        providerId: request.providerId,
        capability: 'searchKeywords',
        inputs: normalizeWebSearchKeywords(request.keywords),
      },
      httpOptions,
    );
  }

  async fetchUrls(
    request: WebSearchFetchUrlsRequest,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    return this.runCapability(
      {
        providerId: request.providerId,
        capability: 'fetchUrls',
        inputs: normalizeWebSearchUrls(request.urls),
      },
      httpOptions,
    );
  }

  async checkProvider(
    request: WebSearchCheckProviderRequest,
    httpOptions?: RequestInit,
  ): Promise<WebSearchCheckProviderResponse> {
    const capability = request.capability ?? 'searchKeywords';

    try {
      const driver = createWebSearchProvider(request.provider, this.apiKeyRotationState);
      const runner = driver[capability];
      if (!runner) {
        return {
          valid: false,
          error: `Provider ${request.provider.id} does not implement capability ${capability}`,
        };
      }

      const probe = capability === 'searchKeywords' ? 'test query' : 'https://example.com';
      const runtimeConfig = await getRuntimeConfig(this.preferenceService);
      await runner.call(driver, probe, runtimeConfig, httpOptions);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
