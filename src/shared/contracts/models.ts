import type { Model, UniqueModelId } from '@/shared/data/types/model';

export type ModelPullPreview = {
  added: Model[];
  missing: Model[];
};

export type ModelPullResult =
  | { providerEnabled: boolean; status: 'up-to-date' }
  | { preview: ModelPullPreview; status: 'changes' };

export class ModelPullTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Pull models timed out after ${timeoutMs}ms`);
    this.name = 'ModelPullTimeoutError';
  }
}

export function isModelPullTimeoutError(error: unknown): error is ModelPullTimeoutError {
  return error instanceof ModelPullTimeoutError;
}

export type ReconcileModelsInput = {
  toAdd?: readonly Model[];
  toRemove?: readonly UniqueModelId[];
};

export type ReconcileModelsResult = {
  added: Model[];
  providerEnabled: boolean;
  removedIds: UniqueModelId[];
};

export type ModelHealthStatus = 'checking' | 'failed' | 'pending' | 'success';

export type ModelHealthResult = {
  error?: string;
  latency?: number;
  model: Model;
  status: ModelHealthStatus;
};

export type CheckModelsHealthInput = {
  apiKey?: string;
  modelIds: readonly UniqueModelId[];
  onResult?: (result: ModelHealthResult, index: number) => void;
  providerId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export interface ModelsModule {
  checkHealth(input: CheckModelsHealthInput): Promise<ModelHealthResult[]>;
  pull(providerId: string, signal?: AbortSignal): Promise<ModelPullResult>;
  reconcile(providerId: string, input: ReconcileModelsInput): Promise<ReconcileModelsResult>;
}
