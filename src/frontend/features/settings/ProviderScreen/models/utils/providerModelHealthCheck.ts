import type { Model } from '@cherrystudio/universal/data/types/model';

import type { ModelHealthResult } from '@/shared/contracts';

export const providerModelCheckTimeoutMs = 15_000;

export type ProviderModelHealthCheckStatus = ModelHealthResult;

export function createProviderModelHealthPendingStatuses(
  models: readonly Model[],
): ProviderModelHealthCheckStatus[] {
  return models.map((model) => ({ model, status: 'pending' }));
}
