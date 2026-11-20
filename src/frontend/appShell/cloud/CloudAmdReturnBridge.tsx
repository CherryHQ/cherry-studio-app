import { useToast } from '@cherrystudio/ui/components';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { useCloud } from '@/frontend/hooks/useCloud';

import { cloudAmdReturn } from './nativeIntent';

export function CloudAmdReturnBridge() {
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const { toast } = useToast();
  const { t } = useTranslation();
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
  const pendingRefresh = useRef<{ activationAccount?: string } | undefined>(undefined);
  const refresh = useEffectEvent((activationAccount?: string) => {
    pendingRefresh.current = isSignedIn && !cloudReady ? { activationAccount } : undefined;
    if (!isSignedIn || !cloudReady) return;
    void cloud
      .refreshProvider()
      .then(() => {
        const snapshot = cloud.getState();
        if (
          activationAccount &&
          snapshot.account?.account.id === activationAccount &&
          snapshot.amd?.phase === 'ready' &&
          snapshot.amd.status.activated
        ) {
          toast.show({ label: t('cloud.amd.linked'), variant: 'success' });
        }
      })
      .catch(() => {});
  });

  useEffect(() => {
    if (!returned || !navigationReady || account.isRestoringSession || !cloudAmdReturn.consume())
      return;
    const visit = cloudAmdReturn.consumeBrowserOpen();
    if (pathname !== '/' && pathname !== '/remote') router.dismissTo('/');
    refresh(visit?.activating ? visit.accountId : undefined);
  }, [account.isRestoringSession, navigationReady, pathname, returned, router]);

  useEffect(() => {
    if (pendingRefresh.current) refresh(pendingRefresh.current.activationAccount);
  }, [cloudReady, isSignedIn]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || cloudAmdReturn.getSnapshot()) return;
      const visit = cloudAmdReturn.consumeBrowserOpen();
      if (visit) refresh(visit.activating ? visit.accountId : undefined);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
