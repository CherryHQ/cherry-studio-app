import { queryOptions, skipToken } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { queryKeys } from '@/frontend/data';
import type { AppUpdateModule, AppUpdateRelease } from '@/shared/contracts/appUpdate';

/** About and user-initiated updates share release discovery for the installed channel. */
export function appUpdateQueryOptions(
  appUpdate: AppUpdateModule,
  { force = false }: { force?: boolean } = {},
) {
  return queryOptions({
    queryKey: queryKeys.appUpdate.latest(appUpdate.channel),
    queryFn: ({ signal }) => appUpdate.check(signal, { force }),
    enabled: appUpdate.isEnabled,
    staleTime: force ? 0 : 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    // The backend owns failure cooldowns; an immediate retry only consumes the same quota.
    retry: false,
  });
}

/** Notes may be corrected after publication, so refresh them after six hours. */
export function appUpdateReleaseNotesQueryOptions(
  appUpdate: AppUpdateModule,
  release: AppUpdateRelease | null,
  language: string,
) {
  return queryOptions({
    queryKey: queryKeys.appUpdate.notes(release, language),
    queryFn: release ? () => appUpdate.releaseNotes(release, language) : skipToken,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
  });
}

/** React adapter for the backend-owned transfer; components never duplicate subscription plumbing. */
export function useAppUpdateDownload(appUpdate: AppUpdateModule) {
  return useSyncExternalStore(
    appUpdate.subscribeDownload,
    appUpdate.getDownload,
    appUpdate.getDownload,
  );
}
