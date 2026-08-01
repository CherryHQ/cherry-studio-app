import type {
  AddModelInput,
  ModelListQuery,
} from '@cherrystudio/universal/data/api/schemas/models';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type {
  CheckModelsHealthInput,
  ModelHealthResult,
  ModelPullResult,
  ModelsBackend,
  ReconcileModelsInput,
  ReconcileModelsResult,
} from '@/shared/contracts';
import { ModelPullTimeoutError } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

const defaultPullTimeoutMs = 10_000;
const defaultHealthTimeoutMs = 15_000;
const logger = loggerService.withContext('ModelsService');

type RemoteModel = Partial<Model>;

type ModelRepository = {
  add(input: AddModelInput, provider: Provider): Promise<Model>;
  get(id: UniqueModelId): Promise<Model | null>;
  list(query?: ModelListQuery): Promise<Model[]>;
  reconcile(
    providerId: string,
    input: { toAdd: AddModelInput[]; toRemove: UniqueModelId[] },
    provider: Provider,
  ): Promise<{ added: Model[]; removedIds: UniqueModelId[] }>;
  remove(id: UniqueModelId): Promise<boolean>;
};

type ProviderRepository = {
  get(id: string): Promise<Provider>;
  update(id: string, input: { isEnabled: boolean }): Promise<Provider>;
};

type ModelsAi = {
  checkModel(input: {
    apiKeyOverride?: string;
    requestOptions?: { signal?: AbortSignal };
    timeout?: number;
    uniqueModelId: UniqueModelId;
  }): Promise<{ latency: number }>;
  listModels(input: {
    providerId: string;
    requestOptions: { signal: AbortSignal };
    throwOnError: true;
  }): Promise<RemoteModel[]>;
};

export type ModelsServiceDependencies = {
  ai: ModelsAi;
  materializeRemoteModels(provider: Provider, models: readonly RemoteModel[]): Model[];
  models: ModelRepository;
  providers: ProviderRepository;
  pullTimeoutMs?: number;
};

export class ModelsService implements ModelsBackend {
  constructor(private readonly dependencies: ModelsServiceDependencies) {}

  async add(inputs: readonly AddModelInput[]): Promise<Model[]> {
    const providers = new Map<string, Provider>();
    const added: Model[] = [];

    for (const input of inputs) {
      let provider = providers.get(input.providerId);
      if (!provider) {
        // Sequential writes preserve the repository's order-key invariant.
        provider = await this.dependencies.providers.get(input.providerId);
        providers.set(input.providerId, provider);
      }
      added.push(await this.dependencies.models.add(input, provider));
    }

    return added;
  }

  async checkHealth(input: CheckModelsHealthInput): Promise<ModelHealthResult[]> {
    const models = await Promise.all(input.modelIds.map((id) => this.requireModel(id)));
    const results: ModelHealthResult[] = [];

    for (const [index, model] of models.entries()) {
      throwIfAborted(input.signal);

      let result: ModelHealthResult;
      try {
        const { latency } = await this.dependencies.ai.checkModel({
          ...(input.apiKey !== undefined && { apiKeyOverride: input.apiKey }),
          ...(input.signal && { requestOptions: { signal: input.signal } }),
          timeout: input.timeoutMs ?? defaultHealthTimeoutMs,
          uniqueModelId: model.id,
        });
        throwIfAborted(input.signal);
        result = { latency, model, status: 'success' };
      } catch (error) {
        if (input.signal?.aborted) {
          throw error;
        }
        result = { error: errorMessage(error), model, status: 'failed' };
      }

      results[index] = result;
      input.onResult?.(result, index);
    }

    if (results.length > 0 && results.every((result) => result.status === 'success')) {
      const provider = await this.dependencies.providers.get(input.providerId);
      await this.enableProviderWhenModelsAvailable(provider, models.length, 'health-check');
    }

    return results;
  }

  get(id: UniqueModelId): Promise<Model | null> {
    return this.dependencies.models.get(id);
  }

  list(query?: ModelListQuery): Promise<Model[]> {
    return this.dependencies.models.list(query);
  }

