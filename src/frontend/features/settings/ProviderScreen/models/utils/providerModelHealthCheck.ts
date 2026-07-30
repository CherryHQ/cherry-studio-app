import type { ModelHealthResult } from '@/shared/contracts';
import type { Model } from '@/shared/data/types/model';

export const providerModelCheckTimeoutMs = 15_000;

export type ProviderModelHealthCheckStatus = ModelHealthResult;

export function createProviderModelHealthPendingStatuses(
  models: readonly Model[],
): ProviderModelHealthCheckStatus[] {
  return models.map((model) => ({ model, status: 'pending' }));
}
