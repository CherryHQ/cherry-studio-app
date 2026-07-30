import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

/**
 * The three lists a change to one provider's models can show up in: the
 * provider's own tab reads the enabled-only list, the pull preview reads the
 * unfiltered one, and the model picker reads every provider's.
 */
export async function refreshProviderModelQueries(queryClient: QueryClient, providerId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.models.list({ providerId }) }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.models.list({ enabled: true, providerId }),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
  ]);
}
