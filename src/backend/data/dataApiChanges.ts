/**
 * Change bus for Data API endpoint caches.
 *
 * A backend writer publishes the endpoint paths whose cached reads its committed
 * write invalidated, after the transaction commits. `DataApiService` exposes the
 * subscription as `ApiClient.subscribeChanges`, and the frontend turns each
 * batch into query invalidation. Any persistence service may publish here; the
 * bus does not know who wrote. The bus is process-wide; subscribers own cleanup
 * (the frontend provider on unmount).
 */

import { Emitter } from '@/backend/core/lifecycle/event';
import type { ApiClient } from '@/shared/data/api/types';

const changes = new Emitter<readonly string[]>();

export function publishDataApiChanges(paths: readonly string[]): void {
  if (paths.length === 0) return;
  changes.fire(paths);
}

export const subscribeDataApiChanges: NonNullable<ApiClient['subscribeChanges']> = (listener) => {
  const subscription = changes.event(listener);
  return () => subscription.dispose();
};
