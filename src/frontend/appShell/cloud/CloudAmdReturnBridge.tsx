import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { useCloud } from '@/frontend/hooks/useCloud';

import { cloudAmdReturn } from './nativeIntent';

export function CloudAmdReturnBridge() {
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const router = useRouter();
  const pathname = usePathname();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const returned = useSyncExternalStore(
    cloudAmdReturn.subscribe,
    cloudAmdReturn.getSnapshot,
    cloudAmdReturn.getSnapshot,
  );
  const isSignedIn = account.isSignedIn && !account.isEnterprise && !account.isRestoringSession;
  const cloudReady = state.phase !== 'signed_out';
  const pendingRefresh = useRef(false);
  const refresh = useEffectEvent(() => {
    // The URL only returns the user to the app. Cloud confirms the account and model state.
    pendingRefresh.current = isSignedIn && !cloudReady;
    if (isSignedIn && cloudReady) void cloud.refreshProvider().catch(() => {});
  });

  useEffect(() => {
    if (!returned || !navigationReady || account.isRestoringSession || !cloudAmdReturn.consume())
      return;
    cloudAmdReturn.consumeBrowserOpen();
    if (pathname !== '/' && pathname !== '/remote') router.dismissTo('/');
    refresh();
  }, [account.isRestoringSession, navigationReady, pathname, returned, router]);

  useEffect(() => {
    if (pendingRefresh.current) refresh();
  }, [cloudReady, isSignedIn]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        cloudAmdReturn.consumeBrowserOpen() &&
        !cloudAmdReturn.getSnapshot()
      )
        refresh();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
