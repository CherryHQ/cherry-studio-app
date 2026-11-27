import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type ChatRouteParamsInput, parseChatRoute } from '@/frontend/appShell/navigation/chat';
import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { useStartupCoverVisible } from '@/frontend/appShell/startup';
import { useSystemEntryReceiving } from '@/frontend/appShell/systemEntry';
import { queryKeys } from '@/frontend/data';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import { cacheService } from '@/frontend/data/CacheService';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { AppUpdateDialog, type AppUpdateDialogActions } from './AppUpdateDialog';
import { appUpdateQueryOptions } from './appUpdateQueries';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Optional offers belong to the landing chat. An unsupported native version requires a decision
 * on any route, including when release discovery fails or the user returns from the store.
 */
export function AppUpdateObserver({
  actions,
  onOffer,
  release,
}: {
  actions: AppUpdateDialogActions;
  onOffer: (release: AppUpdateRelease) => void;
  release: AppUpdateRelease | null;
}) {
  const appUpdate = useBackendModule('appUpdate');
  const queryClient = useQueryClient();
  const coverVisible = useStartupCoverVisible();
  const privacyPending = usePrivacyConsentPending();
  // An Android share launches the app plainly and reaches the route only after its import.
  const receivingShare = useSystemEntryReceiving();
  const pathname = usePathname();
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const enabled = appUpdate.isEnabled && !privacyPending && active;
  const policy = useQuery({
    queryKey: queryKeys.appUpdate.requiredVersion,
    queryFn: ({ signal }) => appUpdate.refreshRequiredVersion(signal),
    initialData: appUpdate.getRequiredVersion,
    staleTime: 0,
    enabled,
    retry: false,
  });
  const minimum = appUpdate.isEnabled && !privacyPending && !coverVisible ? policy.data : null;
  const { data, status, isFetching, refetch } = useQuery({
    ...appUpdateQueryOptions(appUpdate),
    enabled,
  });
  const settled = useRef(false);
  const route = parseChatRoute(params);
  // A new chat with nothing handed to it; a share or a notification arrives with a target.
  const landing =
    pathname === '/' &&
    (route.status === 'empty' ||
      (route.status === 'ready' &&
        route.target.kind === 'draft' &&
        !route.target.composerHandoff &&
        !route.target.selectionHandoff));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  // The six-hour voluntary check may still refer to a package published before the new minimum.
  useEffect(() => {
    if (minimum && enabled) void refetch({ cancelRefetch: false });
  }, [minimum, enabled, refetch]);

  useEffect(() => {
    if (settled.current || !active || coverVisible) return;
    // Leaving the landing chat, an incoming share, a pending privacy decision, or a failed first
    // check ends this launch's chance to prompt; the next cold start tries again.
    if (minimum || !landing || receivingShare || privacyPending || status === 'error') {
      settled.current = true;
      return;
    }
    if (status !== 'success') return;
    settled.current = true;
    if (data.status !== 'available' || appUpdate.getDownload().status !== 'idle') return;
    const previous = cacheService.getPersist('app_update.last_reminder');
    const now = Date.now();
    if (
      previous?.releaseId === data.id &&
      now >= previous.remindedAt &&
      now - previous.remindedAt < REMINDER_INTERVAL_MS
    )
      return;
    onOffer(data);
  }, [
    active,
    coverVisible,
    privacyPending,
    landing,
    receivingShare,
    status,
    data,
    appUpdate,
    minimum,
    onOffer,
  ]);

  // A mandatory prompt owns its visibility even when store navigation clears a voluntary offer.
  useEffect(() => {
    if (minimum && release) actions.close();
  }, [minimum, release, actions]);

  const required = minimum
    ? {
        version: minimum,
        checking: isFetching,
        recheck: () => {
          void policy.refetch();
          void queryClient.prefetchQuery(appUpdateQueryOptions(appUpdate, { force: true }));
        },
      }
    : null;
  const available =
    status === 'success' && !isFetching && data.status === 'available' ? data : null;
  return (
    <AppUpdateDialog
      actions={actions}
      release={required ? available : release}
      required={required}
    />
  );
}