  async pull(providerId: string, signal?: AbortSignal): Promise<ModelPullResult> {
    const provider = await this.dependencies.providers.get(providerId);
    const [localModels, remoteModels] = await this.runPullRequest(signal, (requestSignal) =>
      Promise.all([
        this.dependencies.models.list({ providerId }),
        this.dependencies.ai.listModels({
          providerId,
          requestOptions: { signal: requestSignal },
          throwOnError: true,
        }),
      ]),
    );
    const normalizedRemoteModels = this.dependencies.materializeRemoteModels(
      provider,
      remoteModels,
    );
    const preview = buildPullPreview(providerId, localModels, normalizedRemoteModels);

    if (preview.added.length > 0 || preview.missing.length > 0) {
      return { preview, status: 'changes' };
    }

    const providerEnabled = await this.enableProviderWhenModelsAvailable(
      provider,
      localModels.length,
      'pull-up-to-date',
    );
    return { providerEnabled, status: 'up-to-date' };
  }

  async reconcile(providerId: string, input: ReconcileModelsInput): Promise<ReconcileModelsResult> {
    const provider = await this.dependencies.providers.get(providerId);
    const result = await this.dependencies.models.reconcile(
      providerId,
      {
        toAdd: (input.toAdd ?? []).map(modelToAddInput),
        toRemove: [...(input.toRemove ?? [])],
      },
      provider,
    );
    const providerEnabled = await this.enableProviderWhenModelsAvailable(
      provider,
      result.added.length,
      'reconcile',
    );

    return { ...result, providerEnabled };
  }

  remove(id: UniqueModelId): Promise<boolean> {
    return this.dependencies.models.remove(id);
  }

  private async requireModel(id: UniqueModelId): Promise<Model> {
    const model = await this.dependencies.models.get(id);
    if (!model) {
      throw new Error(`Model not found: ${id}`);
    }
    return model;
  }

  private async enableProviderWhenModelsAvailable(
    provider: Pick<Provider, 'id' | 'isEnabled'>,
    modelCount: number,
    source: string,
  ): Promise<boolean> {
    if (provider.isEnabled || modelCount <= 0) {
      return false;
    }

    try {
      await this.dependencies.providers.update(provider.id, { isEnabled: true });
      return true;
    } catch (error) {
      logger.error('Failed to enable provider when models are available', toError(error), {
        modelCount,
        providerId: provider.id,
        source,
      });
      return false;
    }
  }

  private async runPullRequest<T>(
    signal: AbortSignal | undefined,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    throwIfAborted(signal);

    const controller = new AbortController();
    const timeoutMs = this.dependencies.pullTimeoutMs ?? defaultPullTimeoutMs;
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', forwardAbort, { once: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new ModelPullTimeoutError(timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([request(controller.signal), timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}

function buildPullPreview(
  providerId: string,
  localModels: readonly Model[],
  remoteModels: readonly Model[],
) {
  const localIds = new Set(localModels.map((model) => model.id));
  const remoteIds = new Set(remoteModels.map((model) => model.id));

  return {
    added: remoteModels.filter((model) => !localIds.has(model.id)),
    missing: localModels.filter(
      (model) =>
        model.providerId === providerId &&
        !remoteIds.has(model.id) &&
        model.presetModelId != null &&
        model.presetModelId !== '',
    ),
  };
}

function modelToAddInput(model: Model): AddModelInput {
  return {
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    description: model.description,
    endpointTypes: model.endpointTypes,
    group: model.group,
    inputModalities: model.inputModalities,
    isDeprecated: model.isDeprecated,
    isEnabled: model.isEnabled,
    isHidden: model.isHidden,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    modelId: model.modelId,
    name: model.name,
    outputModalities: model.outputModalities,
    ownedBy: model.ownedBy,
    parameters: model.parameters,
    presetModelId: model.presetModelId ?? undefined,
    pricing: model.pricing,
    providerId: model.providerId,
    reasoning: model.reasoning,
    supportsStreaming: model.supportsStreaming,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Provider model operation aborted');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
