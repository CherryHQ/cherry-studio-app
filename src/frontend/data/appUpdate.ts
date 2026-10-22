import { queryOptions } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { AppUpdateModule, AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { appUpdateQueryKeys } from './queryKeys/appUpdate';

/**
 * The app-shell observer owns automatic checks; other surfaces observe or explicitly refetch.
 */
export function appUpdateQueryOptions(appUpdate: AppUpdateModule) {
  return queryOptions({
    queryKey: appUpdateQueryKeys.latest(appUpdate.channel),
    queryFn: ({ signal }) => appUpdate.check(signal),
    enabled: appUpdate.isEnabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
}

/** A published version's notes never change, so one lookup per release and language suffices. */
export function appUpdateReleaseNotesQueryOptions(
  appUpdate: AppUpdateModule,
  release: AppUpdateRelease,
  language: string,
) {
  return queryOptions({
    queryKey: appUpdateQueryKeys.notes(release.id, language),
    queryFn: () => appUpdate.releaseNotes(release, language),
    staleTime: Infinity,
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
