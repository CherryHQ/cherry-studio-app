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
  ModelsModule,
  ReconcileModelsInput,
  ReconcileModelsResult,
} from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { buildModelPullPreview } from './buildModelPullPreview';
import type { ModelCatalogService } from './ModelCatalogService';

const defaultHealthTimeoutMs = 15_000;
const logger = loggerService.withContext('ModelsModule');

type ModelWorkflowData = {
  get(id: UniqueModelId): Promise<Model | null>;
  list(query?: ModelListQuery): Promise<Model[]>;
  reconcile(
    providerId: string,
    input: { toAdd: AddModelInput[]; toRemove: UniqueModelId[] },
    provider: Provider,
  ): Promise<{ added: Model[]; removedIds: UniqueModelId[] }>;
};

type ProviderWorkflowData = {
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
};

export type ModelsModuleDependencies = {
  ai: ModelsAi;
  catalog: Pick<ModelCatalogService, 'list'>;
  models: ModelWorkflowData;
  providers: ProviderWorkflowData;
};

export function createModelsModule(dependencies: ModelsModuleDependencies): ModelsModule {
  const requireModel = async (id: UniqueModelId): Promise<Model> => {
    const model = await dependencies.models.get(id);
    if (!model) {
      throw new Error(`Model not found: ${id}`);
    }
    return model;
  };

  const enableProviderWhenModelsAvailable = async (
    provider: Pick<Provider, 'id' | 'isEnabled'>,
    modelCount: number,
    source: string,
  ): Promise<boolean> => {
    if (provider.isEnabled || modelCount <= 0) {
      return false;
    }

    try {
      await dependencies.providers.update(provider.id, { isEnabled: true });
      return true;
    } catch (error) {
      logger.error('Failed to enable provider when models are available', toError(error), {
        modelCount,
        providerId: provider.id,
        source,
      });
      return false;
    }
  };

  const checkHealth = async (input: CheckModelsHealthInput): Promise<ModelHealthResult[]> => {
    const models = await Promise.all(input.modelIds.map(requireModel));
    const results: ModelHealthResult[] = [];

    for (const [index, model] of models.entries()) {
      throwIfAborted(input.signal);

      let result: ModelHealthResult;
      try {
        const { latency } = await dependencies.ai.checkModel({
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
      const provider = await dependencies.providers.get(input.providerId);
      await enableProviderWhenModelsAvailable(provider, models.length, 'health-check');
    }

    return results;
  };

  const pull = async (providerId: string, signal?: AbortSignal): Promise<ModelPullResult> => {
    const provider = await dependencies.providers.get(providerId);
    const [localModels, catalog] = await Promise.all([
      dependencies.models.list({ providerId }),
      dependencies.catalog.list({ provider, signal }),
    ]);
    const preview = buildModelPullPreview(providerId, localModels, catalog.models);

    if (preview.added.length > 0 || preview.missing.length > 0) {
      return { preview, status: 'changes' };
    }

    const providerEnabled = await enableProviderWhenModelsAvailable(
      provider,
      localModels.length,
      'pull-up-to-date',
    );
    return { providerEnabled, status: 'up-to-date' };
  };

  const reconcile = async (
    providerId: string,
    input: ReconcileModelsInput,
  ): Promise<ReconcileModelsResult> => {
    const provider = await dependencies.providers.get(providerId);
    const result = await dependencies.models.reconcile(
      providerId,
      {
        toAdd: (input.toAdd ?? []).map(modelToAddInput),
        toRemove: [...(input.toRemove ?? [])],
      },
      provider,
    );
    const providerEnabled = await enableProviderWhenModelsAvailable(
      provider,
      result.added.length,
      'reconcile',
    );

    return { ...result, providerEnabled };
  };

  return { checkHealth, pull, reconcile };
}

export function modelToAddInput(model: Model): AddModelInput {
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
