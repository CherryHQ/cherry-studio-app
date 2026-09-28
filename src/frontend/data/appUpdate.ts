import { queryOptions } from '@tanstack/react-query';

import type { AppUpdateModule } from '@/shared/contracts/appUpdate';

/** Startup owns fetching; settings can subscribe with enabled: false without initiating checks. */
export function appUpdateQueryOptions(appUpdate: AppUpdateModule) {
  return queryOptions({
    queryKey: ['appUpdate', 'gitcode'],
    queryFn: ({ signal }) => appUpdate.check(signal),
    enabled: appUpdate.isEnabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
