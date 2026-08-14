import type { Model } from '@cherrystudio/universal/data/types/model';
import type { AuthConfig, Provider } from '@cherrystudio/universal/data/types/provider';

import { application } from '@/backend/core/application/Application';
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { materializeRemoteModels } from '@/backend/data/services/materializeRemoteModels';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';
import { COPILOT_PROVIDER_ID } from '@/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter';
import { ModelPullTimeoutError } from '@/shared/contracts';

import { mergeProviderModelsWithRegistry } from './mergeProviderModelsWithRegistry';

const defaultTimeoutMs = 10_000;

type RemoteModel = Partial<Model>;

export type ModelCatalogRequestContext = {
  getAuthConfig(providerId: string): Promise<AuthConfig | undefined>;
  getCopilotToken(headers: Record<string, string>, signal?: AbortSignal): Promise<string>;
  getRotatedApiKey(providerId: string): Promise<string> | string;
  getVertexAuthHeaders(input: {
    projectId: string;
    serviceAccount: { clientEmail: string; privateKey: string };
  }): Promise<Record<string, string>>;
};

export type ModelCatalogApi = {
  getVertexAuthHeaders(
    input: Parameters<ModelCatalogRequestContext['getVertexAuthHeaders']>[0],
  ): Promise<Record<string, string>>;
  listApiModels(
    provider: Provider,
    context: ModelCatalogRequestContext,
    signal: AbortSignal,
  ): Promise<RemoteModel[]>;
};

export type ModelCatalogResult = {
  models: Model[];
  source: 'api' | 'registry';
};

export type ModelCatalogListInput = {
  /** Undefined falls back to the provider's stored key; an empty string is an explicit no-key draft. */
  apiKey?: string;
  /** Undefined falls back to the provider's stored auth configuration. */
  authConfig?: AuthConfig;
  provider: Provider;
  signal?: AbortSignal;
};

export type ModelCatalogDependencies = ModelCatalogApi & {
  getAuthConfig(providerId: string): Promise<AuthConfig | null>;
  getCopilotToken(headers: Record<string, string>, signal?: AbortSignal): Promise<string>;
  getStoredApiKey(providerId: string): Promise<string>;
  listRegistryModels(input: { presetProviderId: string | null; providerId: string }): Model[];
  materialize(provider: Provider, models: readonly RemoteModel[]): Model[];
  timeoutMs: number;
};

@Injectable('ModelCatalogService')
@ServicePhase(Phase.PostReady)
@DependsOn(['ModelCatalogAdapter'])
export class ModelCatalogService extends BaseService {
  private readonly dependencies: ModelCatalogDependencies;

  constructor(
    api: ModelCatalogApi,
    overrides: Partial<Omit<ModelCatalogDependencies, keyof ModelCatalogApi>> = {},
  ) {
    super();
    this.dependencies = {
      getAuthConfig:
        overrides.getAuthConfig ?? ((providerId) => providerService.getAuthConfig(providerId)),
      getCopilotToken:
        overrides.getCopilotToken ??
        ((headers, signal) =>
          application
            .get('ProviderOAuthService')
            .getServingToken(COPILOT_PROVIDER_ID, headers, signal)),
      getStoredApiKey:
        overrides.getStoredApiKey ?? ((providerId) => providerService.getRotatedApiKey(providerId)),
      getVertexAuthHeaders: (input) => api.getVertexAuthHeaders(input),
      listApiModels: (provider, context, signal) => api.listApiModels(provider, context, signal),
      listRegistryModels:
        overrides.listRegistryModels ??
        ((input) => providerRegistryService.listProviderRegistryModels(input)),
      materialize: overrides.materialize ?? materializeRemoteModels,
      timeoutMs: overrides.timeoutMs ?? defaultTimeoutMs,
    };
  }

  async list(input: ModelCatalogListInput): Promise<ModelCatalogResult> {
    throwIfAborted(input.signal);
    const registryModels = this.dependencies.listRegistryModels({
      presetProviderId: input.provider.presetProviderId ?? null,
      providerId: input.provider.id,
    });

    if (input.provider.modelListSource === 'registry') {
      return {
        models: registryModels,
        source: 'registry',
      };
    }

    const remoteModels = await this.runApiRequest(input.signal, (signal) =>
      this.dependencies.listApiModels(
        input.provider,
        {
          getAuthConfig: async (providerId) =>
            input.authConfig ?? (await this.dependencies.getAuthConfig(providerId)) ?? undefined,
          getCopilotToken: this.dependencies.getCopilotToken,
          getRotatedApiKey: (providerId) =>
            input.apiKey !== undefined
              ? input.apiKey
              : this.dependencies.getStoredApiKey(providerId),
          getVertexAuthHeaders: this.dependencies.getVertexAuthHeaders,
        },
        signal,
      ),
    );

    return {
      models: this.dependencies.materialize(
        input.provider,
        mergeProviderModelsWithRegistry(remoteModels, registryModels),
      ),
      source: 'api',
    };
  }

  private async runApiRequest<T>(
    signal: AbortSignal | undefined,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    throwIfAborted(signal);

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', forwardAbort, { once: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new ModelPullTimeoutError(this.dependencies.timeoutMs);
        controller.abort(error);
        reject(error);
      }, this.dependencies.timeoutMs);
    });

    try {
      return await Promise.race([request(controller.signal), timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Provider model operation aborted');
  }
}
