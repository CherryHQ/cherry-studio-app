import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { consumeCloudModelTap } from '@/frontend/appShell/account';
import type { AccountState } from '@/shared/contracts/account';
import { cloudModelUnavailable, type CloudState } from '@/shared/contracts/cloud';

/** Consume the successful login destination once, after the account catalog is ready. */
export function useReturnedCloudModel({
  enabled,
  pathname,
  destination,
  state,
  account,
  resume,
}: {
  enabled: boolean;
  pathname: string;
  destination: string;
  state: CloudState;
  account: AccountState;
  resume: (id: string) => (() => void) | undefined;
}) {
  const { cloudModel, cloudReturn } = useGlobalSearchParams<{
    cloudModel?: string;
    cloudReturn?: string;
  }>();
  const activePath = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (
      typeof cloudModel !== 'string' ||
      !enabled ||
      activePath !== pathname ||
      account.isRestoringSession
    )
      return;
    const signedIn = account.isSignedIn && !account.needsSignIn && !account.isEnterprise;
    if (signedIn && (state.phase === 'loading' || state.phase === 'signed_out')) return;
    if (
      signedIn &&
      state.plansPending &&
      !state.plans &&
      cloudModelUnavailable(state, cloudModel, 'agent') === 'not_entitled' &&
      cloudModelUnavailable(state, cloudModel, 'general') === 'not_entitled'
    )
      return;
    const proceed = signedIn ? resume(cloudModel) : undefined;
    if (signedIn && !proceed) return;
    const authorized = consumeCloudModelTap(destination, cloudModel, cloudReturn);
    router.setParams({ cloudModel: undefined, cloudReturn: undefined });
    if (authorized) proceed?.();
  }, [
    account,
    activePath,
    cloudModel,
    cloudReturn,
    destination,
    enabled,
    pathname,
    resume,
    router,
    state,
  ]);
}
