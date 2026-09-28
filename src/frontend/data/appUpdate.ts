import { queryOptions } from '@tanstack/react-query';

import type { AppUpdateModule } from '@/shared/contracts/appUpdate';

import { appUpdateQueryKeys } from './queryKeys/appUpdate';

/**
 * Shared by the startup observer and the settings row. Startup owns the automatic check;
 * settings subscribes with `enabled: false` and only refetches on an explicit tap.
 */
export function appUpdateQueryOptions(appUpdate: AppUpdateModule) {
  return queryOptions({
    queryKey: appUpdateQueryKeys.latest(),
    queryFn: ({ signal }) => appUpdate.check(signal),
    enabled: appUpdate.isEnabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
}
