import type { Model, UniqueModelId } from '@/shared/domain/model';

export const providerModelCheckTimeoutMs = 15_000;

export type ProviderModelHealthStatus = 'checking' | 'failed' | 'pending' | 'success';

export type ProviderModelHealthCheckStatus = {
  error?: string;
  latency?: number;
  model: Model;
  status: ProviderModelHealthStatus;
};

export type ProviderModelHealthCheckApiKey = {
  id: string;
  key?: string;
};

export type CheckProviderModel = (request: {
  apiKey?: string;
  modelId: UniqueModelId;
  signal?: AbortSignal;
  timeout: number;
}) => Promise<{ latency: number }>;

export type CheckProviderModelsHealthOptions = {
  apiKey?: ProviderModelHealthCheckApiKey | null;
  checkModel: CheckProviderModel;
  models: readonly Model[];
  signal?: AbortSignal;
  timeout?: number;
};

export async function checkProviderModelsHealth(
  options: CheckProviderModelsHealthOptions,
  onModelChecked?: (result: ProviderModelHealthCheckStatus, index: number) => void,
): Promise<ProviderModelHealthCheckStatus[]> {
  const timeout = options.timeout ?? providerModelCheckTimeoutMs;
  const results: ProviderModelHealthCheckStatus[] = [];

  for (let index = 0; index < options.models.length; index++) {
    throwIfProviderModelHealthCheckAborted(options.signal);

    const model = options.models[index];
    if (!model) {
      continue;
    }

    try {
      // react-doctor-disable-next-line async-await-in-loop -- 刻意逐个检查以便逐条回调更新 UI，并避免并发打爆 provider
      const { latency } = await options.checkModel({
        modelId: model.id,
        timeout,
        ...(options.apiKey?.key !== undefined && { apiKey: options.apiKey.key }),
        ...(options.signal && { signal: options.signal }),
      });
      throwIfProviderModelHealthCheckAborted(options.signal);

      const result: ProviderModelHealthCheckStatus = {
        latency,
        model,
        status: 'success',
      };
      results[index] = result;
      onModelChecked?.(result, index);
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }

      const result: ProviderModelHealthCheckStatus = {
        error: serializeProviderModelHealthCheckError(error),
        model,
        status: 'failed',
      };
      results[index] = result;
      onModelChecked?.(result, index);
    }
  }

  return results;
}

export function createProviderModelHealthPendingStatuses(
  models: readonly Model[],
): ProviderModelHealthCheckStatus[] {
  return models.map((model) => ({ model, status: 'pending' }));
}

export function createProviderModelHealthCheckingStatuses(
  models: readonly Model[],
): ProviderModelHealthCheckStatus[] {
  return models.map((model) => ({ model, status: 'checking' }));
}

function serializeProviderModelHealthCheckError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function throwIfProviderModelHealthCheckAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason ?? new Error('Provider model health check aborted');
}
